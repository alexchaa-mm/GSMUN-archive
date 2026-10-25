import * as THREE from "three";
import { audio } from "../audio/audio";
import { stage } from "../config/stage";
import { findLanding } from "./collision";

// Smash-style knockback: launch speed grows with the victim's damage % and the
// move's knockback growth, softened by weight (light fighters fly farther).
export interface KnockbackResult {
  vx: number;
  vy: number;
  hitstunFrames: number;
  damage: number;
}

/** Any attack that can launch a fighter (a move hitbox or a projectile). */
export interface HitInfo {
  damage: number;
  baseKnockback: number;
  knockbackGrowth: number;
  angle: number;
}

export function computeKnockback(
  hit: HitInfo,
  victimPercentBefore: number,
  victimWeight: number,
  facing: number,
): KnockbackResult {
  const percent = victimPercentBefore + hit.damage;
  // Base magnitude in units/second.
  const magnitude =
    (hit.baseKnockback + hit.knockbackGrowth * percent) * (1.0 / victimWeight) * 0.12;
  // Forward-relative angle -> world (flip x by facing).
  const rad = (hit.angle * Math.PI) / 180;
  const vx = Math.cos(rad) * magnitude * facing;
  const vy = Math.sin(rad) * magnitude;
  const hitstunFrames = Math.round(Math.min(60, magnitude * 3));
  return { vx, vy, hitstunFrames, damage: hit.damage };
}

export function crossedBlastZone(x: number, y: number): boolean {
  const blast = stage().blast;
  return x < blast.left || x > blast.right || y < blast.bottom || y > blast.top;
}

// ---- Projectiles (Final Cutter shockwave, Inhale star) --------------------

export interface ProjectileOptions {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeSeconds: number;
  color: number;
  radius: number;
  owner?: number; // playerId that fired it (won't hit self)
  damage?: number;
  baseKnockback?: number;
  knockbackGrowth?: number;
  angle?: number;
  /**
   * How it looks. "orb" is a glowing energy ball (Charge Shot), "rocket" is a
   * bodied missile with a nose cone and exhaust, "ball" is the plain default.
   * Ignored when `model` is supplied.
   */
  shape?: "ball" | "orb" | "rocket";
  /** Secondary colour: halo for an orb, nose cone for a rocket. */
  accent?: number;
  /** A prebuilt model (e.g. a generated grenade) used as the mesh, fit to `radius`. */
  model?: THREE.Object3D;
  /**
   * Downward acceleration in units/s². Projectiles fly straight by default;
   * anything that should arc or drop (a lobbed grenade) sets this.
   */
  gravity?: number;
  /** Spin about the screen axis, radians/s. Tumbles a thrown object. */
  spin?: number;
  /**
   * Land on stage platforms instead of falling through them. Combined with
   * `explosive`, ground contact is what triggers the explosion; without it,
   * a dropped object just settles on whatever surface catches it.
   */
  landsOnPlatforms?: boolean;
  /**
   * Detonate instead of quietly disappearing: a bigger blast effect plus a
   * boom, triggered on hitting a fighter, on landing (if `landsOnPlatforms`),
   * or when its fuse (`lifeSeconds`) runs out untouched.
   */
  explosive?: boolean;
  /** Blast VFX radius. Defaults to a size scaled off the projectile's own radius. */
  explosionRadius?: number;
  /**
   * How many times it bounces off the ground before dying, instead of landing
   * or passing through. Mario's Fireball hops along the stage. Needs `gravity`
   * to arc and (like a landing projectile) uses the same platform crossing test.
   */
  bounces?: number;
  /** Fraction of vertical speed kept per bounce (0..1). Defaults to 0.7. */
  restitution?: number;
}

export class Projectile {
  mesh: THREE.Object3D;
  private fadeMats: THREE.Material[] = [];
  private exhaust: THREE.Object3D | null = null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  owner: number; // reassigned when Mario's Cape reflects and steals a projectile
  readonly damage: number;
  readonly baseKnockback: number;
  readonly knockbackGrowth: number;
  readonly angle: number;
  private readonly gravity: number;
  private readonly spin: number;
  private readonly landsOnPlatforms: boolean;
  private bounces: number;
  private readonly canBounce: boolean;
  private readonly restitution: number;
  private landed = false;
  private life: number;
  dead = false;
  readonly explosive: boolean;
  readonly explosionRadius: number;
  /** Set the instant this projectile dies from ground contact or its fuse
   *  running out, so the owner (Effects) can spawn the blast; the fighter-
   *  contact case is handled directly by CombatSystem instead, since that path
   *  already knows the exact moment of the hit. Consumed (reset to false) by
   *  whoever reads it. */
  explodePending = false;

  constructor(opts: ProjectileOptions) {
    this.x = opts.x;
    this.y = opts.y;
    this.vx = opts.vx;
    this.vy = opts.vy;
    this.radius = opts.radius;
    this.owner = opts.owner ?? 0;
    this.damage = opts.damage ?? 0;
    this.baseKnockback = opts.baseKnockback ?? 20;
    this.knockbackGrowth = opts.knockbackGrowth ?? 0.5;
    this.angle = opts.angle ?? 40;
    this.gravity = opts.gravity ?? 0;
    this.spin = opts.spin ?? 0;
    this.landsOnPlatforms = opts.landsOnPlatforms ?? false;
    this.bounces = opts.bounces ?? 0;
    this.canBounce = (opts.bounces ?? 0) > 0;
    this.restitution = opts.restitution ?? 0.7;
    this.explosive = opts.explosive ?? false;
    this.explosionRadius = opts.explosionRadius ?? opts.radius * 2.6;
    this.life = opts.lifeSeconds;
    const built = opts.model
      ? buildFromModel(opts)
      : opts.shape === "orb"
        ? buildOrb(opts)
        : opts.shape === "rocket"
          ? buildRocket(opts)
          : buildBall(opts);
    this.mesh = built.object;
    this.fadeMats = built.fadeMats;
    this.exhaust = built.exhaust ?? null;
    // Point a bodied projectile the way it is travelling.
    if (opts.shape === "rocket" && this.vx < 0) this.mesh.rotation.y = Math.PI;
    this.mesh.position.set(this.x, this.y, 0);
  }

  update(dt: number) {
    if (!this.landed) {
      if (this.gravity !== 0) this.vy -= this.gravity * dt;
      const prevY = this.y;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      if (this.landsOnPlatforms && this.vy <= 0) {
        // Treat the ball's underside as "feet" so it stops right on the deck
        // instead of sinking to its center, using the same crossing test the
        // fighter uses to land — falling onto a soft platform still catches it.
        const landing = findLanding(prevY - this.radius, this.y - this.radius, this.x, true);
        if (landing) {
          if (this.bounces > 0) {
            // Hop back up off the deck, keeping horizontal travel. Mario's
            // Fireball skips along the stage this way until its bounces run out.
            this.y = landing.topY + this.radius;
            this.vy = Math.abs(this.vy) * this.restitution;
            this.bounces -= 1;
          } else if (this.canBounce) {
            // A fireball that has used up its bounces snuffs out the moment it
            // next touches down, rather than resting on the deck.
            this.dead = true;
          } else {
            this.y = landing.topY + this.radius;
            this.vy = 0;
            this.vx = 0;
            this.landed = true;
            if (this.explosive) {
              this.dead = true;
              this.explodePending = true;
            }
          }
        }
      }
      this.mesh.position.set(this.x, this.y, 0);
      if (this.spin !== 0) this.mesh.rotation.z += this.spin * dt;
    }
    this.life -= dt;
    if (!this.dead) {
      const fuseOut = this.life <= 0;
      if (fuseOut || crossedBlastZone(this.x, this.y)) {
        this.dead = true;
        // A fuse running out still detonates; falling into the void doesn't.
        if (this.explosive && fuseOut) this.explodePending = true;
      }
    }
    // Stay solid, then fade over the final ~0.35s of life.
    const alpha = Math.min(1, this.life * 3);
    for (const m of this.fadeMats) (m as THREE.MeshBasicMaterial).opacity = alpha;
    if (this.exhaust) {
      // Flicker the flame so the missile reads as thrusting, not gliding.
      const f = 0.75 + Math.random() * 0.5;
      this.exhaust.scale.set(f, 1, 1);
    }
  }

  dispose() {
    this.mesh.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    });
  }
}

interface BuiltProjectile {
  object: THREE.Object3D;
  fadeMats: THREE.Material[];
  exhaust?: THREE.Object3D;
}

/** Use a supplied model (already cloned by the caller) as the projectile mesh. */
function buildFromModel(opts: ProjectileOptions): BuiltProjectile {
  const obj = opts.model!;
  // Normalise to the requested radius regardless of the model's authored size.
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  obj.scale.multiplyScalar((opts.radius * 2) / maxDim);
  obj.traverse((o) => (o.frustumCulled = false));
  // Collect materials so the projectile can fade them out at end of life.
  const fadeMats: THREE.Material[] = [];
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      m.transparent = true;
      fadeMats.push(m);
    }
  });
  return { object: obj, fadeMats };
}

function buildBall(opts: ProjectileOptions): BuiltProjectile {
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color,
    emissive: opts.color,
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: 0.9,
  });
  return { object: new THREE.Mesh(new THREE.SphereGeometry(opts.radius, 16, 12), mat), fadeMats: [mat] };
}

/**
 * Charge Shot: a white-hot core inside a light-blue halo. The games render it
 * light blue rather than the yellow of the Metroid titles.
 */
function buildOrb(opts: ProjectileOptions): BuiltProjectile {
  const group = new THREE.Group();
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(opts.radius * 0.55, 16, 12), coreMat);

  const haloMat = new THREE.MeshBasicMaterial({
    color: opts.accent ?? opts.color,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(opts.radius, 18, 14), haloMat);

  // A stretched outer glow trails behind the ball as it flies.
  const trailMat = new THREE.MeshBasicMaterial({
    color: opts.accent ?? opts.color,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const trail = new THREE.Mesh(new THREE.SphereGeometry(opts.radius, 14, 10), trailMat);
  trail.scale.set(2.1, 0.62, 0.62);

  group.add(trail, halo, core);
  return { object: group, fadeMats: [coreMat, haloMat, trailMat] };
}

/** Missile: rocket body with a coloured nose cone and a burning exhaust. */
function buildRocket(opts: ProjectileOptions): BuiltProjectile {
  const group = new THREE.Group();
  const r = opts.radius;

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd9dde6, roughness: 0.5, transparent: true, opacity: 0.95 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, r * 2.6, 12), bodyMat);
  body.rotation.z = -Math.PI / 2; // lie along +x, the direction of travel

  const noseMat = new THREE.MeshStandardMaterial({
    color: opts.accent ?? 0x9b5bd6,
    emissive: opts.accent ?? 0x9b5bd6,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.95,
  });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(r * 0.58, r * 1.2, 12), noseMat);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = r * 1.9;

  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xffc861,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(r * 0.5, r * 2.2, 10), flameMat);
  flame.rotation.z = Math.PI / 2; // points backwards
  flame.position.x = -r * 2.2;
  const exhaust = new THREE.Group();
  exhaust.add(flame);

  group.add(body, nose, exhaust);
  return { object: group, fadeMats: [bodyMat, noseMat, flameMat], exhaust };
}

interface Decal {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  grow: number;
  baseOpacity: number;
}

export class Effects {
  projectiles: Projectile[] = [];
  private sparks: { mesh: THREE.Mesh; life: number; max: number }[] = [];
  private decals: Decal[] = [];
  private droplets: { mesh: THREE.Mesh; vx: number; vy: number; life: number; max: number }[] = [];

  constructor(private scene: THREE.Scene) {}

  addProjectile(opts: ProjectileOptions) {
    const p = new Projectile(opts);
    this.projectiles.push(p);
    this.scene.add(p.mesh);
  }

  /** Brief translucent flash where an attack's hitbox is active. */
  spark(x: number, y: number, r: number, color = 0xffffff) {
    const geo = new THREE.SphereGeometry(r, 12, 10);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, 0.2);
    this.scene.add(mesh);
    this.sparks.push({ mesh, life: 0.12, max: 0.12 });
  }

  /**
   * A crescent "swing arc" trail. `angle` is the outward direction of the
   * strike; `plane` = "screen" draws it facing the camera, "ground" lays it
   * flat (horizontal, for sideways swings) to read as 3D.
   */
  slash(
    x: number,
    y: number,
    angle: number,
    radius = 0.95,
    color = 0xfff2b0,
    plane: "screen" | "ground" = "screen",
  ) {
    const geo = new THREE.TorusGeometry(radius, 0.11, 8, 20, Math.PI * 1.15);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, plane === "ground" ? 0 : 0.3);
    if (plane === "ground") {
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = angle - Math.PI * 0.575;
    } else {
      mesh.rotation.z = angle - Math.PI * 0.575;
    }
    this.scene.add(mesh);
    this.decals.push({ mesh, life: 0.16, max: 0.16, grow: 0.9, baseOpacity: 0.8 });
  }

  /** Expanding shockwave ring, e.g. a Stone slam or a KO burst. */
  ring(x: number, y: number, color = 0xffffff, radius = 0.5) {
    const geo = new THREE.TorusGeometry(radius, 0.09, 8, 28);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, 0.2);
    this.scene.add(mesh);
    this.decals.push({ mesh, life: 0.3, max: 0.3, grow: 3.5, baseOpacity: 0.7 });
  }

  /**
   * Water impact: an expanding ring on the surface plus a burst of droplets
   * that arc up and fall back. `power` scales the whole thing, so a hard
   * entry reads bigger than a swimming stroke.
   */
  splash(x: number, surfaceY: number, power = 1) {
    this.ring(x, surfaceY, 0xdff3ff, 0.34 * power);
    const count = Math.round(9 * power);
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.07 + Math.random() * 0.07 * power, 6, 5);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xeaf8ff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x + (Math.random() - 0.5) * 0.7, surfaceY, (Math.random() - 0.5) * 0.5);
      this.scene.add(mesh);
      this.droplets.push({
        mesh,
        vx: (Math.random() - 0.5) * 6.5 * power,
        vy: (2.8 + Math.random() * 4.5) * power,
        life: 0.55 + Math.random() * 0.3,
        max: 0.85,
      });
    }
  }

  /**
   * A grenade/bomb detonation: a bright core flash, an expanding shockwave
   * ring, and fiery shrapnel that flies outward and falls. Shares the water
   * splash's droplet physics, just hotter-colored and faster.
   */
  explosion(x: number, y: number, radius = 1) {
    this.ring(x, y, 0xffcf7a, radius * 0.9);
    this.spark(x, y, radius * 0.7, 0xfff3d0);
    const count = Math.round(14 * radius);
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const speed = (3 + Math.random() * 5) * radius;
      const geo = new THREE.SphereGeometry(0.05 + Math.random() * 0.09 * radius, 6, 5);
      const mat = new THREE.MeshBasicMaterial({
        color: Math.random() < 0.5 ? 0xff8a3d : 0xffe08a,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, (Math.random() - 0.5) * 0.5);
      this.scene.add(mesh);
      this.droplets.push({
        mesh,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed * 0.6 + 1.5,
        life: 0.4 + Math.random() * 0.3,
        max: 0.7,
      });
    }
  }

  update(dt: number) {
    for (const d of this.droplets) {
      d.vy -= 26 * dt; // droplets are light; they arc fast
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.life -= dt;
      (d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (d.life / d.max) * 0.9);
    }
    for (const d of this.droplets.filter((d) => d.life <= 0)) {
      this.scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      (d.mesh.material as THREE.Material).dispose();
    }
    this.droplets = this.droplets.filter((d) => d.life > 0);

    for (const d of this.decals) {
      d.life -= dt;
      const t = Math.max(0, d.life / d.max);
      (d.mesh.material as THREE.MeshBasicMaterial).opacity = d.baseOpacity * t;
      d.mesh.scale.setScalar(1 + (1 - t) * d.grow);
    }
    for (const d of this.decals.filter((d) => d.life <= 0)) {
      this.scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      (d.mesh.material as THREE.Material).dispose();
    }
    this.decals = this.decals.filter((d) => d.life > 0);

    for (const p of this.projectiles) p.update(dt);
    // Ground-contact and fuse-timeout detonations are flagged by the
    // projectile itself; the fighter-contact case is triggered directly by
    // CombatSystem, which knows the exact moment of the hit.
    for (const p of this.projectiles) {
      if (!p.explodePending) continue;
      p.explodePending = false;
      this.explosion(p.x, p.y, p.explosionRadius);
      audio.sfx("explode");
    }
    for (const p of this.projectiles.filter((p) => p.dead)) {
      this.scene.remove(p.mesh);
      p.dispose();
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);

    for (const s of this.sparks) {
      s.life -= dt;
      const t = Math.max(0, s.life / s.max);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.35 * t;
      s.mesh.scale.setScalar(1 + (1 - t) * 0.6);
    }
    for (const s of this.sparks.filter((s) => s.life <= 0)) {
      this.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      (s.mesh.material as THREE.Material).dispose();
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
  }
}

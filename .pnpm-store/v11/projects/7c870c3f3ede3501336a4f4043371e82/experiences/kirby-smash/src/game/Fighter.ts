import * as THREE from "three";
import { loadMintModel } from "../assets/loadModel";
import { totalFrames } from "../config/moves";
import type { MoveId, MoveSpec } from "../config/moves";
import { CHARACTERS, DEFAULT_CHARACTER_ID } from "../config/characters";
import type { AnimRole, CharacterDef } from "../config/characters";
import { CharacterAnimator } from "./CharacterAnimator";
import { stage } from "../config/stage";
import type { PlatformDef, WaterDef } from "../config/stage";
import { audio } from "../audio/audio";
import { attackPose } from "./attackAnim";
import { computeKnockback, crossedBlastZone, Effects } from "./combat";
import type { HitInfo } from "./combat";
import { findLanding, findSolidCeiling, groundBelow, overPlatform } from "./collision";
import { FighterProps } from "./FighterProps";
import { placeBottomCenter, poseForMeasurement, scaleToHeight } from "../util/modelFit";
import type { Controller } from "../engine/Input";

// Kirby-like fighter: light, floaty, and multi-jump. Physics lives on the z=0
// plane; `y` is the FEET height. Center (for hitboxes / blast zones) is
// y + HEIGHT/2.

const FIGHTER = {
  height: 1.15,
  halfWidth: 0.5,
  walkSpeed: 5.4,
  runSpeed: 10.5,
  airSpeed: 6.6,
  groundAccel: 72,
  airAccel: 34,
  friction: 42,
  gravity: 32,
  airDrag: 7,
  maxFall: 15,
  fastFall: 28,
  jumpVel: 16.0,
  airJumpVel: 11.6,
  maxAirJumps: 5,
  jumpSquat: 4,
  weight: 0.72,
  cutterRise: 13.5,
  stoneFall: 22,
};

// Swimming, on stages with water. The fighter always sinks; every stroke is a
// deliberate press. Near the surface a stroke becomes a leap big enough to
// clear the main deck, so escaping is about working your way up and then
// timing the exit — not about holding a key.
const SWIM = {
  speed: 3.6, // paddling is much slower than walking
  accel: 20,
  stroke: 6.8, // upward push while submerged
  leap: 15.0, // surface breach; clears a deck ~3 units above the waterline
  surfaceBand: 1.0, // how far below the surface still counts as "at" it
  // Idle sinking is gentle on purpose: it has to be slower than the drown
  // clock, or a fighter reaches the KO line before ever running out of breath
  // and the whole stamina mechanic is dead code.
  sink: 1.0,
  sinkExhausted: 7.0, // once the drown timer runs out, down you go hard
  sinkAccel: 9,
  drag: 3.2, // bleeds off knockback taken while in the water
};

// 3/4 turn (not full profile) so the face stays toward the camera while still
// reading left/right. 0 would face the camera dead-on.
const FACE_YAW = Math.PI * 0.3;

type State =
  | "idle"
  | "walk"
  | "run"
  | "jumpsquat"
  | "air"
  | "attack"
  | "charge"
  | "inhale"
  | "stone"
  | "hitstun"
  | "swim"
  | "dead";

interface ActiveMove {
  move: MoveSpec;
  frame: number;
  chargeMult: number;
}

function approach(cur: number, target: number, rate: number): number {
  return cur < target ? Math.min(cur + rate, target) : Math.max(cur - rate, target);
}


/**
 * Fresnel rim shell: brightest where the surface turns away from the camera,
 * so it reads as a blue outline tracing the fighter rather than a bubble
 * painted over them. A plain additive sphere blows out to white against a
 * bright sky; this keeps its colour because only the edges accumulate.
 */
function makeChargeAura(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(0.62, 24, 18);
  geo.scale(0.84, 1.14, 0.84); // closer to a body than a ball
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x49b6ff) },
      uOpacity: { value: 0.9 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        rim = pow(rim, 2.6);                       // tighten to the silhouette
        gl_FragColor = vec4(uColor, rim * uOpacity);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Mesh(geo, mat);
}

/** Above this horizontal speed a rigged fighter shows the run cycle. */
const RUN_ANIM_SPEED = 6.2;

/** Shortest an attack animation may be squeezed to, in seconds. */
const MIN_ATTACK_ANIM = 0.34;

// Real seconds for one full locomotion cycle at reference speed. Scaled by
// actual/reference speed at runtime so the stride keeps pace with travel.
const WALK_CYCLE_SEC = 0.72;
const RUN_CYCLE_SEC = 0.5;

// The generated grenade model for Samus's bomb, loaded once and cloned per
// throw. Kicked off when a Samus fighter is built; until it resolves, layBomb
// falls back to a plain sphere.
let grenadeModel: THREE.Object3D | null = null;
let grenadeLoading = false;
function preloadGrenade() {
  if (grenadeModel || grenadeLoading) return;
  grenadeLoading = true;
  loadMintModel("grenade")
    .then((m) => {
      if (m) grenadeModel = m;
    })
    .catch((err) => console.warn("grenade model failed to load", err))
    .finally(() => {
      grenadeLoading = false;
    });
}

// The generated fireball model for Mario's Fireball, loaded once and cloned per
// shot. Kicked off when a Mario fighter is built; until it resolves, the shot
// falls back to a plain orange ball.
let fireballModel: THREE.Object3D | null = null;
let fireballLoading = false;
function preloadFireball() {
  if (fireballModel || fireballLoading) return;
  fireballLoading = true;
  loadMintModel("fireball")
    .then((m) => {
      if (m) fireballModel = m;
    })
    .catch((err) => console.warn("fireball model failed to load", err))
    .finally(() => {
      fireballLoading = false;
    });
}

export interface FighterOptions {
  playerId: number;
  /** Starting character; swap later with setCharacter(). */
  character?: CharacterDef;
  /** Which side of centre this fighter starts on: -1 left, +1 right. The
   *  distance out comes from the active stage, so each map can spread its
   *  spawns to suit its own platform layout. */
  side: -1 | 1;
  /**
   * Placeholder-sphere colour, used only when a character's model fails to
   * load. Real models always render their authored colours, so a mirror match
   * shows two identical fighters; the floating P1/P2 tags and the HUD panels
   * are what tell them apart.
   */
  placeholderColor?: number;
}

export class Fighter {
  readonly playerId: number;
  private readonly side: -1 | 1;
  private readonly placeholderColor: number | undefined;
  private char: CharacterDef;
  private animator: CharacterAnimator | null = null;
  /** Charge Shot energy banked between uses, 0..1. Samus only. */
  private storedCharge = 0;

  /** The active character's frame data. */
  private get moves() {
    return this.char.moves;
  }

  get character(): CharacterDef {
    return this.char;
  }

  x: number;
  y = stage().spawn.y;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;
  damage = 0;

  state: State = "air";
  private grounded = false;
  private currentPlatform: PlatformDef | null = null;
  private airJumps = FIGHTER.maxAirJumps;
  private move: ActiveMove | null = null;
  private chargeMoveId: MoveId | null = null;
  private chargeFrames = 0;
  private jumpsquatTimer = 0;
  private dropThroughTimer = 0;
  private fastFalling = false;
  private invulnTimer = 0;
  private running = false;
  private spawnShockOnLand = false;
  private stoneLanded = false;
  private stoneLandFrames = 0;
  private hitstun = 0;
  private hitlag = 0;
  private moveHits = new Set<number>();
  private swimming = false;
  private swimTime = 0;
  private bubbleTimer = 0;
  /** Set when a fresh action begins, so a repeat of the same clip replays. */
  private animRestart = false;

  readonly root = new THREE.Group();
  private readonly pivot = new THREE.Group(); // rotates about the body center
  private shadow: THREE.Mesh;
  /** Blue glow shell shown while a full Charge Shot is banked. */
  private chargeAura: THREE.Mesh;
  private cannonFlash = 0;
  private props: FighterProps;
  private model: THREE.Object3D | null = null;
  private modelBaseY = 0;

  // Procedural squash/stretch animation state (Kirby-style, no skeleton).
  private animT = 0;
  private aScaleX = 1;
  private aScaleY = 1;
  private aBob = 0;
  private aRotZ = 0;
  private aSpinY = 0;
  private aLungeX = 0;
  private aLungeY = 0;
  private landSquashT = 0;

  constructor(scene: THREE.Scene, opts: FighterOptions) {
    this.playerId = opts.playerId;
    this.side = opts.side;
    this.placeholderColor = opts.placeholderColor;
    this.char = opts.character ?? CHARACTERS[DEFAULT_CHARACTER_ID];
    this.x = stage().spawn.x * opts.side;
    this.facing = opts.side < 0 ? 1 : -1; // always start turned toward the opponent

    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.pivot.position.y = FIGHTER.height / 2; // spin/flip pivot at body center
    this.root.add(this.pivot);
    this.chargeAura = makeChargeAura();
    this.chargeAura.visible = false;
    this.root.add(this.chargeAura);
    this.props = new FighterProps(scene);
    scene.add(this.shadow);
    scene.add(this.root);
  }

  async load() {
    await this.buildModel();
  }

  /** Swap to another character between matches, reloading its art. */
  async setCharacter(def: CharacterDef) {
    if (def.id === this.char.id) return;
    this.char = def;
    this.move = null;
    this.chargeMoveId = null;
    this.storedCharge = 0;
    await this.buildModel();
  }

  private async buildModel() {
    // Keep the aura wrapped around whatever body this character has.
    const vs = this.char.visualScale ?? 1;
    this.chargeAura.scale.setScalar(vs);
    this.chargeAura.position.y = (FIGHTER.height * vs) / 2;

    // Drop whatever the previous character left behind.
    if (this.animator) {
      this.animator.dispose();
      this.animator = null;
    }
    if (this.model) {
      this.model.parent?.remove(this.model);
      this.model = null;
    }

    const half = FIGHTER.height / 2;

    if (this.char.id === "samus") preloadGrenade(); // ready before her first bomb
    if (this.char.id === "mario") preloadFireball(); // ready before his first fireball

    if (this.char.animation) {
      try {
        const animator = await CharacterAnimator.create(this.char.animation);
        const root = animator.root;
        if (this.char.modelYaw) root.rotation.y = this.char.modelYaw; // before the fit
        poseForMeasurement(root); // skinned bounds are meaningless until posed
        // Cosmetic scale grows the model upward from the feet; the hurtbox is
        // still FIGHTER.height, so a taller look costs nothing defensively.
        scaleToHeight(root, FIGHTER.height * (this.char.visualScale ?? 1));
        placeBottomCenter(root, 0, -half, 0);
        this.pivot.add(root);
        this.model = root;
        this.modelBaseY = root.position.y;
        this.animator = animator;
        animator.play("idle");
        return;
      } catch (err) {
        console.warn(`${this.char.id} rig failed to load; using placeholder`, err);
      }
    } else {
      let model: THREE.Object3D | null = null;
      try {
        model = await loadMintModel(this.char.modelKey);
      } catch (err) {
        console.warn(`${this.char.modelKey} model failed to load; using placeholder`, err);
      }
      if (model) {
        scaleToHeight(model, FIGHTER.height);
        // Pivot sits at body center (root y = half); feet at pivot-local -half.
        placeBottomCenter(model, 0, -half, 0);
        this.pivot.add(model);
        this.model = model;
        this.modelBaseY = model.position.y; // preserve feet-alignment offset
        return;
      }
    }

    const geo = new THREE.SphereGeometry(half, 24, 18); // centered on the pivot
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: this.placeholderColor ?? 0xff9ecb, roughness: 0.6 }),
    );
    this.pivot.add(mesh);
    this.model = mesh;
    this.modelBaseY = 0;
  }

  get centerY() {
    return this.y + FIGHTER.height / 2;
  }

  get invulnerable() {
    return this.invulnTimer > 0 || this.state === "stone";
  }

  // ---- Combat interface (used by CombatSystem) ----
  getHurtbox() {
    return { x: this.x, y: this.centerY, r: 0.55 };
  }

  /** World-space hitboxes active on the current frame of the current move. */
  activeHitboxes(): { x: number; y: number; r: number; facing: number; info: HitInfo }[] {
    const m = this.move;
    if (!m || (this.state !== "attack" && this.state !== "stone")) return [];
    const out = [];
    const mult = m.chargeMult;
    for (const hb of m.move.hitboxes) {
      if (m.frame >= hb.start && m.frame <= hb.end) {
        // A charged move hits harder and reaches slightly further. Cloning the
        // info keeps the shared frame data in config/ immutable.
        const info: HitInfo =
          mult === 1
            ? (hb as HitInfo)
            : {
                damage: hb.damage * mult,
                baseKnockback: hb.baseKnockback * mult,
                knockbackGrowth: hb.knockbackGrowth,
                angle: hb.angle,
              };
        out.push({
          x: this.x + this.facing * hb.x,
          y: this.centerY + hb.y,
          r: hb.r * (1 + (mult - 1) * 0.25),
          facing: this.facing,
          info,
        });
      }
    }
    return out;
  }

  hasHit(playerId: number) {
    return this.moveHits.has(playerId);
  }
  markHit(playerId: number) {
    this.moveHits.add(playerId);
  }

  applyHit(info: HitInfo, attackerFacing: number, effects: Effects): boolean {
    if (this.invulnerable || this.state === "dead") return false;
    const kb = computeKnockback(info, this.damage, FIGHTER.weight, attackerFacing);
    this.damage += info.damage;
    this.vx = kb.vx;
    this.vy = kb.vy;
    this.hitstun = Math.max(kb.hitstunFrames, 8);
    this.hitlag = Math.min(12, 3 + Math.floor(info.damage * 0.6));
    this.state = "hitstun";
    this.animRestart = true;
    this.grounded = false;
    this.currentPlatform = null;
    this.move = null;
    this.chargeMoveId = null; // interrupts a wind-up; storedCharge is kept
    this.fastFalling = false;
    effects.spark(this.x, this.centerY, 0.7, 0xffffff);
    effects.ring(this.x, this.centerY, 0xfff2b0, 0.4);
    return true;
  }

  respawn() {
    this.x = stage().spawn.x * this.side;
    this.y = stage().spawn.y;
    this.vx = 0;
    this.vy = 0;
    this.facing = this.side < 0 ? 1 : -1;
    this.damage = 0;
    this.state = "air";
    this.grounded = false;
    this.currentPlatform = null;
    this.airJumps = FIGHTER.maxAirJumps;
    this.move = null;
    this.chargeMoveId = null;
    this.fastFalling = false;
    this.spawnShockOnLand = false;
    this.stoneLanded = false;
    this.hitstun = 0;
    this.hitlag = 0;
    this.moveHits.clear();
    this.swimming = false;
    this.swimTime = 0;
    this.storedCharge = 0; // a KO empties the cannon
    this.invulnTimer = 2.0;
  }

  /** True the moment the fighter's center leaves the stage (a KO). */
  isOffStage(): boolean {
    return crossedBlastZone(this.x, this.centerY);
  }

  freeze() {
    this.state = "dead";
    this.vx = 0;
    this.vy = 0;
  }

  update(input: Controller, dt: number, effects: Effects) {
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.dropThroughTimer > 0) this.dropThroughTimer -= dt;
    if (this.state === "dead") {
      this.syncTransform();
      return;
    }
    // Hitlag: brief freeze on being hit, for impact.
    if (this.hitlag > 0) {
      this.hitlag -= 1;
      this.animate(dt);
      this.syncTransform();
      return;
    }

    // A banked full charge sparks at the business end — Samus's cannon
    // flashes, DK's wound-up fist smokes — the tell the games use for "loaded".
    if (this.storedCharge >= 1) {
      this.cannonFlash -= dt;
      if (this.cannonFlash <= 0) {
        this.cannonFlash = 0.2;
        effects.spark(this.x + this.facing * 0.95, this.centerY + 0.1, 0.2, this.chargeTint);
      }
    }

    // Water replaces normal locomotion outright on stages that have it.
    const water = stage().water;
    if (water && this.y < water.surfaceY) {
      this.swim(water, input, dt, effects);
      this.animate(dt);
      this.syncTransform();
      return;
    }
    if (this.swimming) this.leaveWater();

    this.handleActions(input, effects);
    // Face the way you move while freely moving (not locked mid-attack).
    if (this.actionable() && input.moveX !== 0) {
      this.facing = input.moveX > 0 ? 1 : -1;
    }
    this.applyHorizontal(input, dt);
    this.tickTimers(input, effects);

    // Gravity
    if (!this.grounded) {
      this.vy -= FIGHTER.gravity * dt;
      const cap = this.fastFalling ? FIGHTER.fastFall : FIGHTER.maxFall;
      if (this.vy < -cap) this.vy = -cap;
    }

    // Integrate + resolve landing
    const prevFeetY = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.vy <= 0) {
      const softAllowed = this.dropThroughTimer <= 0;
      const land = findLanding(prevFeetY, this.y, this.x, softAllowed);
      if (land) {
        this.y = land.topY;
        this.vy = 0;
        this.land(land.platform, effects);
      }
    } else {
      // Rising: bonk on the underside of a solid platform (can't pass through).
      const ceil = findSolidCeiling(prevFeetY, this.y, this.x, FIGHTER.height);
      if (ceil !== null) {
        this.y = ceil - FIGHTER.height;
        this.vy = 0;
      }
    }

    // Walk off an edge
    if (this.grounded && this.currentPlatform && !overPlatform(this.currentPlatform, this.x)) {
      this.grounded = false;
      this.currentPlatform = null;
      if (this.state === "idle" || this.state === "walk" || this.state === "run") {
        this.state = "air";
      }
    }

    if (this.state === "hitstun") {
      this.hitstun -= 1;
      if (this.hitstun <= 0) this.state = this.grounded ? "idle" : "air";
    }

    this.advance(effects);
    this.normalizeLocomotion();
    this.animate(dt);
    this.syncTransform();
  }

  /**
   * One frame of swimming. Entering cancels whatever the fighter was doing and
   * kills most of their momentum — the water is a reprieve from a bad launch,
   * but the drown clock starts immediately.
   */
  private swim(water: WaterDef, input: Controller, dt: number, effects: Effects) {
    if (!this.swimming) {
      this.swimming = true;
      this.swimTime = 0;
      this.state = "swim";
      this.move = null;
      this.chargeMoveId = null;
      this.grounded = false;
      this.currentPlatform = null;
      this.fastFalling = false;
      this.spawnShockOnLand = false;
      this.stoneLanded = false;
      this.moveHits.clear();
      // Scale the entry splash with how hard they hit the surface.
      const impact = Math.min(2.2, 0.8 + Math.abs(this.vy) / 9);
      effects.splash(this.x, water.surfaceY, impact);
      audio.sfx("splash");
      this.vy = Math.max(this.vy, -5); // water arrests a fast fall
      this.vx *= 0.35;
    }
    this.swimTime += dt;
    const exhausted = this.swimTime >= water.drownSeconds;

    // Running out of breath: a quickening stream of bubbles warns before the
    // drop, so going under never arrives without notice.
    const urgency = this.swimTime / water.drownSeconds;
    if (urgency > 0.55) {
      this.bubbleTimer -= dt;
      if (this.bubbleTimer <= 0) {
        this.bubbleTimer = 0.24 - 0.15 * Math.min(1, (urgency - 0.55) / 0.45);
        effects.spark(this.x + (Math.random() - 0.5) * 0.5, this.y + 0.55, 0.11, 0xdff3ff);
      }
    }

    if (this.hitstun > 0) {
      // Knocked into or around inside the water: ride it out, heavily damped.
      this.hitstun -= 1;
      this.vx = approach(this.vx, 0, SWIM.drag * dt);
      this.vy = approach(this.vy, -SWIM.sink, SWIM.drag * dt);
    } else {
      this.state = "swim";
      if (input.moveX !== 0) this.facing = input.moveX > 0 ? 1 : -1;
      this.vx = approach(this.vx, input.moveX * SWIM.speed, SWIM.accel * dt);

      if (!exhausted && (input.pressed("up") || input.pressed("jump"))) {
        // At the surface a stroke becomes a breach; deeper down it's a push.
        const atSurface = this.y > water.surfaceY - SWIM.surfaceBand;
        this.vy = atSurface ? SWIM.leap : SWIM.stroke;
        effects.splash(this.x, Math.min(this.y, water.surfaceY), atSurface ? 1.1 : 0.5);
        audio.sfx("stroke");
      } else {
        const rate = exhausted ? SWIM.sinkExhausted : SWIM.sink;
        this.vy = approach(this.vy, -rate, SWIM.sinkAccel * dt);
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  /** Breaking the surface hands control back to the normal air state. */
  private leaveWater() {
    this.swimming = false;
    this.swimTime = 0;
    // Treat the surface like ground for jump purposes, so a clean escape has a
    // real chance of making it back to a ledge.
    this.airJumps = FIGHTER.maxAirJumps;
    if (this.state === "swim") this.state = "air";
  }

  private actionable() {
    return (
      this.state === "idle" ||
      this.state === "walk" ||
      this.state === "run" ||
      this.state === "air"
    );
  }

  private handleActions(input: Controller, effects: Effects) {
    // Inhale spit / stone cancel are allowed outside the normal actionable set.
    if (
      this.state === "inhale" &&
      this.move &&
      this.move.frame > this.moves.neutralB.startup &&
      (input.pressed("attack") || input.pressed("special"))
    ) {
      effects.addProjectile({
        owner: this.playerId,
        damage: 6,
        baseKnockback: 22,
        knockbackGrowth: 0.4,
        angle: 35,
        x: this.x + this.facing * 0.9,
        y: this.centerY,
        vx: this.facing * 14,
        vy: 0,
        lifeSeconds: 1.1,
        color: 0xffe08a,
        radius: 0.35,
      });
      this.endMove();
      return;
    }
    if (this.state === "stone" && this.stoneLanded && input.pressed("special")) {
      this.revertStone();
      return;
    }
    if (!this.actionable()) return;

    // Drop through a soft platform: tap Down (unless attacking, so down-tilt /
    // down-smash / Stone still work).
    if (
      this.grounded &&
      this.currentPlatform &&
      !this.currentPlatform.solid &&
      input.pressed("down") &&
      !input.pressed("attack") &&
      !input.pressed("special")
    ) {
      this.grounded = false;
      this.currentPlatform = null;
      this.dropThroughTimer = 0.22;
      this.y -= 0.06;
      this.state = "air";
      return;
    }

    // Jump / multi-jump: dedicated jump key or Up (tap-jump).
    if (input.pressed("up") || input.pressed("jump")) {
      if (this.grounded) {
        this.state = "jumpsquat";
        this.jumpsquatTimer = FIGHTER.jumpSquat;
        audio.sfx("jump");
        return;
      }
      if (this.state === "air" && this.airJumps > 0) {
        this.vy = FIGHTER.airJumpVel;
        this.airJumps -= 1;
        this.fastFalling = false;
        effects.spark(this.x, this.y + 0.1, 0.5, 0xffffff);
        audio.sfx("jump");
        return;
      }
    }

    // Fast fall
    if (this.state === "air" && this.vy < 0 && input.isHeld("down") && !this.fastFalling) {
      this.vy = -FIGHTER.fastFall;
      this.fastFalling = true;
    }

    // Attacks (A) and A+B side smash
    if (input.pressed("attack")) {
      if (input.pressed("special")) {
        this.beginMove("fsmash", effects);
      } else if (this.grounded) {
        this.beginMove(this.chooseGroundAttack(input), effects);
      } else {
        this.beginMove(this.chooseAirAttack(input), effects);
      }
      return;
    }

    // Specials (B)
    if (input.pressed("special")) {
      this.beginSpecial(input, effects);
    }
  }

  private chooseGroundAttack(input: Controller): MoveId {
    const up = input.isHeld("up");
    const down = input.isHeld("down");
    const hor = input.moveX;
    if (this.running && hor !== 0 && !up && !down) return "dashAttack";
    if (up && input.tappedForSmash("up")) return "usmash";
    if (down && input.tappedForSmash("down")) return "dsmash";
    if (hor !== 0 && (input.tappedForSmash("right") || input.tappedForSmash("left"))) {
      this.facing = hor > 0 ? 1 : -1;
      return "fsmash";
    }
    if (up) return "utilt";
    if (down) return "dtilt";
    if (hor !== 0) {
      this.facing = hor > 0 ? 1 : -1;
      return "ftilt";
    }
    return "jab";
  }

  private chooseAirAttack(input: Controller): MoveId {
    if (input.isHeld("up")) return "uair";
    if (input.isHeld("down")) return "dair";
    const hor = input.moveX;
    if (hor !== 0) return hor === this.facing ? "fair" : "bair";
    return "nair";
  }

  private beginSpecial(input: Controller, effects: Effects) {
    const up = input.isHeld("up");
    const down = input.isHeld("down");
    const hor = input.moveX;
    if (hor !== 0 && !up && !down) this.facing = hor > 0 ? 1 : -1;

    if (this.char.id === "samus") {
      if (up) this.startScrewAttack();
      else if (down) this.startMove(this.moves.downB, 1); // bomb drops on its active frame
      else if (hor !== 0) this.startMove(this.moves.sideB, 1); // missile
      else this.startChargeShot();
      return;
    }

    if (this.char.id === "dk") {
      if (up) this.startSpinningKong();
      else if (down) this.startMove(this.moves.downB, 1); // Hand Slap
      else if (hor !== 0) this.startHeadbutt();
      else this.startGiantPunch();
      return;
    }

    if (this.char.id === "mario") {
      if (up) this.startSuperJumpPunch();
      else if (down) this.startMove(this.moves.downB, 1); // F.L.U.D.D. water shove
      else if (hor !== 0) this.startMove(this.moves.sideB, 1); // Cape
      else this.startMove(this.moves.neutralB, 1); // Fireball
      return;
    }

    if (up) this.startFinalCutter();
    else if (down) this.startStone();
    else if (hor !== 0) this.startMove(this.moves.sideB, 1);
    else this.startInhale();
    void effects;
  }

  // ---- Samus specials ------------------------------------------------------

  /**
   * Charge Shot, two-press: the first Special winds the cannon all the way to
   * full and holds it there (the shot is banked, cannon flashing), the next
   * Special fires it. It only ever fires at full power. Getting hit mid-wind
   * interrupts it but keeps whatever charge was banked.
   */
  private startChargeShot() {
    if (this.storedCharge >= 1) {
      this.startMove(this.moves.neutralB, 1); // banked and ready: let it go
      return;
    }
    this.state = "charge";
    this.chargeMoveId = "neutralB";
    this.chargeFrames = 0;
  }

  private startScrewAttack() {
    this.move = { move: this.moves.upB, frame: 0, chargeMult: 1 };
    this.state = "attack";
    this.vy = FIGHTER.cutterRise;
    this.grounded = false;
    this.currentPlatform = null;
    this.fastFalling = false;
    this.moveHits.clear();
    audio.sfx("swing");
  }

  /**
   * The Charge Shot: a light-blue energy ball whose size, speed, damage and
   * knockback all scale with however much was wound up. A snap shot is a small
   * poke; a full one is a kill move.
   */
  private fireChargeShot(effects: Effects) {
    const c = this.storedCharge;
    this.storedCharge = 0;
    this.cannonFlash = 0;
    const radius = 0.2 + 0.42 * c;
    effects.addProjectile({
      owner: this.playerId,
      damage: 4 + 20 * c,
      baseKnockback: 18 + 42 * c,
      knockbackGrowth: 0.35 + 0.55 * c,
      angle: 40,
      x: this.x + this.facing * 0.95,
      y: this.centerY + 0.1,
      vx: this.facing * (13 + 7 * c),
      vy: 0,
      lifeSeconds: 1.6,
      shape: "orb",
      color: 0xffffff,
      accent: 0x7fdcff, // light blue, as the games render it
      radius,
    });
    audio.sfx("swing");
    effects.ring(this.x + this.facing * 0.95, this.centerY + 0.1, 0x9fe8ff, radius + 0.1);
    effects.spark(this.x + this.facing * 0.95, this.centerY + 0.1, radius + 0.2, 0xbff6ff);
  }

  private fireMissile(effects: Effects) {
    effects.addProjectile({
      owner: this.playerId,
      damage: 10,
      baseKnockback: 26,
      knockbackGrowth: 0.55,
      angle: 35,
      x: this.x + this.facing * 0.95,
      y: this.centerY,
      vx: this.facing * 9.5,
      vy: 0,
      lifeSeconds: 2.0,
      shape: "rocket",
      color: 0xd9dde6,
      accent: 0x9b5bd6, // purple nose cone
      radius: 0.26,
    });
    audio.sfx("swing");
    effects.spark(this.x + this.facing * 0.8, this.centerY, 0.3, 0xffd9a0);
  }

  /**
   * Bomb: tossed out just in front and dropped. It leaves the cannon with no
   * upward velocity and falls under its own gravity, so it always heads down
   * rather than drifting away. It explodes the instant anything touches it —
   * a fighter, or the ground (it lands on soft platforms too, rather than
   * falling through) — and detonates on its own after a couple of seconds if
   * nothing ever does.
   */
  private layBomb(effects: Effects) {
    effects.addProjectile({
      owner: this.playerId,
      damage: 8,
      baseKnockback: 24,
      knockbackGrowth: 0.45,
      angle: 80,
      x: this.x + this.facing * 0.5,
      y: this.centerY - 0.1,
      vx: this.facing * 3.4,
      vy: 0, // no lob: it drops from the moment it leaves her hand
      gravity: 26,
      spin: this.facing * 7,
      landsOnPlatforms: true,
      explosive: true,
      explosionRadius: 0.95,
      lifeSeconds: 2.2, // fuse: detonates on its own if it never touches anything
      color: 0xff8f5a,
      radius: 0.32,
      model: grenadeModel ? grenadeModel.clone(true) : undefined,
    });
    effects.spark(this.x + this.facing * 0.5, this.centerY - 0.1, 0.3, 0xffb27a);
  }

  // ---- Donkey Kong specials ------------------------------------------------

  /**
   * Giant Punch. Same two-press shape as Samus's Charge Shot — the first
   * Special winds the arm up, the next throws it — but it is a melee haymaker,
   * so the charge scales the punch's own hitbox rather than firing a
   * projectile. Moving cancels the wind-up and dumps it.
   */
  private startGiantPunch() {
    if (this.storedCharge >= 1) {
      this.startMove(this.moves.neutralB, 1); // fully wound: throw it
      return;
    }
    this.state = "charge";
    this.chargeMoveId = "neutralB";
    this.chargeFrames = 0;
  }

  /** Headbutt: a committed forward lunge that spikes airborne opponents. */
  private startHeadbutt() {
    this.startMove(this.moves.sideB, 1);
    // A little forward drive so the lunge covers ground.
    this.vx = this.facing * 5.5;
  }

  /**
   * Spinning Kong: a helicopter spin. Lots of horizontal drift and only modest
   * height, which is exactly how it recovers in Melee — good for coming back
   * from far out, poor for coming back from far below.
   */
  private startSpinningKong() {
    this.move = { move: this.moves.upB, frame: 0, chargeMult: 1 };
    this.state = "attack";
    this.vy = FIGHTER.cutterRise * 0.72; // less height than a Final Cutter
    this.grounded = false;
    this.currentPlatform = null;
    this.fastFalling = false;
    this.moveHits.clear();
    this.animRestart = true;
    audio.sfx("swing");
  }

  // ---- Mario specials ------------------------------------------------------

  /**
   * Super Jump Punch: a rising uppercut that doubles as his recovery, scooping
   * opponents up on the way (the upB hitboxes). Same launch-and-rise shape as
   * the Final Cutter, but it does not drop a shockwave on landing.
   */
  private startSuperJumpPunch() {
    this.move = { move: this.moves.upB, frame: 0, chargeMult: 1 };
    this.state = "attack";
    this.vy = FIGHTER.cutterRise;
    this.grounded = false;
    this.currentPlatform = null;
    this.fastFalling = false;
    this.moveHits.clear();
    this.animRestart = true;
    audio.sfx("swing");
  }

  /** Fireball: a small orb that arcs down and hops along the stage. */
  private fireFireball(effects: Effects) {
    effects.addProjectile({
      owner: this.playerId,
      damage: 5,
      baseKnockback: 14,
      knockbackGrowth: 0.2,
      angle: 40,
      x: this.x + this.facing * 0.7,
      y: this.centerY,
      vx: this.facing * 10, // shoots straight out of his hand, level...
      vy: 0, // ...then gravity arcs it down onto the stage a good stride away,
      gravity: 24, // so it travels before its first hop instead of dropping flat
      bounces: 4,
      restitution: 0.8, // lively hops down the stage, like the real fireball
      landsOnPlatforms: true, // ground contact is what makes it bounce
      lifeSeconds: 2.5,
      spin: this.facing * 9, // the flame tumbles as it flies
      shape: "ball",
      color: 0xff6a00,
      radius: 0.32,
      model: fireballModel ? fireballModel.clone(true) : undefined,
    });
    audio.sfx("swing");
    effects.spark(this.x + this.facing * 0.6, this.centerY + 0.1, 0.3, 0xffd24a);
  }

  /**
   * Cape: turns opposing projectiles in front of Mario back around and takes
   * them over, so a reflected shot now threatens whoever fired it. The swipe's
   * own light hitbox (the sideB move) is resolved by the combat system as
   * usual; this only handles the reflect.
   */
  private doCape(effects: Effects) {
    const reach = 1.3;
    for (const p of effects.projectiles) {
      if (p.dead || p.owner === this.playerId) continue;
      const dx = p.x - this.x;
      if (this.facing * dx < -0.2 || Math.abs(dx) > reach) continue;
      if (Math.abs(p.y - this.centerY) > 1.0) continue;
      p.owner = this.playerId;
      p.vx = this.facing * Math.abs(p.vx || 6) * 1.4;
    }
    audio.sfx("swing");
    effects.spark(this.x + this.facing * 0.8, this.centerY + 0.1, 0.5, 0xffe08a);
  }

  /**
   * F.L.U.D.D.: a wide, near-harmless jet of water. It carries fixed horizontal
   * knockback and almost no damage, so it shoves opponents toward the ledge
   * rather than killing — a pure edge-guarding tool.
   */
  private sprayFludd(effects: Effects) {
    effects.addProjectile({
      owner: this.playerId,
      damage: 1, // must be > 0 to register a hit, but barely stings
      baseKnockback: 34,
      knockbackGrowth: 0.02,
      angle: 8, // near-horizontal shove
      x: this.x + this.facing * 0.8,
      y: this.centerY,
      vx: this.facing * 7,
      vy: 0,
      lifeSeconds: 0.32, // short reach
      shape: "ball",
      color: 0x8fd6ff,
      radius: 0.5,
    });
    audio.sfx("swing");
    effects.spark(this.x + this.facing * 0.9, this.centerY, 0.55, 0xbfeaff);
  }

  private beginMove(id: MoveId, effects: Effects) {
    const move = this.moves[id];
    if (move.chargeable) {
      this.state = "charge";
      this.chargeMoveId = id;
      this.chargeFrames = 0;
    } else {
      this.startMove(move, 1);
    }
    void effects;
  }

  private startMove(move: MoveSpec, chargeMult: number) {
    this.move = { move, frame: 0, chargeMult };
    this.state = "attack";
    this.moveHits.clear();
    this.animRestart = true;
    if (move.chargeable || move.kind === "special") audio.sfx("swing");
  }

  private startInhale() {
    this.move = { move: this.moves.neutralB, frame: 0, chargeMult: 1 };
    this.state = "inhale";
    this.moveHits.clear();
  }

  private startFinalCutter() {
    this.move = { move: this.moves.upB, frame: 0, chargeMult: 1 };
    this.state = "attack";
    this.vy = FIGHTER.cutterRise;
    this.grounded = false;
    this.currentPlatform = null;
    this.fastFalling = false;
    this.spawnShockOnLand = true;
    this.moveHits.clear();
  }

  private startStone() {
    this.move = { move: this.moves.downB, frame: 0, chargeMult: 1 };
    this.state = "stone";
    this.stoneLanded = false;
    this.stoneLandFrames = 0;
    this.vx = 0;
    this.vy = 0;
    this.moveHits.clear();
  }

  private revertStone() {
    this.move = null;
    this.state = this.grounded ? "idle" : "air";
  }

  private applyHorizontal(input: Controller, dt: number) {
    const airControl = this.state === "attack" && this.move?.move.kind === "air";
    const controlled = this.actionable() || airControl;

    if (this.state === "stone" || this.state === "hitstun") return;

    if (this.grounded && (this.state === "idle" || this.state === "walk" || this.state === "run")) {
      if (input.moveX !== 0) {
        const speed = this.running ? FIGHTER.runSpeed : FIGHTER.walkSpeed;
        this.vx = approach(this.vx, input.moveX * speed, FIGHTER.groundAccel * dt);
      } else {
        this.vx = approach(this.vx, 0, FIGHTER.friction * dt);
      }
    } else if (controlled && !this.grounded) {
      if (input.moveX !== 0) {
        const desired = input.moveX * FIGHTER.airSpeed;
        const sameDir = Math.sign(this.vx) === Math.sign(desired);
        if (!(sameDir && Math.abs(this.vx) > Math.abs(desired))) {
          this.vx = approach(this.vx, desired, FIGHTER.airAccel * dt);
        }
      } else {
        // Mild air drag so drift bleeds off instead of gliding off-stage.
        this.vx = approach(this.vx, 0, FIGHTER.airDrag * dt);
      }
    } else if (this.grounded) {
      // Grounded attack / charge: skid to a stop.
      this.vx = approach(this.vx, 0, FIGHTER.friction * dt);
    }
  }

  private tickTimers(input: Controller, effects: Effects) {
    if (this.state === "jumpsquat") {
      this.jumpsquatTimer -= 1;
      if (this.jumpsquatTimer <= 0) {
        this.vy = FIGHTER.jumpVel;
        this.grounded = false;
        this.currentPlatform = null;
        this.state = "air";
      }
      return;
    }
    if (this.state === "charge" && this.chargeMoveId === "neutralB") {
      this.tickChargeShot(input, effects);
      return;
    }
    if (this.state === "charge" && this.chargeMoveId) {
      if (input.isHeld("attack") && this.chargeFrames < 45) {
        this.chargeFrames += 1;
        if (this.chargeFrames % 6 === 0) {
          this.shadow.scale.setScalar(1 + this.chargeFrames / 90);
        }
      } else {
        const mult = 1 + 0.4 * (this.chargeFrames / 45);
        this.startMove(this.moves[this.chargeMoveId], mult);
        this.chargeMoveId = null;
      }
    }
    void effects;
  }

  /**
   * Winding the cannon. It fills on its own — no need to keep holding — and
   * while it does, Special fires whatever has built up so far and any movement
   * input aborts and dumps the charge. Standing still is the price of a big shot.
   */
  private tickChargeShot(input: Controller, effects: Effects) {
    const CHARGE_FRAMES = 90; // ~1.5s from empty to full

    // Moving out of the stance throws the charge away entirely.
    if (
      input.moveX !== 0 ||
      input.pressed("jump") ||
      input.pressed("up") ||
      input.pressed("down")
    ) {
      effects.spark(this.x + this.facing * 0.92, this.centerY + 0.1, 0.3, 0x8fb6c8);
      this.storedCharge = 0;
      this.chargeMoveId = null;
      this.state = this.grounded ? "idle" : "air";
      return;
    }

    // Release early at reduced power. Guarded by chargeFrames so the very
    // press that started the wind-up cannot also release it on the same frame.
    if (this.chargeFrames > 0 && input.pressed("special")) {
      this.releaseNeutralB();
      return;
    }
    this.chargeFrames += 1;

    this.storedCharge = Math.min(1, this.storedCharge + 1 / CHARGE_FRAMES);
    if (this.chargeFrames % 7 === 0) {
      effects.spark(
        this.x + this.facing * 0.92,
        this.centerY + 0.1,
        0.14 + 0.34 * this.storedCharge,
        this.chargeTint,
      );
    }
    if (this.storedCharge >= 1) {
      // Full. Hand control back with it held, ready for a later press.
      this.chargeMoveId = null;
      this.state = this.grounded ? "idle" : "air";
      effects.ring(this.x + this.facing * 0.92, this.centerY + 0.1, this.chargeTint, 0.5);
      audio.sfx("select");
    }
  }

  /**
   * Let the wound-up neutral special go. Samus fires a projectile whose size
   * scales with the charge (handled at its active frame); DK throws the punch
   * itself, so the charge becomes the move's own damage multiplier and is
   * spent here.
   */
  private releaseNeutralB() {
    this.chargeMoveId = null;
    if (this.char.id === "dk") {
      const mult = 1 + 1.6 * this.storedCharge; // up to ~2.6x on a full wind-up
      this.storedCharge = 0;
      this.startMove(this.moves.neutralB, mult);
      return;
    }
    this.startMove(this.moves.neutralB, 1);
  }

  /** Charge/aura colour: Samus's cannon glows blue, DK's fist runs hot. */
  private get chargeTint(): number {
    return this.char.id === "dk" ? 0xffb454 : 0xa9edff;
  }

  private advance(effects: Effects) {
    if (this.state === "attack") this.advanceAttack(effects);
    else if (this.state === "inhale") this.advanceInhale(effects);
    else if (this.state === "stone") this.advanceStone(effects);
  }

  private advanceAttack(effects: Effects) {
    const m = this.move;
    if (!m) return;
    // Samus's projectile specials have no move hitboxes; they release on the
    // frame the animation's shot lands.
    if (this.char.id === "samus" && m.frame === m.move.startup) {
      if (m.move.id === "neutralB") this.fireChargeShot(effects);
      else if (m.move.id === "sideB") this.fireMissile(effects);
      else if (m.move.id === "downB") this.layBomb(effects);
    }
    if (this.char.id === "mario" && m.frame === m.move.startup) {
      if (m.move.id === "neutralB") this.fireFireball(effects);
      else if (m.move.id === "sideB") this.doCape(effects);
      else if (m.move.id === "downB") this.sprayFludd(effects);
    }
    for (const hb of m.move.hitboxes) {
      if (m.frame === hb.start) {
        const wx = this.x + this.facing * hb.x;
        const wy = this.centerY + hb.y;
        // A small spark marks where the hitbox is, and nothing more. The big
        // white swing crescents that used to draw here covered the attack
        // itself; the animation should be what sells the swing.
        const color = m.move.kind === "special" ? 0xffd27f : 0xfff2b0;
        effects.spark(wx, wy, hb.r * 0.55, color);
      }
    }
    m.frame += 1;
    if (m.frame >= totalFrames(m.move)) this.endMove();
  }

  private advanceInhale(effects: Effects) {
    const m = this.move;
    if (!m) return;
    if (m.frame > this.moves.neutralB.startup && m.frame % 4 === 0) {
      effects.spark(this.x + this.facing * 1.0, this.centerY + 0.1, 0.5, 0xffe8b0);
    }
    m.frame += 1;
    if (m.frame >= totalFrames(this.moves.neutralB)) this.endMove();
  }

  private advanceStone(effects: Effects) {
    const m = this.move;
    if (!m) return;
    if (m.frame === this.moves.downB.startup) this.vy = -FIGHTER.stoneFall;
    m.frame += 1;
    if (this.stoneLanded) {
      this.stoneLandFrames += 1;
      if (this.stoneLandFrames === 1) {
        // Heavy slam: shockwave ring + dust puffs.
        effects.ring(this.x, this.y + 0.15, 0xbda27a, 0.6);
        for (const dx of [-0.7, -0.3, 0.3, 0.7]) effects.spark(this.x + dx, this.y + 0.2, 0.4, 0xcdbfa6);
      }
      if (this.stoneLandFrames > 90) this.revertStone();
    }
  }

  private endMove() {
    this.move = null;
    this.state = this.grounded ? "idle" : "air";
  }

  private land(platform: PlatformDef, effects: Effects) {
    const wasAir = !this.grounded;
    this.grounded = true;
    this.currentPlatform = platform;
    this.airJumps = FIGHTER.maxAirJumps;
    this.fastFalling = false;
    if (wasAir) this.landSquashT = 0.14; // squash-on-landing pop

    if (this.spawnShockOnLand) {
      this.spawnShockOnLand = false;
      for (const dir of [-1, 1]) {
        effects.addProjectile({
          owner: this.playerId,
          damage: 6,
          baseKnockback: 28,
          knockbackGrowth: 0.5,
          angle: 40,
          x: this.x + dir * 0.4,
          y: this.y + 0.25,
          vx: dir * 9,
          vy: 0,
          lifeSeconds: 0.8,
          color: 0xbfe6ff,
          radius: 0.32,
        });
      }
    }

    if (this.state === "stone") {
      if (!this.stoneLanded) {
        this.stoneLanded = true;
        this.vx = 0;
      }
      return;
    }
    if (wasAir && (this.state === "air" || this.state === "attack")) {
      if (this.state === "air") this.state = "idle";
      // an aerial that lands keeps running its endlag, then endMove -> idle
    }
  }

  private normalizeLocomotion() {
    if (this.grounded && (this.state === "idle" || this.state === "walk" || this.state === "run")) {
      if (Math.abs(this.vx) < 0.15) {
        this.state = "idle";
        this.running = false;
      } else {
        this.state = this.running ? "run" : "walk";
      }
    }
  }

  /** Called by the input layer to note a fresh dash (double-tap). */
  setRunning(dashDir: number, input: Controller) {
    if (dashDir !== 0 && this.grounded) {
      this.running = true;
      this.facing = dashDir > 0 ? 1 : -1;
    }
    if (input.moveX === 0) this.running = false;
  }

  /** Procedural squash/stretch + bob + lean based on state and velocity. */
  private animate(dt: number) {
    this.animT += dt;
    if (this.landSquashT > 0) this.landSquashT -= dt;

    // Rigged characters are driven by clips instead of squash/stretch; the
    // procedural pose fields stay at their neutral values for them.
    if (this.animator) {
      this.driveRig(dt);
      return;
    }

    // Scripted attack poses take over the body for attacks/specials/charge.
    const m = this.move;
    if ((this.state === "attack" || this.state === "inhale" || this.state === "stone") && m) {
      const p = Math.min(1, m.frame / totalFrames(m.move));
      const pose = attackPose(m.move.id, p, this.facing);
      const ks = Math.min(1, dt * 30);
      this.aScaleX += (pose.sx - this.aScaleX) * ks;
      this.aScaleY += (pose.sy - this.aScaleY) * ks;
      this.aBob = pose.bob;
      this.aRotZ = pose.rotZ;
      this.aSpinY = pose.spinY;
      this.aLungeX = pose.lungeX;
      this.aLungeY = pose.lungeY;
      return;
    }
    if (this.state === "charge" && this.chargeMoveId) {
      const pose = attackPose(this.chargeMoveId, 0.12, this.facing); // held windup
      this.aScaleX += (pose.sx - this.aScaleX) * 0.3;
      this.aScaleY += (pose.sy - this.aScaleY) * 0.3;
      this.aRotZ += (pose.rotZ - this.aRotZ) * 0.3;
      this.aSpinY += (0 - this.aSpinY) * 0.3;
      this.aLungeX += (pose.lungeX - this.aLungeX) * 0.3;
      return;
    }

    let sx = 1;
    let sy = 1;
    let bob = 0;
    let rotZ = 0;
    const spd = Math.abs(this.vx);

    if (this.state === "idle") {
      const b = Math.sin(this.animT * 3);
      sy = 1 + 0.04 * b;
      sx = 1 - 0.03 * b;
      bob = 0.02 * b;
    } else if (this.state === "walk" || this.state === "run") {
      const f = 7 + spd * 1.7;
      const ph = this.animT * f;
      const step = Math.abs(Math.sin(ph));
      bob = step * 0.18;
      sy = 1 - 0.11 * step;
      sx = 1 + 0.1 * step;
      // Directional lean plus a side-to-side waddle rock synced to the steps.
      rotZ = -this.facing * Math.min(0.16, spd * 0.024) + Math.sin(ph) * 0.11;
    } else if (this.state === "jumpsquat") {
      sy = 0.72;
      sx = 1.24;
      bob = -0.04;
    } else if (this.state === "hitstun") {
      rotZ = this.animT * 9 * (this.vx >= 0 ? -1 : 1); // tumble when launched
      sx = 1.06;
      sy = 0.96;
    } else if (this.state === "swim") {
      // Bobbing paddle: the water flattens the body a little and rocks it.
      const ph = this.animT * 6.5;
      sy = 0.94 + 0.05 * Math.sin(ph);
      sx = 1.07 - 0.05 * Math.sin(ph);
      bob = 0.05 * Math.sin(ph * 0.8);
      rotZ = Math.sin(ph * 0.5) * 0.13 - this.facing * 0.08;
    } else if (this.state === "air") {
      if (this.vy > 1.5) {
        sy = 1.18;
        sx = 0.88; // rising stretch
      } else if (this.vy < -1.5) {
        sy = this.fastFalling ? 1.24 : 1.08;
        sx = this.fastFalling ? 0.84 : 0.95;
      }
      rotZ = -this.facing * Math.min(0.2, spd * 0.025);
    }

    if (this.landSquashT > 0) {
      const k = this.landSquashT / 0.14;
      sy *= 1 - 0.28 * k;
      sx *= 1 + 0.28 * k;
    }

    const k = Math.min(1, dt * 18); // smoothing toward targets
    this.aScaleX += (sx - this.aScaleX) * k;
    this.aScaleY += (sy - this.aScaleY) * k;
    this.aBob += (bob - this.aBob) * k;
    this.aRotZ += (rotZ - this.aRotZ) * k;
    this.aSpinY += (0 - this.aSpinY) * k;
    this.aLungeX += (0 - this.aLungeX) * k;
    this.aLungeY += (0 - this.aLungeY) * k;
  }

  /** Map the fighter's state machine onto the rig's clips. */
  private driveRig(dt: number) {
    const rig = this.animator;
    if (!rig) return;
    rig.update(dt);

    const restart = this.animRestart;
    this.animRestart = false;
    const m = this.move;

    if (this.state === "dead") {
      rig.play("dead", { loop: false });
    } else if (this.state === "hitstun") {
      rig.play("hitstun", { loop: false, restart });
    } else if (this.state === "charge") {
      rig.play("charge", { loop: true });
    } else if ((this.state === "attack" || this.state === "inhale") && m) {
      // Time-scale the clip to the move's length, but never faster than
      // MIN_ATTACK_ANIM: a 7-frame jab compressed to 0.12s is an invisible
      // twitch. The animation may outlast the hitbox slightly; frame data and
      // hitboxes are untouched.
      rig.play(m.move.id as AnimRole, {
        loop: false,
        seconds: Math.max(totalFrames(m.move) / 60, MIN_ATTACK_ANIM),
        fade: 0.05,
        restart,
      });
    } else if (this.state === "swim" || !this.grounded || this.state === "jumpsquat") {
      rig.play("air", { loop: true });
    } else {
      // Pick locomotion from actual speed rather than the dash flag, so a
      // fighter that is visibly sprinting always shows the run cycle. Drive the
      // cadence by a target time-per-cycle scaled to real speed: the source
      // clips are authored slow (the walk is 4s per cycle), so left at rate 1
      // the legs barely move while the body slides — the "gliding" look. A
      // faster stride the quicker she travels keeps the feet planted.
      const spd = Math.abs(this.vx);
      if (spd > RUN_ANIM_SPEED) {
        rig.play("run", { loop: true, seconds: RUN_CYCLE_SEC * (FIGHTER.runSpeed / spd) });
      } else if (spd > 0.3) {
        rig.play("walk", { loop: true, seconds: WALK_CYCLE_SEC * (FIGHTER.walkSpeed / spd) });
      } else {
        rig.play("idle", { loop: true });
      }
    }
  }

  private syncTransform() {
    this.root.position.set(this.x + this.aLungeX, this.y + this.aLungeY, 0);
    this.root.scale.set(this.aScaleX, this.aScaleY, this.aScaleX);
    this.pivot.rotation.z = this.aRotZ; // in-plane flips/lean about the body center
    this.pivot.rotation.y =
      (this.state === "stone" ? 0 : this.facing * FACE_YAW) + this.aSpinY;
    if (this.model) this.model.position.y = this.modelBaseY + this.aBob;

    // Special props (hammer/sword/inhale) + Stone transform (hides the model).
    const m = this.move;
    const p = m ? Math.min(1, m.frame / totalFrames(m.move)) : 0;
    // Hammer / sword / stone / inhale belong to Kirby's specials; other
    // characters pass a neutral state so every prop stays hidden.
    const hideModel = this.props.update(
      this.char.id === "kirby" ? this.state : "none",
      this.char.id === "kirby" && m ? m.move.id : null,
      p,
      this.x,
      this.centerY,
      this.facing,
    );
    this.pivot.visible = !hideModel;

    // Blob shadow onto the nearest platform below.
    const g = groundBelow(this.x, this.y);
    if (g !== null && this.y - g < 7) {
      this.shadow.visible = true;
      this.shadow.position.set(this.x, g + 0.03, 0);
      const t = 1 - Math.min(1, (this.y - g) / 7);
      this.shadow.scale.setScalar((0.7 + t * 0.5) * this.aScaleX);
      (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.12 + t * 0.2;
    } else {
      this.shadow.visible = false;
    }

    // Charged glow: pulses so it reads as energy rather than a static shell.
    const charged = this.storedCharge >= 1 && this.state !== "dead";
    this.chargeAura.visible = charged;
    if (charged) {
      const pulse = 0.5 + 0.5 * Math.sin(this.animT * 9);
      const vs = this.char.visualScale ?? 1;
      const mat = this.chargeAura.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = 0.7 + 0.5 * pulse;
      mat.uniforms.uColor.value.setHex(this.chargeTint);
      this.chargeAura.scale.setScalar(vs * (1 + 0.04 * pulse));
    }

    // Respawn invulnerability blink.
    if (this.invulnTimer > 0) {
      this.root.visible = Math.floor(this.invulnTimer * 12) % 2 === 0;
    } else {
      this.root.visible = this.state !== "dead";
    }
  }
}

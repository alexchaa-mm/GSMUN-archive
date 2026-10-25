import * as THREE from "three";

// Weapon / transform props for Kirby's specials, in world space (added to the
// scene, positioned each frame) so the fighter's squash/stretch never distorts
// them. update() shows exactly one prop for the current special and returns
// true when the fighter model should be hidden (Stone).

const easeOut = (a: number) => a * (2 - a);

export class FighterProps {
  private hammerRig: THREE.Group; // pivots about Y so the mallet swings sideways
  private sword: THREE.Mesh;
  private inhale: THREE.Mesh;
  private stoneForms: THREE.Group[];
  private stoneIndex = 0;
  private prevState = "";
  active = "none";

  constructor(scene: THREE.Scene) {
    this.hammerRig = makeHammer();
    this.sword = makeSword();
    this.inhale = makeInhale();
    this.stoneForms = [makeRock(), makeAnvil(), makeSpikeBall(), makeCrate()];
    for (const p of [this.hammerRig, this.sword, this.inhale, ...this.stoneForms]) {
      p.visible = false;
      scene.add(p);
    }
  }

  private hideAll() {
    this.hammerRig.visible = false;
    this.sword.visible = false;
    this.inhale.visible = false;
    for (const f of this.stoneForms) f.visible = false;
  }

  /** @returns true if the fighter model should be hidden (Stone transform). */
  update(
    state: string,
    moveId: string | null,
    p: number,
    x: number,
    centerY: number,
    facing: number,
  ): boolean {
    // Pick a random Stone form each time the transform begins.
    if (state === "stone" && this.prevState !== "stone") {
      this.stoneIndex = Math.floor(Math.random() * this.stoneForms.length);
    }
    this.prevState = state;

    this.hideAll();
    this.active = "none";

    if (state === "stone") {
      const form = this.stoneForms[this.stoneIndex];
      form.visible = true;
      this.active = "stone";
      form.position.set(x, centerY - 0.06, 0);
      return true;
    }
    if (state === "inhale") {
      this.inhale.visible = true;
      this.active = "inhale";
      const w = Math.sin(Math.PI * Math.min(1, p * 1.2));
      this.inhale.position.set(x + facing * 0.85, centerY + 0.05, 0.1);
      this.inhale.rotation.z = facing > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.inhale.scale.set(0.7 + 0.5 * w, 0.7 + 0.5 * w, 1);
      (this.inhale.material as THREE.MeshBasicMaterial).opacity = 0.15 + 0.35 * w;
      return false;
    }
    if (state === "attack" && moveId === "sideB") {
      this.hammerRig.visible = true;
      this.active = "hammer";
      // Sideways swing that arcs THROUGH depth (about the vertical axis).
      let a: number;
      if (p < 0.4) a = 0; // wind up, held back
      else if (p < 0.72) a = easeOut((p - 0.4) / 0.32); // swing
      else a = 1; // follow-through
      const start = 2.6;
      const end = -0.2;
      this.hammerRig.position.set(x, centerY + 0.1, 0);
      this.hammerRig.scale.x = facing;
      this.hammerRig.rotation.y = start + (end - start) * a;
      this.hammerRig.rotation.z = -0.3 + 0.55 * a; // drop the head as it swings
      return false;
    }
    if (state === "attack" && moveId === "upB") {
      if (p < 0.62) {
        this.sword.visible = true;
        this.active = "sword";
        const a = p / 0.62;
        this.sword.position.set(x + facing * 0.25, centerY + 0.2 + a * 0.9, 0.2);
        this.sword.rotation.z = facing * (0.5 - a * 1.0);
        (this.sword.material as THREE.MeshStandardMaterial).opacity =
          0.55 + 0.45 * Math.sin(a * Math.PI);
      }
      return false;
    }
    return false;
  }
}

// ---- Hammer (big 3D mallet, laid along +X so the rig can swing it) ----------
function makeHammer(): THREE.Group {
  const rig = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xb7bec7, roughness: 0.35, metalness: 0.6 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x6b7178, roughness: 0.4, metalness: 0.7 });

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.05, 10), wood);
  handle.rotation.z = Math.PI / 2; // lie along X
  handle.position.x = 0.5;

  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 16), metal);
  head.rotation.x = Math.PI / 2; // head axis along Z (perpendicular to handle)
  head.position.x = 1.2;

  const capA = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.08, 16), capMat);
  capA.rotation.x = Math.PI / 2;
  capA.position.set(1.2, 0, 0.35);
  const capB = capA.clone();
  capB.position.z = -0.35;

  rig.add(handle, head, capA, capB);
  return rig;
}

function makeSword(): THREE.Mesh {
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 1.5, 0.06),
    new THREE.MeshStandardMaterial({
      color: 0xe4f7ff,
      emissive: 0x8fd8ff,
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  return blade;
}

function makeInhale(): THREE.Mesh {
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.62, 1.1, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xdff1ff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  return cone;
}

// ---- Stone forms: rock / anvil / spike ball / crate -------------------------
function displace(geo: THREE.BufferGeometry, amp: number, seed: number) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n =
      Math.sin(v.x * 6 + seed) * 0.5 +
      Math.sin(v.y * 7 - seed) * 0.3 +
      Math.sin(v.z * 5 + seed * 2) * 0.4;
    v.multiplyScalar(1 + n * amp);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
}

function makeRock(): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(0.62, 1);
  displace(geo, 0.16, 1.7);
  geo.scale(1.05, 0.86, 1.05);
  const rock = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x8b8f96, roughness: 1, flatShading: true }),
  );
  g.add(rock);
  return g;
}

function makeAnvil(): THREE.Group {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x363b43, roughness: 0.5, metalness: 0.6 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.26, 0.6), metal);
  base.position.y = -0.42;
  const waist = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.4), metal);
  waist.position.y = -0.16;
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.34, 0.56), metal);
  top.position.y = 0.16;
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 12), metal);
  horn.rotation.z = -Math.PI / 2;
  horn.position.set(0.7, 0.16, 0);
  g.add(base, waist, top, horn);
  return g;
}

function makeSpikeBall(): THREE.Group {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x44494f, roughness: 0.6, metalness: 0.5 });
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), iron));
  const dirs = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    [0.7, 0.7, 0], [-0.7, 0.7, 0], [0.7, -0.7, 0], [-0.7, -0.7, 0],
    [0, 0.7, 0.7], [0, -0.7, 0.7], [0, 0.7, -0.7], [0, -0.7, -0.7],
  ];
  for (const [dx, dy, dz] of dirs) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 8), iron);
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    spike.position.copy(dir.clone().multiplyScalar(0.58));
    spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.add(spike);
  }
  return g;
}

function makeCrate(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x9c6b3a, roughness: 0.9 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x5f4022, roughness: 0.9 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), wood));
  // Corner/edge frame strips for a crate look.
  const s = 0.5;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), frame);
      post.position.set(sx * s, 0, sz * s);
      g.add(post);
    }
  }
  for (const sy of [-1, 1]) {
    const bandX = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.12), frame);
    bandX.position.set(0, sy * s, s);
    const bandX2 = bandX.clone();
    bandX2.position.z = -s;
    const bandZ = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.0), frame);
    bandZ.position.set(s, sy * s, 0);
    const bandZ2 = bandZ.clone();
    bandZ2.position.x = -s;
    g.add(bandX, bandX2, bandZ, bandZ2);
  }
  return g;
}

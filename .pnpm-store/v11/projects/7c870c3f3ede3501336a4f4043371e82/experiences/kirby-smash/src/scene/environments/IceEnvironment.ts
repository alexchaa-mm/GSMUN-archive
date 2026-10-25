import * as THREE from "three";
import type { WaterDef } from "../../config/stages";
import { disposeSubtree } from "./types";
import type { StageEnvironment } from "./types";

// Arctic backdrop: a pale cold sky, an open sea the fighters can actually fall
// into, distant icebergs, and drifting snow. The sea surface is translucent and
// sits exactly at the stage's `water.surfaceY`, so a sinking fighter stays
// visible (murkier the deeper they go) instead of vanishing under an opaque lid.
//
// The ice peak behind the stage is scenery. It is deliberately not collision —
// the stage's five platforms are the only things you can stand on.

export class IceEnvironment implements StageEnvironment {
  readonly group = new THREE.Group();
  private seaMats: THREE.ShaderMaterial[] = [];
  private snow: THREE.Points | null = null;
  private snowDrift: Float32Array = new Float32Array(0);
  private peakSlots: { pos: THREE.Vector3; scale: number; rotY: number; flip: boolean }[] = [];
  private sky: THREE.Texture;
  private readonly surfaceY: number;

  constructor(
    private scene: THREE.Scene,
    water: WaterDef | undefined,
  ) {
    // Fall back to a sensible waterline if a stage ever uses this backdrop
    // without declaring water; the sea is scenery in that case.
    this.surfaceY = water?.surfaceY ?? -2.6;

    this.sky = makeArcticSky();
    scene.background = this.sky;
    scene.fog = new THREE.Fog(0xd6ecf7, 60, 190);
    scene.add(this.group);

    this.buildLights();
    this.buildSea();
    this.buildDepths();
    this.buildDistantBergs();
    this.buildSnow();
    this.definePeakSlots();
  }

  update(t: number) {
    for (const m of this.seaMats) m.uniforms.uTime.value = t;
    this.updateSnow(t);
  }

  dispose() {
    this.scene.remove(this.group);
    disposeSubtree(this.group);
    this.sky.dispose();
    this.scene.background = null;
    this.scene.fog = null;
  }

  private buildLights() {
    // Bright, flat polar daylight bouncing off snow from below.
    this.group.add(new THREE.HemisphereLight(0xeaf7ff, 0xbcd8ea, 1.25));

    const sun = new THREE.DirectionalLight(0xfff6e8, 1.25);
    sun.position.set(-9, 15, 12);
    this.group.add(sun);

    const bounce = new THREE.DirectionalLight(0x9fd2ee, 0.55);
    bounce.position.set(6, -8, 8);
    this.group.add(bounce);
  }

  private buildSea() {
    const mat = seaMaterial();
    this.seaMats.push(mat);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(500, 400, 1, 1), mat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, this.surfaceY, -60);
    // Draw after the fighters so the translucent surface tints them as they
    // sink, rather than being depth-rejected against whatever drew first.
    sea.renderOrder = 2;
    this.group.add(sea);
  }

  private buildDepths() {
    // A dark slab well below the surface: gives the water body its depth and
    // swallows a drowning fighter gradually instead of all at once.
    const deep = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 400),
      new THREE.MeshBasicMaterial({
        color: 0x0a3350,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        fog: false,
      }),
    );
    deep.rotation.x = -Math.PI / 2;
    deep.position.set(0, this.surfaceY - 7, -60);
    deep.renderOrder = 1;
    this.group.add(deep);
  }

  private buildDistantBergs() {
    // Low iceberg silhouettes strung along the horizon for depth.
    for (const [x, z, s, seed] of [
      [-46, -70, 12, 1.2],
      [38, -84, 16, 3.4],
      [-18, -105, 20, 5.9],
      [62, -60, 9, 8.1],
      [8, -125, 26, 11.3],
    ] as const) {
      const berg = makeBerg(s, seed);
      berg.position.set(x, this.surfaceY, z);
      this.group.add(berg);
    }
  }

  private buildSnow() {
    const COUNT = 420;
    const pos = new Float32Array(COUNT * 3);
    this.snowDrift = new Float32Array(COUNT * 2);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 70;
      pos[i * 3 + 1] = this.surfaceY + Math.random() * 34;
      pos[i * 3 + 2] = 4 - Math.random() * 46;
      this.snowDrift[i * 2] = 0.5 + Math.random() * 1.5; // fall speed
      this.snowDrift[i * 2 + 1] = Math.random() * Math.PI * 2; // sway phase
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.19,
      map: makeFlakeSprite(),
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      fog: false,
    });
    this.snow = new THREE.Points(geo, mat);
    this.group.add(this.snow);
  }

  private updateSnow(t: number) {
    if (!this.snow) return;
    const attr = this.snow.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const dt = 1 / 60;
    for (let i = 0; i < this.snowDrift.length / 2; i++) {
      const speed = this.snowDrift[i * 2];
      const phase = this.snowDrift[i * 2 + 1];
      arr[i * 3 + 1] -= speed * dt;
      arr[i * 3] += Math.sin(t * 0.8 + phase) * 0.011; // lazy crosswind
      if (arr[i * 3 + 1] < this.surfaceY) {
        arr[i * 3 + 1] = this.surfaceY + 34;
        arr[i * 3] = (Math.random() - 0.5) * 70;
      }
    }
    attr.needsUpdate = true;
  }

  private definePeakSlots() {
    // The big peak sits behind the gameplay plane and rises through the middle
    // of the stage; the flanking masses frame the arena.
    this.peakSlots = [
      { pos: new THREE.Vector3(0, this.surfaceY, -13), scale: 26, rotY: 0.2, flip: false },
      { pos: new THREE.Vector3(-24, this.surfaceY, -30), scale: 17, rotY: 1.1, flip: true },
      { pos: new THREE.Vector3(25, this.surfaceY, -34), scale: 20, rotY: -0.7, flip: false },
    ];
  }

  /**
   * Drop the generated ice peak into its slots. Scenery only — the stage's
   * platform boxes are the whole of the collision.
   */
  usePeakModel(model: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y || 1;
    for (const slot of this.peakSlots) {
      const inst = model.clone(true);
      const s = slot.scale / h;
      inst.scale.set(slot.flip ? -s : s, s, s);
      // Seat the base at the waterline rather than centring on it.
      inst.position.copy(slot.pos);
      inst.position.y -= box.min.y * s;
      inst.rotation.y = slot.rotY;
      inst.traverse((o) => (o.frustumCulled = false));
      this.group.add(inst);
    }
  }
}

function makeArcticSky(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, "#4f9fd4");
  g.addColorStop(0.42, "#8cc6e8");
  g.addColorStop(0.74, "#c8e6f6");
  g.addColorStop(1.0, "#eef8fd");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Cold open sea: rolling swell, foam glints, translucent so you can sink in it. */
function seaMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vPos;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i), b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      void main() {
        vec2 p = vPos.xy * 0.08;
        // Two crossing swells so the surface reads as moving water, not noise.
        float sw = sin(p.x * 1.6 + uTime * 0.9) * 0.5 + 0.5;
        float sw2 = sin(p.y * 2.1 - uTime * 0.65 + sw * 1.4) * 0.5 + 0.5;
        float n = noise(p * 3.0 + vec2(0.0, uTime * 0.35));

        vec3 deep = vec3(0.06, 0.28, 0.44);
        vec3 shallow = vec3(0.29, 0.63, 0.80);
        vec3 col = mix(deep, shallow, sw * 0.55 + sw2 * 0.3);

        // Foam on the crests, sharpened so it flecks rather than smears.
        float foam = smoothstep(0.74, 0.95, sw * sw2 + n * 0.35);
        col = mix(col, vec3(0.93, 0.98, 1.0), foam * 0.8);

        float dist = length(vPos.xy);
        col = mix(col, vec3(0.78, 0.90, 0.96), smoothstep(70.0, 210.0, dist) * 0.75);
        // See-through enough that a sinking fighter stays readable underneath
        // while still obviously being under water.
        gl_FragColor = vec4(col, 0.65);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
}

function makeBerg(size: number, seed: number): THREE.Mesh {
  // A squat faceted cone, jittered per-vertex into an irregular ice mass.
  const geo = new THREE.ConeGeometry(size, size * 1.15, 7, 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ang = Math.atan2(v.z, v.x);
    const n = Math.sin(ang * 3.0 + seed) * 0.22 + Math.sin(ang * 7.0 - seed * 1.7) * 0.13;
    v.x *= 1 + n;
    v.z *= 1 + n;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  geo.translate(0, size * 0.575, 0); // base at y = 0
  return new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0xdcf0fb, roughness: 0.82, flatShading: true }),
  );
}

function makeFlakeSprite(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(255,255,255,0.7)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

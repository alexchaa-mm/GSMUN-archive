import * as THREE from "three";
import { disposeSubtree } from "./types";
import type { StageEnvironment } from "./types";

// Realistic floating-arena backdrop: a bright hazy sky, a shimmering ocean far
// below, a big waterfall curtain behind the stage, flanking cliffs with
// waterfalls, drifting mist, and distant floating islands. Everything sits
// behind the z=0 gameplay plane. Animated water uses lightweight shaders.

export class SkyfieldEnvironment implements StageEnvironment {
  readonly group = new THREE.Group();
  private waterMats: THREE.ShaderMaterial[] = [];
  private islandSlots: { pos: THREE.Vector3; scale: number; rotY: number }[] = [];
  private placeholderIslands: THREE.Object3D[] = [];
  private sky: THREE.Texture;

  constructor(private scene: THREE.Scene) {
    this.sky = makeSky();
    scene.background = this.sky;
    scene.fog = new THREE.Fog(0xcfe8f6, 55, 150);
    scene.add(this.group);

    this.buildLights();
    this.buildOcean();
    this.buildHorizon();
    this.buildWaterfallCurtain();
    this.buildCliffs();
    this.buildDistantIslands();
  }

  update(t: number) {
    for (const m of this.waterMats) m.uniforms.uTime.value = t;
  }

  dispose() {
    this.scene.remove(this.group);
    disposeSubtree(this.group);
    this.sky.dispose();
    this.scene.background = null;
    this.scene.fog = null;
  }

  private buildLights() {
    this.group.add(new THREE.HemisphereLight(0xdaf1ff, 0x5b7a48, 1.0));

    const sun = new THREE.DirectionalLight(0xfff4e0, 1.4);
    sun.position.set(8, 16, 12);
    this.group.add(sun);

    const rim = new THREE.DirectionalLight(0x9fd0ff, 0.4);
    rim.position.set(-10, 6, -6);
    this.group.add(rim);
  }

  private addWater(mat: THREE.ShaderMaterial) {
    this.waterMats.push(mat);
    return mat;
  }

  private buildOcean() {
    const geo = new THREE.PlaneGeometry(400, 320, 1, 1);
    const mat = this.addWater(oceanMaterial());
    const ocean = new THREE.Mesh(geo, mat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, -15, -70);
    this.group.add(ocean);
  }

  private buildHorizon() {
    // Soft distant mountain band + haze near the horizon line.
    const mtn = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 60),
      new THREE.MeshBasicMaterial({ color: 0x9fc2d8, transparent: true, opacity: 0.65, fog: false }),
    );
    mtn.position.set(0, -2, -140);
    this.group.add(mtn);
  }

  private buildWaterfallCurtain() {
    // Wide cascade behind the stage, pouring into the ocean.
    const curtain = makeWaterfall(46, 26);
    this.waterMats.push(curtain.material as THREE.ShaderMaterial);
    curtain.position.set(0, -1.5, -14);
    this.group.add(curtain);

    // Mist where it meets the sea.
    this.group.add(makeMist(46, 8, new THREE.Vector3(0, -13.5, -12.5)));
  }

  private buildCliffs() {
    // Rocky cliff masses flanking the arena, each shedding a waterfall.
    for (const dir of [-1, 1]) {
      const cliff = makeCliff();
      cliff.position.set(dir * 30, -10, -20);
      cliff.scale.set(dir, 1, 1);
      this.group.add(cliff);

      const fall = makeWaterfall(7, 22);
      this.waterMats.push(fall.material as THREE.ShaderMaterial);
      fall.position.set(dir * 24, -3, -17);
      this.group.add(fall);
      this.group.add(makeMist(10, 6, new THREE.Vector3(dir * 24, -13, -15)));
    }
  }

  private buildDistantIslands() {
    // Slots where richer generated islands can be placed once available.
    this.islandSlots = [
      { pos: new THREE.Vector3(-20, 12, -55), scale: 6, rotY: 0.4 },
      { pos: new THREE.Vector3(19, 15, -62), scale: 7, rotY: -0.6 },
      { pos: new THREE.Vector3(-6, 20, -80), scale: 9, rotY: 1.2 },
      { pos: new THREE.Vector3(12, 7, -48), scale: 4.5, rotY: 2.0 },
    ];
    for (const slot of this.islandSlots) {
      const p = makePlaceholderIsland();
      p.position.copy(slot.pos);
      p.scale.setScalar(slot.scale);
      p.rotation.y = slot.rotY;
      this.placeholderIslands.push(p);
      this.group.add(p);
    }
  }

  /** Swap the procedural distant islands for a generated model, if provided. */
  useIslandModel(model: THREE.Object3D) {
    for (const p of this.placeholderIslands) {
      p.parent?.remove(p);
      disposeSubtree(p);
    }
    this.placeholderIslands = [];

    // Normalize the model to unit height so slot.scale controls final size.
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y || 1;
    for (const slot of this.islandSlots) {
      const inst = model.clone(true);
      inst.scale.setScalar(slot.scale / h);
      inst.position.copy(slot.pos);
      inst.rotation.y = slot.rotY;
      inst.traverse((o) => (o.frustumCulled = false));
      this.group.add(inst);
    }
  }
}

function makeSky(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, "#3f93d6");
  g.addColorStop(0.4, "#7ec0ea");
  g.addColorStop(0.72, "#bfe2f4");
  g.addColorStop(1.0, "#eaf6fd");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const WATER_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function oceanMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: WATER_VERT,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec3 vPos;
      void main() {
        float w  = sin(vPos.x * 0.06 + uTime * 0.8) * 0.5 + 0.5;
        float w2 = sin(vPos.y * 0.09 - uTime * 0.6) * 0.5 + 0.5;
        float sparkle = pow(w * w2, 4.0);
        vec3 deep = vec3(0.10, 0.33, 0.49);
        vec3 shallow = vec3(0.34, 0.63, 0.77);
        vec3 col = mix(deep, shallow, w * 0.6) + sparkle * 0.5;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    fog: false,
  });
}

function makeWaterfall(width: number, height: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: WATER_VERT,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i), b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      void main() {
        float x = vUv.x;
        float y = 1.0 - vUv.y;                       // 0 top -> 1 bottom
        // Two stretched noise layers scrolling DOWN at different speeds = flow.
        float s1 = noise(vec2(x * 24.0, y * 3.5 - uTime * 2.0));
        float s2 = noise(vec2(x * 46.0, y * 6.0 - uTime * 3.4));
        float flow = smoothstep(0.25, 0.9, s1 * 0.6 + s2 * 0.4);
        // Vertical channels so it reads as many falling ribbons.
        float channels = 0.55 + 0.45 * sin(x * 70.0 + noise(vec2(x * 8.0, 0.0)) * 6.0);
        float body = smoothstep(0.04, 0.18, y);      // fade in below the lip
        float foamTop = smoothstep(0.0, 0.06, y) * (1.0 - smoothstep(0.04, 0.22, y));
        float mistBot = smoothstep(0.72, 1.0, y);    // spray at the base
        vec3 water = mix(vec3(0.58, 0.8, 0.98), vec3(1.0), flow);
        water = mix(water, vec3(1.0), foamTop * 0.9);
        float alpha = body * (0.4 + 0.55 * flow * channels);
        alpha = mix(alpha, alpha * 0.55 + 0.3, mistBot); // soften into spray
        alpha = max(alpha, foamTop * 0.8);
        gl_FragColor = vec4(water, clamp(alpha, 0.0, 1.0) * 0.96);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height, 1, 1), mat);
}

function makeMist(width: number, height: number, pos: THREE.Vector3): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0.8)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.position.copy(pos);
  return mesh;
}

function craggyRock(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  seed: number,
  amp = 0.16,
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 13, 12, true);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ang = Math.atan2(v.z, v.x);
    const yy = v.y / height;
    // layered pseudo-noise -> jagged strata and vertical gullies
    const n =
      Math.sin(ang * 3.0 + seed) * 0.5 +
      Math.sin(ang * 8.0 - yy * 9.0 + seed) * 0.32 +
      Math.sin(yy * 14.0 + ang * 2.0) * 0.3 +
      Math.sin(ang * 17.0 + seed * 2.0) * 0.18;
    const r = 1 + n * amp;
    v.x *= r;
    v.z *= r;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function makeCliff(): THREE.Group {
  const g = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({ color: 0x6d6353, roughness: 1, flatShading: true });
  const rockDark = new THREE.MeshStandardMaterial({ color: 0x4b4438, roughness: 1, flatShading: true });
  const grass = new THREE.MeshStandardMaterial({ color: 0x6fae52, roughness: 1, flatShading: true });

  // Main craggy spire.
  const body = new THREE.Mesh(craggyRock(9, 15, 40, 1.3, 0.17), rock);
  g.add(body);

  // A second offset mass + a lower shoulder, for a layered mountain silhouette.
  const shoulder = new THREE.Mesh(craggyRock(6, 9, 26, 4.1, 0.2), rockDark);
  shoulder.position.set(6, -6, 3);
  shoulder.rotation.y = 0.6;
  g.add(shoulder);

  const spur = new THREE.Mesh(craggyRock(3.5, 6, 18, 7.7, 0.22), rock);
  spur.position.set(-5, -9, 4);
  g.add(spur);

  // Grassy cap with a few tufts + scattered boulders for detail.
  const cap = new THREE.Mesh(craggyRock(9.6, 8.6, 3.4, 2.2, 0.12), grass);
  cap.position.y = 20.4;
  g.add(cap);
  for (const [bx, by, bz, s] of [
    [7, 6, 4, 2.2],
    [-6, 12, 3, 1.6],
    [3, -4, 6, 2.8],
  ] as const) {
    const boulder = new THREE.Mesh(craggyRock(s, s * 1.1, s * 1.4, bx * 3 + by, 0.28), rockDark);
    boulder.position.set(bx, by, bz);
    g.add(boulder);
  }
  return g;
}

function makePlaceholderIsland(): THREE.Group {
  const g = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({ color: 0x8497ab, roughness: 1 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x77b45a, roughness: 1 });
  const base = new THREE.Mesh(new THREE.ConeGeometry(1, 1.7, 6), rock);
  base.rotation.x = Math.PI;
  base.position.y = -0.5;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.85, 0.4, 6), grass);
  g.add(base, top);
  return g;
}

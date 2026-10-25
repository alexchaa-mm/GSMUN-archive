import * as THREE from "three";
import { disposeSubtree } from "./types";
import type { StageEnvironment } from "./types";

// Molten cavern backdrop: a lake of flowing lava far below the stage, a dark
// basalt cavern rising around it, glowing haze where the heat meets the air,
// and embers drifting upward. The lava is a shader (it has to flow), the rock
// is generated art dropped into fixed slots by `useRockModel`.

/** World height of the lava surface. Sits below the lowest blast zone. */
const LAVA_Y = -7.2;

export class MoltenEnvironment implements StageEnvironment {
  readonly group = new THREE.Group();
  private lavaMats: THREE.ShaderMaterial[] = [];
  private embers: THREE.Points | null = null;
  private emberVel: Float32Array = new Float32Array(0);
  private glowPulse: THREE.Mesh[] = [];
  private rockSlots: { pos: THREE.Vector3; scale: number; rotY: number; flip: boolean }[] = [];
  private sky: THREE.Texture;

  constructor(private scene: THREE.Scene) {
    this.sky = makeCavernSky();
    scene.background = this.sky;
    // Heavy warm gloom: distant rock sinks into the dark instead of ending.
    scene.fog = new THREE.Fog(0x2a0d16, 42, 165);
    scene.add(this.group);

    this.buildLights();
    this.buildLavaLake();
    this.buildHeatGlow();
    this.buildEmbers();
    this.defineRockSlots();
  }

  update(t: number) {
    for (const m of this.lavaMats) m.uniforms.uTime.value = t;
    for (let i = 0; i < this.glowPulse.length; i++) {
      const mat = this.glowPulse[i].material as THREE.MeshBasicMaterial;
      mat.opacity = 0.34 + 0.1 * Math.sin(t * 0.7 + i * 1.7);
    }
    this.updateEmbers();
  }

  dispose() {
    this.scene.remove(this.group);
    disposeSubtree(this.group);
    this.sky.dispose();
    this.scene.background = null;
    this.scene.fog = null;
  }

  private buildLights() {
    // Cool dark from above, hot bounce from the lava below.
    this.group.add(new THREE.HemisphereLight(0x6a4b7a, 0xff5a12, 1.15));

    // Key light raking across the platforms so their silhouettes read.
    const key = new THREE.DirectionalLight(0xffd2a0, 1.05);
    key.position.set(6, 14, 14);
    this.group.add(key);

    // Strong warm uplight: everything is lit from underneath by molten rock.
    const uplight = new THREE.DirectionalLight(0xff7a22, 1.5);
    uplight.position.set(-2, -12, 8);
    this.group.add(uplight);

    // Magenta rim from the cavern depths to separate art from the background.
    const rim = new THREE.DirectionalLight(0xc0508f, 0.5);
    rim.position.set(-12, 4, -10);
    this.group.add(rim);
  }

  private buildLavaLake() {
    const mat = lavaMaterial();
    this.lavaMats.push(mat);
    const lake = new THREE.Mesh(new THREE.PlaneGeometry(420, 340, 1, 1), mat);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(0, LAVA_Y, -60);
    this.group.add(lake);
  }

  private buildHeatGlow() {
    // Additive bands hugging the lava so the horizon blooms instead of ending
    // in a hard line, plus a wide glow behind the stage.
    for (const [w, h, y, z, opacity] of [
      [200, 26, LAVA_Y + 8, -70, 0.4],
      [120, 16, LAVA_Y + 5, -34, 0.34],
      [70, 12, LAVA_Y + 4, -16, 0.28],
    ] as const) {
      const glow = makeGlowBand(w, h, opacity);
      glow.position.set(0, y, z);
      this.glowPulse.push(glow);
      this.group.add(glow);
    }
  }

  private buildEmbers() {
    const COUNT = 260;
    const pos = new Float32Array(COUNT * 3);
    this.emberVel = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = LAVA_Y + Math.random() * 34;
      pos[i * 3 + 2] = -4 - Math.random() * 40;
      this.emberVel[i] = 0.9 + Math.random() * 2.4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.42,
      map: makeEmberSprite(),
      color: 0xffb257,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.embers = new THREE.Points(geo, mat);
    this.group.add(this.embers);
  }

  private updateEmbers() {
    if (!this.embers) return;
    const attr = this.embers.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const dt = 1 / 60;
    for (let i = 0; i < this.emberVel.length; i++) {
      const yi = i * 3 + 1;
      arr[yi] += this.emberVel[i] * dt;
      // Lazy horizontal wander so they don't rise in straight columns.
      arr[i * 3] += Math.sin(arr[yi] * 0.6 + i) * 0.004;
      if (arr[yi] > LAVA_Y + 36) {
        arr[yi] = LAVA_Y;
        arr[i * 3] = (Math.random() - 0.5) * 60;
      }
    }
    attr.needsUpdate = true;
  }

  private defineRockSlots() {
    // Where generated cavern rock goes: two flanking walls close to the
    // gameplay plane, plus deeper masses that fill the background.
    this.rockSlots = [
      { pos: new THREE.Vector3(-21, -6, -14), scale: 30, rotY: 0.3, flip: false },
      { pos: new THREE.Vector3(21, -6, -14), scale: 30, rotY: -0.3, flip: true },
      { pos: new THREE.Vector3(-9, 6, -46), scale: 34, rotY: 1.1, flip: false },
      { pos: new THREE.Vector3(13, 8, -54), scale: 38, rotY: -0.8, flip: true },
      { pos: new THREE.Vector3(0, 22, -34), scale: 26, rotY: 2.4, flip: false },
    ];
  }

  /**
   * Populate the cavern with a generated rock formation. Called once the Mint
   * model resolves; until then the backdrop is lava, haze and gloom.
   */
  useRockModel(model: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y || 1;
    for (const slot of this.rockSlots) {
      const inst = model.clone(true);
      const s = slot.scale / h;
      inst.scale.set(slot.flip ? -s : s, s, s);
      inst.position.copy(slot.pos);
      inst.rotation.y = slot.rotY;
      inst.traverse((o) => (o.frustumCulled = false));
      this.group.add(inst);
    }
    // The topmost slot hangs from the ceiling: flip it so stalactites point down.
    const ceiling = this.group.children[this.group.children.length - 1];
    ceiling.rotation.z = Math.PI;
  }
}

function makeCavernSky(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, "#160a1e"); // cavern ceiling, almost black
  g.addColorStop(0.34, "#3a1030");
  g.addColorStop(0.62, "#8c2418");
  g.addColorStop(0.84, "#e2551a");
  g.addColorStop(1.0, "#ff9330"); // glare off the lava
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Flowing molten rock: dark crust plates drifting over bright magma seams. */
function lavaMaterial(): THREE.ShaderMaterial {
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
      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      void main() {
        vec2 p = vPos.xy * 0.055;
        p.y += uTime * 0.035;                       // the whole lake creeps
        // Domain warp: makes the crust swirl instead of looking like static noise.
        vec2 warp = vec2(fbm(p * 1.7 + uTime * 0.05), fbm(p * 1.7 + 5.2 - uTime * 0.04));
        float n = fbm(p + warp * 0.9);

        vec3 hot   = vec3(1.00, 0.88, 0.42);
        vec3 mid   = vec3(1.00, 0.40, 0.05);
        vec3 cool  = vec3(0.34, 0.06, 0.04);
        vec3 crustCol = vec3(0.09, 0.04, 0.06);

        vec3 col = mix(hot, mid, smoothstep(0.00, 0.44, n));
        col = mix(col, cool, smoothstep(0.34, 0.60, n));
        float crust = smoothstep(0.44, 0.74, n);
        col = mix(col, crustCol, crust);

        // Incandescent rim where a cooling plate meets open magma.
        float rim = smoothstep(0.40, 0.46, n) * (1.0 - smoothstep(0.46, 0.58, n));
        col += vec3(1.0, 0.55, 0.12) * rim * 1.7;

        col *= 0.90 + 0.14 * sin(uTime * 0.8 + n * 6.0); // slow throb

        // Fade into the cavern gloom rather than running to a hard horizon.
        float dist = length(vPos.xy);
        col *= 1.0 - smoothstep(55.0, 185.0, dist) * 0.88;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    fog: false,
  });
}

function makeGlowBand(width: number, height: number, opacity: number): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0.0, "rgba(255,150,50,0.95)");
  g.addColorStop(0.45, "rgba(255,90,25,0.35)");
  g.addColorStop(1.0, "rgba(255,60,20,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 128);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
}

function makeEmberSprite(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0.0, "rgba(255,235,190,1)");
  g.addColorStop(0.35, "rgba(255,150,60,0.75)");
  g.addColorStop(1.0, "rgba(255,90,20,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

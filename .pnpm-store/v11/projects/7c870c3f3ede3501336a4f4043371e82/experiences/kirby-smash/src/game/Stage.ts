import * as THREE from "three";
import { loadMintModel } from "../assets/loadModel";
import type { PlatformDef, StageDef } from "../config/stage";
import { alignDeckToTop, placeTopCenter, scaleToWidth } from "../util/modelFit";

// Loads a stage's Mint art and fits each model to the hand-built collision
// boxes from config/stages.ts. If a model is missing, a placeholder box keeps
// the game playable. `build` can be called again to swap to another map.

export class Stage {
  readonly group = new THREE.Group();
  usedPlaceholder = false;

  /** Loaded art keyed by Mint logical key, so re-picking a map is instant. */
  private readonly cache = new Map<string, THREE.Object3D | null>();
  private built: StageDef["id"] | null = null;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  /** Build (or rebuild) the platform art for a stage. */
  async build(def: StageDef): Promise<void> {
    if (this.built === def.id) return;
    this.clear();
    this.built = def.id;
    this.usedPlaceholder = false;

    const [mainModel, slabModel] = await Promise.all([
      this.modelFor(def.art.mainModel),
      this.modelFor(def.art.slabModel),
    ]);

    // A different stage may have been requested while these were in flight.
    if (this.built !== def.id) return;

    this.group.add(this.buildPlatform(def.main, mainModel, def.art.mainHeight, def.art.mainColor, def));
    for (const p of def.soft) {
      this.group.add(this.buildPlatform(p, slabModel, def.art.softHeight, def.art.softColor, def));
    }
  }

  /** Load a Mint model once and reuse it; null means "use a placeholder". */
  private async modelFor(key: string | null): Promise<THREE.Object3D | null> {
    if (!key) return null;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    let model: THREE.Object3D | null = null;
    try {
      model = await loadMintModel(key);
    } catch (err) {
      console.warn(`${key} model failed to load; using placeholder`, err);
    }
    this.cache.set(key, model);
    return model;
  }

  private buildPlatform(
    p: PlatformDef,
    template: THREE.Object3D | null,
    height: number,
    color: number,
    def: StageDef,
  ): THREE.Object3D {
    const width = p.maxX - p.minX;
    const cx = (p.minX + p.maxX) / 2;
    if (template) {
      const vis = template.clone(true);
      scaleToWidth(vis, width);
      placeTopCenter(vis, cx, p.topY, 0);
      alignDeckToTop(vis, cx, p.topY, width / 2, 0);
      return vis;
    }
    this.usedPlaceholder = true;
    const depth = p.solid ? def.art.depth : def.art.depth * 0.7;
    return placeholderBox(width, height, depth, cx, p.topY, color);
  }

  /** Drop the current platform art. Cached source models are kept for reuse. */
  private clear() {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      disposeIfPlaceholder(child, this.cache);
    }
  }
}

/**
 * Placeholder boxes own their geometry/material, so free them. Clones of a
 * cached Mint model share buffers with the cached original and must not be
 * disposed, or re-picking that stage would render an empty scene.
 */
function disposeIfPlaceholder(obj: THREE.Object3D, cache: Map<string, THREE.Object3D | null>) {
  const shared = [...cache.values()].some((m) => m !== null && isCloneOf(obj, m));
  if (shared) return;
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
  });
}

/** Clones keep the source's geometry UUID, which is enough to spot them. */
function isCloneOf(obj: THREE.Object3D, source: THREE.Object3D): boolean {
  const ids = new Set<string>();
  source.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) ids.add(mesh.geometry.uuid);
  });
  let match = false;
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && ids.has(mesh.geometry.uuid)) match = true;
  });
  return match;
}

function placeholderBox(
  w: number,
  h: number,
  d: number,
  cx: number,
  topY: number,
  color: number,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, topY - h / 2, 0);
  return mesh;
}

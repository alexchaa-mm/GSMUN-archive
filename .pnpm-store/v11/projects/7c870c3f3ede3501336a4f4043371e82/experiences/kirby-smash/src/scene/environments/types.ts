import * as THREE from "three";

// A stage backdrop. Each environment owns everything that makes its map feel
// like a place: scene background, fog, lighting, and animated scenery. Swapping
// maps disposes one wholesale and constructs the next, so nothing leaks between
// a sunny plateau and a lava cavern.

export interface StageEnvironment {
  readonly group: THREE.Group;
  /** Advance animated scenery. `t` is elapsed seconds. */
  update(t: number): void;
  /** Remove from the scene and free GPU resources. */
  dispose(): void;
}

/** Frees every geometry/material under a subtree. */
export function disposeSubtree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mat = mesh.material;
    const mats = Array.isArray(mat) ? mat : [mat];
    for (const m of mats) {
      const withMap = m as THREE.MeshBasicMaterial;
      withMap.map?.dispose();
      m.dispose();
    }
  });
}

import * as THREE from "three";
import { createMintGltfLoader } from "./gltf-runtime";
import { assertLoadable, getModelUrl } from "./registry";

// Single shared Draco-capable loader for every Mint GLB in the game.
const loader = createMintGltfLoader();

/**
 * Load a registered Mint model by logical key. Returns null when the key is not
 * in the registry yet, so callers can fall back to a labelled placeholder.
 * A decode/network failure is thrown so the caller can surface it.
 */
export async function loadMintModel(key: string): Promise<THREE.Object3D | null> {
  const url = getModelUrl(key);
  if (!url) return null;
  assertLoadable(key);
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  root.traverse((o) => {
    o.frustumCulled = false;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    }
  });
  return root;
}

import * as THREE from "three";

// Fit Mint models onto the hand-built collision boxes so art lines up with
// physics. All helpers mutate the object's scale/position in place.

export function boxOf(obj: THREE.Object3D): THREE.Box3 {
  obj.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(obj);
}

/**
 * Make a rigged model measurable.
 *
 * A SkinnedMesh reports its bounds from computeBoundingBox(), which skins every
 * vertex against the *current* skeleton pose. On a freshly cloned rig the
 * skeleton has not been posed, so those bounds come back in bind-space — for a
 * model whose armature is scaled 0.01 that reads as 0.018 units tall instead of
 * 1.78, and any fit against it is off by ~100x. Posing the skeleton first and
 * caching the box makes boxOf() report the size the character actually renders.
 */
export function poseForMeasurement(obj: THREE.Object3D): void {
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    const skinned = o as THREE.SkinnedMesh;
    if (!skinned.isSkinnedMesh) return;
    skinned.skeleton.update();
    skinned.computeBoundingBox();
  });
}

export function scaleToWidth(obj: THREE.Object3D, targetWidth: number) {
  const b = boxOf(obj);
  const w = b.max.x - b.min.x;
  if (w > 1e-4) obj.scale.multiplyScalar(targetWidth / w);
}

export function scaleToHeight(obj: THREE.Object3D, targetHeight: number) {
  const b = boxOf(obj);
  const h = b.max.y - b.min.y;
  if (h > 1e-4) obj.scale.multiplyScalar(targetHeight / h);
}

/** Align so the model's top surface sits at topY, centered over (x, z). */
export function placeTopCenter(obj: THREE.Object3D, x: number, topY: number, z = 0) {
  const b = boxOf(obj);
  obj.position.x += x - (b.min.x + b.max.x) / 2;
  obj.position.y += topY - b.max.y;
  obj.position.z += z - (b.min.z + b.max.z) / 2;
}

const _ray = new THREE.Raycaster();
const _down = new THREE.Vector3(0, -1, 0);

/**
 * Raise/lower a placed platform model so its actual top DECK surface (not its
 * grass, rim or decorations) sits at topY. Casts several rays down across the
 * width and uses the median hit, so a tall centerpiece doesn't skew the result.
 */
export function alignDeckToTop(obj: THREE.Object3D, cx: number, topY: number, halfWidth: number, z = 0) {
  obj.updateWorldMatrix(true, true);
  const ys: number[] = [];
  for (const f of [-0.6, -0.3, 0, 0.3, 0.6]) {
    _ray.set(new THREE.Vector3(cx + f * halfWidth, topY + 80, z), _down);
    const hits = _ray.intersectObject(obj, true);
    if (hits.length > 0) ys.push(hits[0].point.y);
  }
  if (ys.length === 0) return;
  ys.sort((a, b) => a - b);
  const deck = ys[Math.floor(ys.length / 2)];
  obj.position.y += topY - deck;
}

/** Align so the model's feet (bottom) sit at bottomY, centered over (x, z). */
export function placeBottomCenter(obj: THREE.Object3D, x: number, bottomY: number, z = 0) {
  const b = boxOf(obj);
  obj.position.x += x - (b.min.x + b.max.x) / 2;
  obj.position.y += bottomY - b.min.y;
  obj.position.z += z - (b.min.z + b.max.z) / 2;
}

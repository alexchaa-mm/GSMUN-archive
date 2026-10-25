import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const segmentForward = new THREE.Vector3();
const segmentRight = new THREE.Vector3();
const segmentUp = new THREE.Vector3();
const segmentBasis = new THREE.Matrix4();

export function fitModel(
  root: THREE.Object3D,
  targetSize: number,
  axis: 'height' | 'largest' = 'height',
): THREE.Object3D {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const sourceSize = axis === 'height' ? size.y : Math.max(size.x, size.y, size.z);
  if (sourceSize > 0.0001) root.scale.multiplyScalar(targetSize / sourceSize);
  root.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(root);
  const center = fitted.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= fitted.min.y;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return root;
}

/**
 * Maps a model's local +Z axis onto a world-space segment while keeping local
 * +Y as close to world-up as the segment slope allows. This avoids the
 * under-constrained roll produced by Quaternion.setFromUnitVectors().
 */
export function quaternionAlongSegment(
  start: THREE.Vector3,
  end: THREE.Vector3,
  target = new THREE.Quaternion(),
): THREE.Quaternion {
  segmentForward.subVectors(end, start);
  if (segmentForward.lengthSq() < 1e-8) return target.identity();
  segmentForward.normalize();

  segmentRight.crossVectors(WORLD_UP, segmentForward);
  if (segmentRight.lengthSq() < 1e-8) segmentRight.set(1, 0, 0);
  else segmentRight.normalize();
  segmentUp.crossVectors(segmentForward, segmentRight).normalize();

  segmentBasis.makeBasis(segmentRight, segmentUp, segmentForward);
  return target.setFromRotationMatrix(segmentBasis);
}

export function orientAlongSegment(root: THREE.Object3D, start: THREE.Vector3, end: THREE.Vector3): void {
  root.position.copy(start).add(end).multiplyScalar(0.5);
  quaternionAlongSegment(start, end, root.quaternion);
}

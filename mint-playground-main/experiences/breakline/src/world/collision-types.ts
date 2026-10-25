import type * as THREE from 'three';

export type StaticColliderPlan = {
  id: string;
  tag: string;
  shape: 'box' | 'ball' | 'capsule' | 'cylinder';
  position: THREE.Vector3;
  rotation?: THREE.Quaternion;
  halfExtents?: THREE.Vector3;
  radius?: number;
  halfHeight?: number;
  sensor?: boolean;
};

export type MovingColliderTransform = {
  id: string;
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
};

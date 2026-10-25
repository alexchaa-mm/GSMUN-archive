import * as THREE from 'three';
import type { RiderState } from '../game/types';

type RiderBones = {
  hips: THREE.Bone;
  spine: THREE.Bone;
  neck: THREE.Bone;
  head: THREE.Bone;
  leftUpLeg: THREE.Bone;
  leftLeg: THREE.Bone;
  leftFoot: THREE.Bone;
  rightUpLeg: THREE.Bone;
  rightLeg: THREE.Bone;
  rightFoot: THREE.Bone;
  leftArm: THREE.Bone;
  leftForeArm: THREE.Bone;
  leftHand: THREE.Bone;
  rightArm: THREE.Bone;
  rightForeArm: THREE.Bone;
  rightHand: THREE.Bone;
};

const LEFT_BINDING = new THREE.Vector3(0, 0.27, -0.34);
const RIGHT_BINDING = new THREE.Vector3(0, 0.27, 0.34);
const BINDING_ANGLE = THREE.MathUtils.degToRad(12);

export type BindingDiagnostics = {
  bound: boolean;
  boardGeometryAligned: boolean;
  maxPositionErrorCm: number;
  maxAngularErrorDeg: number;
  passed: boolean;
  detail: string;
};

/**
 * Post-processes the Mint animation rig after AnimationMixer evaluation.
 * Gameplay owns the rider/board transform; this layer keeps boots attached to
 * the bindings and adds snowboard-specific stance and grab posing.
 */
export class RiderPoseSystem {
  private bones: RiderBones | null = null;
  private stanceError = 0;
  private angularError = 0;
  private stanceDetail = '';
  private boardBounds: THREE.Box3 | null = null;
  private orientationCalibrated = false;
  private readonly leftFootBoardSpace = new THREE.Quaternion();
  private readonly rightFootBoardSpace = new THREE.Quaternion();
  private readonly tmpPosition = new THREE.Vector3();
  private readonly tmpPositionB = new THREE.Vector3();
  private readonly tmpQuaternion = new THREE.Quaternion();
  private readonly tmpQuaternionB = new THREE.Quaternion();
  private readonly tmpQuaternionC = new THREE.Quaternion();
  private readonly tmpEuler = new THREE.Euler();
  private readonly identity = new THREE.Quaternion();

  constructor(
    private readonly presentation: THREE.Group,
    private readonly riderWrapper: THREE.Group,
    private readonly board: THREE.Group,
  ) {}

  bind(modelRoot: THREE.Object3D): void {
    const bone = (name: string): THREE.Bone | null => {
      const value = modelRoot.getObjectByName(name);
      return value instanceof THREE.Bone ? value : null;
    };
    const values = {
      hips: bone('Hips'), spine: bone('Spine'), neck: bone('neck'), head: bone('Head'),
      leftUpLeg: bone('LeftUpLeg'), leftLeg: bone('LeftLeg'), leftFoot: bone('LeftFoot'),
      rightUpLeg: bone('RightUpLeg'), rightLeg: bone('RightLeg'), rightFoot: bone('RightFoot'),
      leftArm: bone('LeftArm'), leftForeArm: bone('LeftForeArm'), leftHand: bone('LeftHand'),
      rightArm: bone('RightArm'), rightForeArm: bone('RightForeArm'), rightHand: bone('RightHand'),
    };
    if (Object.values(values).every((value) => value)) this.bones = values as RiderBones;
  }

  setBoardBounds(bounds: THREE.Box3): void {
    this.boardBounds = bounds.clone();
  }

  update(state: RiderState): void {
    const bones = this.bones;
    if (!bones) return;

    this.riderWrapper.position.set(0, 0.02, 0);
    const crouch = state.bailing ? 0 : state.tucked ? 0.24 : state.grinding ? 0.2 : state.grounded ? 0.13 : 0.08;
    const carve = THREE.MathUtils.clamp(state.steer, -1, 1);
    const grabSide = state.grab === 'frontside' ? 1 : state.grab === 'backside' ? -1 : 0;
    const spinPose = THREE.MathUtils.clamp(Math.sin(state.yawRotation), -1, 1);
    const flipPose = THREE.MathUtils.clamp(Math.sin(state.flipRotation), -1, 1);
    const corkPose = state.corked ? THREE.MathUtils.clamp(Math.sin((state.yawRotation + state.flipRotation) * 0.5), -1, 1) : 0;

    const rootScale = this.riderWrapper.getWorldScale(this.tmpPosition).y || 1;
    bones.hips.position.y -= crouch / rootScale;
    this.rotateLocal(bones.hips, 0.02 + flipPose * 0.08, carve * 0.08 + spinPose * 0.1, -carve * 0.08 + corkPose * 0.16);
    this.rotateLocal(
      bones.spine,
      (state.tucked ? -0.32 : state.grab ? -0.18 : -0.08) - flipPose * 0.12,
      -carve * 0.12 - spinPose * 0.18,
      carve * 0.1 + corkPose * 0.24,
    );
    this.rotateLocal(bones.neck, state.tucked ? 0.18 : 0.08, -0.24, 0);
    this.rotateLocal(bones.head, 0, -0.2, 0);

    if (!state.grab) {
      const balance = state.grinding ? 0.34 : 0;
      this.rotateLocal(bones.leftArm, -0.12 - balance, 0.08 + spinPose * 0.12, 0.26 + carve * 0.12 + corkPose * 0.18);
      this.rotateLocal(bones.rightArm, -0.12 - balance, -0.08 + spinPose * 0.12, -0.26 + carve * 0.12 + corkPose * 0.18);
      this.rotateLocal(bones.leftForeArm, 0, 0, -0.18);
      this.rotateLocal(bones.rightForeArm, 0, 0, 0.18);
    } else {
      this.rotateLocal(bones.leftArm, -0.35, grabSide * 0.22, 0.2);
      this.rotateLocal(bones.rightArm, -0.35, grabSide * 0.22, -0.2);
    }

    this.presentation.updateMatrixWorld(true);
    if (!this.orientationCalibrated) this.calibrateFootOrientations(bones);
    this.alignRigMidpoint(bones.leftFoot, bones.rightFoot);
    const leftBinding = this.boardTarget(LEFT_BINDING);
    const rightBinding = this.boardTarget(RIGHT_BINDING);
    this.solveCcd(bones.leftFoot, [bones.leftLeg, bones.leftUpLeg], leftBinding, 6);
    this.solveCcd(bones.rightFoot, [bones.rightLeg, bones.rightUpLeg], rightBinding, 6);
    this.pinChainRoot(bones.leftUpLeg, bones.leftFoot, leftBinding);
    this.pinChainRoot(bones.rightUpLeg, bones.rightFoot, rightBinding);
    this.orientFoot(bones.leftFoot, this.leftFootBoardSpace);
    this.orientFoot(bones.rightFoot, this.rightFootBoardSpace);

    if (state.grab) {
      const target = state.grab === 'frontside'
        ? new THREE.Vector3(0.32, 0.16, 0)
        : state.grab === 'backside'
          ? new THREE.Vector3(-0.32, 0.16, 0)
          : state.grab === 'nose'
            ? new THREE.Vector3(0, 0.16, -0.78)
            : new THREE.Vector3(0, 0.16, 0.78);
      const useLeft = state.grab === 'frontside' || state.grab === 'nose';
      this.solveCcd(
        useLeft ? bones.leftHand : bones.rightHand,
        useLeft ? [bones.leftForeArm, bones.leftArm] : [bones.rightForeArm, bones.rightArm],
        this.boardTarget(target),
        5,
      );
    }

    this.presentation.updateMatrixWorld(true);
    const leftError = bones.leftFoot.getWorldPosition(this.tmpPosition).distanceTo(this.boardTarget(LEFT_BINDING));
    const rightError = bones.rightFoot.getWorldPosition(this.tmpPositionB).distanceTo(this.boardTarget(RIGHT_BINDING));
    this.stanceError = Math.max(leftError, rightError);
    const boardWorld = this.board.getWorldQuaternion(this.tmpQuaternion);
    const leftTargetOrientation = this.tmpQuaternionB.copy(boardWorld).multiply(this.leftFootBoardSpace);
    const rightTargetOrientation = this.tmpQuaternionC.copy(boardWorld).multiply(this.rightFootBoardSpace);
    const leftAngle = THREE.MathUtils.radToDeg(bones.leftFoot.getWorldQuaternion(new THREE.Quaternion()).angleTo(leftTargetOrientation));
    const rightAngle = THREE.MathUtils.radToDeg(bones.rightFoot.getWorldQuaternion(new THREE.Quaternion()).angleTo(rightTargetOrientation));
    this.angularError = Math.max(leftAngle, rightAngle);
    const leftLocal = this.board.worldToLocal(bones.leftFoot.getWorldPosition(new THREE.Vector3()));
    const rightLocal = this.board.worldToLocal(bones.rightFoot.getWorldPosition(new THREE.Vector3()));
    this.stanceDetail = `L ${leftLocal.x.toFixed(2)},${leftLocal.y.toFixed(2)},${leftLocal.z.toFixed(2)} R ${rightLocal.x.toFixed(2)},${rightLocal.y.toFixed(2)},${rightLocal.z.toFixed(2)}`;
  }

  diagnostics(): string {
    const values = this.metrics();
    return values.bound
      ? `rig bound | boot error ${values.maxPositionErrorCm.toFixed(1)}cm | angle ${values.maxAngularErrorDeg.toFixed(1)}deg | ${values.passed ? 'PASS' : 'FAIL'} | ${values.detail}`
      : 'rig unavailable';
  }

  metrics(): BindingDiagnostics {
    const boardGeometryAligned = !!this.boardBounds
      && LEFT_BINDING.y >= this.boardBounds.min.y
      && LEFT_BINDING.y <= this.boardBounds.max.y
      && RIGHT_BINDING.y >= this.boardBounds.min.y
      && RIGHT_BINDING.y <= this.boardBounds.max.y;
    const boardDetail = this.boardBounds
      ? `board y ${this.boardBounds.min.y.toFixed(2)}..${this.boardBounds.max.y.toFixed(2)}`
      : 'board unavailable';
    return {
      bound: !!this.bones,
      boardGeometryAligned,
      maxPositionErrorCm: this.stanceError * 100,
      maxAngularErrorDeg: this.angularError,
      passed: !!this.bones && boardGeometryAligned && this.stanceError <= 0.01 && this.angularError <= 5,
      detail: `${this.stanceDetail} | ${boardDetail}`,
    };
  }

  private calibrateFootOrientations(bones: RiderBones): void {
    const boardWorldInverse = this.board.getWorldQuaternion(this.tmpQuaternion).invert();
    this.leftFootBoardSpace.copy(boardWorldInverse).multiply(bones.leftFoot.getWorldQuaternion(this.tmpQuaternionB));
    this.rightFootBoardSpace.copy(boardWorldInverse).multiply(bones.rightFoot.getWorldQuaternion(this.tmpQuaternionC));
    const leftStance = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), BINDING_ANGLE);
    const rightStance = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -BINDING_ANGLE);
    this.leftFootBoardSpace.multiply(leftStance);
    this.rightFootBoardSpace.multiply(rightStance);
    this.orientationCalibrated = true;
  }

  private orientFoot(foot: THREE.Bone, footBoardSpace: THREE.Quaternion): void {
    const parent = foot.parent;
    if (!parent) return;
    const desiredWorld = this.board.getWorldQuaternion(this.tmpQuaternion).multiply(footBoardSpace);
    const parentWorldInverse = parent.getWorldQuaternion(this.tmpQuaternionB).invert();
    foot.quaternion.copy(parentWorldInverse.multiply(desiredWorld)).normalize();
    this.presentation.updateMatrixWorld(true);
  }

  private alignRigMidpoint(leftFoot: THREE.Bone, rightFoot: THREE.Bone): void {
    const left = this.presentation.worldToLocal(leftFoot.getWorldPosition(new THREE.Vector3()));
    const right = this.presentation.worldToLocal(rightFoot.getWorldPosition(new THREE.Vector3()));
    const actual = left.add(right).multiplyScalar(0.5);
    const desired = LEFT_BINDING.clone().add(RIGHT_BINDING).multiplyScalar(0.5);
    this.riderWrapper.position.add(desired.sub(actual));
    this.presentation.updateMatrixWorld(true);
  }

  private boardTarget(local: THREE.Vector3): THREE.Vector3 {
    return this.board.localToWorld(local.clone());
  }

  private rotateLocal(bone: THREE.Bone, x: number, y: number, z: number): void {
    this.tmpEuler.set(x, y, z, 'XYZ');
    this.tmpQuaternion.setFromEuler(this.tmpEuler);
    bone.quaternion.multiply(this.tmpQuaternion);
  }

  private pinChainRoot(root: THREE.Bone, effector: THREE.Bone, target: THREE.Vector3): void {
    const parent = root.parent;
    if (!parent) return;
    this.presentation.updateMatrixWorld(true);
    const delta = target.clone().sub(effector.getWorldPosition(new THREE.Vector3()));
    parent.getWorldQuaternion(this.tmpQuaternionB).invert();
    delta.applyQuaternion(this.tmpQuaternionB);
    const scale = parent.getWorldScale(this.tmpPosition);
    delta.set(
      delta.x / Math.max(1e-5, scale.x),
      delta.y / Math.max(1e-5, scale.y),
      delta.z / Math.max(1e-5, scale.z),
    );
    root.position.add(delta);
    this.presentation.updateMatrixWorld(true);
  }

  private solveCcd(effector: THREE.Bone, links: THREE.Bone[], target: THREE.Vector3, iterations: number): void {
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (const link of links) {
        this.presentation.updateMatrixWorld(true);
        const linkPosition = link.getWorldPosition(this.tmpPosition);
        const effectorDirection = effector.getWorldPosition(this.tmpPositionB).sub(linkPosition);
        const targetDirection = target.clone().sub(linkPosition);
        if (effectorDirection.lengthSq() < 1e-8 || targetDirection.lengthSq() < 1e-8) continue;
        link.getWorldQuaternion(this.tmpQuaternionB).invert();
        effectorDirection.applyQuaternion(this.tmpQuaternionB).normalize();
        targetDirection.applyQuaternion(this.tmpQuaternionB).normalize();
        this.tmpQuaternion.setFromUnitVectors(effectorDirection, targetDirection);
        const angle = 2 * Math.acos(THREE.MathUtils.clamp(this.tmpQuaternion.w, -1, 1));
        if (angle > 0.46) this.tmpQuaternion.slerpQuaternions(this.identity, this.tmpQuaternion, 0.46 / angle);
        link.quaternion.multiply(this.tmpQuaternion).normalize();
      }
    }
  }
}

import * as THREE from 'three';
import type { RiderState } from '../game/types';
import type { TerrainGenerator } from '../world/TerrainGenerator';

export class CameraRig {
  private readonly desired = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private trauma = 0;
  private time = 0;
  private fov = 62;

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly terrain: TerrainGenerator) {}

  snap(state: RiderState): void {
    this.computeDesired(state, new THREE.Vector2(), false);
    this.camera.position.copy(this.desired);
    this.lookTarget.copy(state.position).add(new THREE.Vector3(0, 1.2, -12));
    this.camera.lookAt(this.lookTarget);
  }

  update(dt: number, state: RiderState, cameraLook: THREE.Vector2, reducedMotion: boolean, specialActive: boolean): void {
    this.time += dt;
    this.computeDesired(state, cameraLook, specialActive);
    const follow = 1 - Math.exp(-dt * (state.grounded ? 4.8 : 2.8));
    this.camera.position.lerp(this.desired, follow);
    const ground = this.terrain.heightAt(this.camera.position.x, this.camera.position.z);
    if (this.camera.position.y < ground + 2.1) this.camera.position.y += (ground + 2.1 - this.camera.position.y) * 0.8;

    const speedLook = 11 + state.speedMps * 0.46;
    this.target.copy(state.position).add(new THREE.Vector3(Math.sin(cameraLook.x) * 7, 1.05 - cameraLook.y * 4, -speedLook));
    this.lookTarget.lerp(this.target, 1 - Math.exp(-dt * 7));
    this.camera.lookAt(this.lookTarget);

    const speedT = THREE.MathUtils.clamp((state.speedMph - 15) / 65, 0, 1);
    const targetFov = 60 + speedT * 20 + (specialActive ? 5 : 0) + Math.min(4, state.airHeight * 0.2);
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-dt * 3.7));
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();

    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    if (!reducedMotion && this.trauma > 0.001) {
      const shake = this.trauma * this.trauma;
      this.camera.position.x += this.noise(this.time * 30, 1) * shake * 0.55;
      this.camera.position.y += this.noise(this.time * 30, 2) * shake * 0.38;
      this.camera.rotation.z += this.noise(this.time * 30, 3) * shake * 0.045;
    }
  }

  addTrauma(amount: number): void { this.trauma = Math.min(1, this.trauma + amount); }

  private computeDesired(state: RiderState, look: THREE.Vector2, special: boolean): void {
    const airPull = THREE.MathUtils.clamp(state.airHeight * 0.45 + state.airTime * 1.8, 0, 24);
    const distance = 8.4 + state.speedMps * 0.18 + airPull + (special ? 3.5 : 0);
    const height = 3.4 + state.speedMps * 0.035 + airPull * 0.4;
    const yaw = look.x * 0.55;
    this.desired.set(
      state.position.x + Math.sin(yaw) * distance,
      state.position.y + height - look.y * 2.2,
      state.position.z + Math.cos(yaw) * distance,
    );
  }

  private noise(t: number, seed: number): number {
    const x = Math.sin(t * 12.9898 + seed * 78.233) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  }
}

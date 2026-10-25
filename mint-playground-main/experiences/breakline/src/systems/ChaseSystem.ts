import * as THREE from 'three';
import type { AssetManager } from '../assets/AssetManager';
import { fitModel } from '../assets/model-utils';
import type { ChaseState, RiderState } from '../game/types';
import type { TerrainGenerator } from '../world/TerrainGenerator';

export class ChaseSystem {
  readonly group = new THREE.Group();
  readonly state: ChaseState = {
    bearDistance: 72, yetiDistance: 34, bearClosing: false, yetiClosing: false, danger: false, caughtBy: null,
  };
  private readonly bear = new THREE.Group();
  private readonly yeti = new THREE.Group();
  private yetiMixer: THREE.AnimationMixer | null = null;
  private time = 0;

  constructor(private readonly terrain: TerrainGenerator) {
    this.group.name = 'pursuers';
    this.bear.name = 'mint-polar-bear-pursuer';
    this.yeti.name = 'mint-yeti-pursuer';
    this.group.add(this.bear, this.yeti);
  }

  async applyMintAssets(assets: AssetManager, mobileDetail = false): Promise<void> {
    if (mobileDetail) {
      this.createMobilePursuers();
      return;
    }
    const [bearModel, yetiAnimation] = await Promise.all([
      assets.loadModel('polar-bear'),
      assets.loadAnimationSet('yeti-animation'),
    ]);
    if (bearModel) {
      fitModel(bearModel, 2.9, 'largest');
      this.bear.add(bearModel);
    }
    if (yetiAnimation) {
      fitModel(yetiAnimation.root, 2.45, 'height');
      this.yeti.add(yetiAnimation.root);
      this.yetiMixer = new THREE.AnimationMixer(yetiAnimation.root);
      const run = [...yetiAnimation.clips.entries()].find(([name]) => name.includes('runfast'))?.[1]
        ?? [...yetiAnimation.clips.values()][0];
      if (run) this.yetiMixer.clipAction(run).play();
    }
  }

  fixedUpdate(dt: number, rider: RiderState, specialActive: boolean): void {
    if (this.state.caughtBy) return;
    this.time += dt;
    this.yetiMixer?.update(dt * 1.18);
    const speed = rider.speedMps;
    const slow = rider.bailing ? 10 : speed < 10 ? 5.8 : speed < 16 ? 2.6 : speed > 27 ? -1.3 : -0.15;
    const bearPenalty = rider.bailing ? 5.2 : 0;
    const boostFallBack = specialActive ? -5.3 : 0;
    const yetiRate = slow + boostFallBack + Math.sin(this.time * 0.7) * 0.15;
    const bearRate = slow * 0.72 + bearPenalty + boostFallBack * 0.65;
    const oldYeti = this.state.yetiDistance;
    const oldBear = this.state.bearDistance;
    this.state.yetiDistance = THREE.MathUtils.clamp(this.state.yetiDistance - yetiRate * dt, 1.4, 58);
    this.state.bearDistance = THREE.MathUtils.clamp(this.state.bearDistance - bearRate * dt, 1.4, 96);
    if (speed > 24 && !rider.bailing) {
      this.state.yetiDistance = Math.min(52, this.state.yetiDistance + 0.25 * dt);
      this.state.bearDistance = Math.min(92, this.state.bearDistance + 0.35 * dt);
    }
    this.state.yetiClosing = this.state.yetiDistance < oldYeti - 0.018;
    this.state.bearClosing = this.state.bearDistance < oldBear - 0.018;
    this.state.danger = Math.min(this.state.yetiDistance, this.state.bearDistance) < 8;
    if (this.state.yetiDistance <= 1.8) this.state.caughtBy = 'YETI';
    else if (this.state.bearDistance <= 1.8) this.state.caughtBy = 'POLAR BEAR';
    this.placePursuer(this.yeti, rider.distance - this.state.yetiDistance, -2.4, 0.78);
    this.placePursuer(this.bear, rider.distance - this.state.bearDistance, 2.6, 0.55);
  }

  reset(): void {
    this.state.bearDistance = 72; this.state.yetiDistance = 34; this.state.bearClosing = false; this.state.yetiClosing = false;
    this.state.danger = false; this.state.caughtBy = null; this.time = 0;
  }

  dispose(): void {
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material) => material.dispose());
    });
  }

  private placePursuer(root: THREE.Group, progress: number, lateral: number, cadence: number): void {
    const s = Math.max(0, progress);
    const x = this.terrain.routeCenter(s) + lateral;
    const z = -s;
    const y = this.terrain.heightAt(x, z);
    root.position.set(x, y + 0.04, z);
    root.rotation.y = Math.PI;
    root.rotation.z = Math.sin(this.time * 8 * cadence) * (root === this.yeti ? 0.035 : 0.09);
    root.position.y += Math.abs(Math.sin(this.time * 8 * cadence)) * (root === this.yeti ? 0.08 : 0.18);
  }

  private createMobilePursuers(): void {
    const bearMaterial = new THREE.MeshStandardMaterial({ color: '#e4fcff', roughness: 0.9 });
    const yetiMaterial = new THREE.MeshStandardMaterial({ color: '#43f2c2', roughness: 0.82 });
    const bearBody = new THREE.Mesh(new THREE.IcosahedronGeometry(0.82, 1), bearMaterial);
    bearBody.scale.set(1.45, 0.72, 0.86);
    bearBody.position.y = 0.76;
    const bearHead = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), bearMaterial);
    bearHead.position.set(0, 1.05, -0.78);
    this.bear.add(bearBody, bearHead);
    const yetiBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.52, 1.15, 4, 8), yetiMaterial);
    yetiBody.position.y = 1.12;
    const yetiHead = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 1), yetiMaterial);
    yetiHead.position.set(0, 2.06, -0.08);
    this.yeti.add(yetiBody, yetiHead);
  }
}

import * as THREE from 'three';
import type { RiderState } from '../game/types';
import { createSeededRandom } from '../utils/random';

const TRACK_POINTS = 900;
const PARTICLES = 280;

export class SnowFXSystem {
  readonly group = new THREE.Group();
  private readonly rng = createSeededRandom(90210);
  private readonly snowfall: THREE.Points;
  private readonly snowPositions: Float32Array;
  private readonly powder: THREE.Points;
  private readonly powderPositions = new Float32Array(PARTICLES * 3);
  private readonly powderVelocity = new Float32Array(PARTICLES * 3);
  private readonly powderLife = new Float32Array(PARTICLES);
  private readonly powderColor = new Float32Array(PARTICLES * 3);
  private powderCursor = 0;
  private readonly leftTrack: THREE.Line;
  private readonly rightTrack: THREE.Line;
  private readonly leftTrackPositions = new Float32Array(TRACK_POINTS * 3);
  private readonly rightTrackPositions = new Float32Array(TRACK_POINTS * 3);
  private trackCursor = 0;
  private lastTrackZ = Number.POSITIVE_INFINITY;

  constructor() {
    this.group.name = 'snow-fx';
    this.snowPositions = new Float32Array(720 * 3);
    for (let i = 0; i < 720; i += 1) {
      this.snowPositions[i * 3] = (this.rng() - 0.5) * 110;
      this.snowPositions[i * 3 + 1] = this.rng() * 55;
      this.snowPositions[i * 3 + 2] = (this.rng() - 0.5) * 130;
    }
    const snowGeometry = new THREE.BufferGeometry(); snowGeometry.setAttribute('position', new THREE.BufferAttribute(this.snowPositions, 3));
    const snowMaterial = new THREE.PointsMaterial({
      color: '#f4fdff',
      map: this.createSoftParticleTexture(),
      size: 0.24,
      transparent: true,
      opacity: 0.74,
      alphaTest: 0.04,
      depthWrite: false,
      sizeAttenuation: true,
    });
    snowMaterial.name = 'procedural-snowflake-points'; this.snowfall = new THREE.Points(snowGeometry, snowMaterial); this.snowfall.frustumCulled = false;

    const powderGeometry = new THREE.BufferGeometry();
    powderGeometry.setAttribute('position', new THREE.BufferAttribute(this.powderPositions, 3));
    powderGeometry.setAttribute('color', new THREE.BufferAttribute(this.powderColor, 3));
    const powderMaterial = new THREE.PointsMaterial({
      vertexColors: true,
      map: this.createSoftParticleTexture(),
      size: 0.42,
      transparent: true,
      opacity: 0.82,
      alphaTest: 0.035,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    powderMaterial.name = 'procedural-powder-points'; this.powder = new THREE.Points(powderGeometry, powderMaterial); this.powder.frustumCulled = false;

    const trackMaterial = new THREE.LineBasicMaterial({ color: '#7ca9bc', transparent: true, opacity: 0.68 }); trackMaterial.name = 'procedural-board-tracks';
    const leftGeometry = new THREE.BufferGeometry(); leftGeometry.setAttribute('position', new THREE.BufferAttribute(this.leftTrackPositions, 3)); leftGeometry.setDrawRange(0, 0);
    const rightGeometry = new THREE.BufferGeometry(); rightGeometry.setAttribute('position', new THREE.BufferAttribute(this.rightTrackPositions, 3)); rightGeometry.setDrawRange(0, 0);
    this.leftTrack = new THREE.Line(leftGeometry, trackMaterial);
    this.rightTrack = new THREE.Line(rightGeometry, trackMaterial.clone());
    this.group.add(this.leftTrack, this.rightTrack, this.snowfall, this.powder);
  }

  update(dt: number, state: RiderState, specialActive: boolean): void {
    const snowAttribute = this.snowfall.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < snowAttribute.count; i += 1) {
      let y = this.snowPositions[i * 3 + 1] - dt * (4 + state.speedMps * 0.08);
      let z = this.snowPositions[i * 3 + 2] + dt * state.speedMps * 0.22;
      if (y < -6) y += 58;
      if (z > 65) z -= 130;
      this.snowPositions[i * 3 + 1] = y; this.snowPositions[i * 3 + 2] = z;
    }
    snowAttribute.needsUpdate = true;
    this.snowfall.position.set(state.position.x, state.position.y - 15, state.position.z - 15);

    if (state.grounded && !state.bailing && Math.abs(state.position.z - this.lastTrackZ) > 0.55) {
      this.appendTrack(state); this.lastTrackZ = state.position.z;
      const carve = Math.abs(state.steer);
      const count = Math.floor((2 + carve * 4 + state.speedMps * 0.05) * (specialActive ? 1.8 : 1));
      for (let i = 0; i < count; i += 1) this.spawnPowder(state.position, state.steer, specialActive ? 'special' : 'snow');
    }
    if (state.grinding) for (let i = 0; i < 3; i += 1) this.spawnPowder(state.position, state.steer, 'spark');
    this.updatePowder(dt);
  }

  burst(position: THREE.Vector3, strength = 1): void {
    for (let i = 0; i < Math.floor(24 * strength); i += 1) this.spawnPowder(position, (this.rng() - 0.5) * 2, 'snow', 1.3 * strength);
  }

  reset(): void {
    this.trackCursor = 0; this.lastTrackZ = Number.POSITIVE_INFINITY;
    this.leftTrack.geometry.setDrawRange(0, 0); this.rightTrack.geometry.setDrawRange(0, 0);
    this.powderLife.fill(0); this.powderPositions.fill(0);
    (this.powder.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Points || object instanceof THREE.Line)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (material instanceof THREE.PointsMaterial) material.map?.dispose();
        material.dispose();
      });
    });
  }

  private appendTrack(state: RiderState): void {
    if (this.trackCursor >= TRACK_POINTS) {
      this.trackCursor = 0;
      this.leftTrack.geometry.setDrawRange(0, 0); this.rightTrack.geometry.setDrawRange(0, 0);
    }
    const sideX = Math.cos(state.steer * 0.45) * 0.42;
    const y = state.position.y - 0.54;
    const index = this.trackCursor * 3;
    this.leftTrackPositions[index] = state.position.x - sideX; this.leftTrackPositions[index + 1] = y; this.leftTrackPositions[index + 2] = state.position.z;
    this.rightTrackPositions[index] = state.position.x + sideX; this.rightTrackPositions[index + 1] = y; this.rightTrackPositions[index + 2] = state.position.z;
    this.trackCursor += 1;
    this.leftTrack.geometry.setDrawRange(0, this.trackCursor); this.rightTrack.geometry.setDrawRange(0, this.trackCursor);
    (this.leftTrack.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.rightTrack.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private spawnPowder(position: THREE.Vector3, steer: number, kind: 'snow' | 'spark' | 'special', strength = 1): void {
    const i = this.powderCursor; this.powderCursor = (this.powderCursor + 1) % PARTICLES;
    const index = i * 3;
    this.powderPositions[index] = position.x + (this.rng() - 0.5) * 0.8;
    this.powderPositions[index + 1] = position.y + this.rng() * 0.35;
    this.powderPositions[index + 2] = position.z + 0.45 + this.rng() * 0.7;
    this.powderVelocity[index] = (-steer * 2.4 + (this.rng() - 0.5) * 2.5) * strength;
    this.powderVelocity[index + 1] = (0.8 + this.rng() * 2.2) * strength;
    this.powderVelocity[index + 2] = (1.2 + this.rng() * 3.5) * strength;
    this.powderLife[i] = kind === 'spark' ? 0.34 : 0.7 + this.rng() * 0.5;
    const color = kind === 'spark' ? [1, 0.72, 0.18] : kind === 'special' ? [0.1, 1, 1] : [0.8, 0.95, 1];
    this.powderColor[index] = color[0]; this.powderColor[index + 1] = color[1]; this.powderColor[index + 2] = color[2];
  }

  private updatePowder(dt: number): void {
    for (let i = 0; i < PARTICLES; i += 1) {
      if (this.powderLife[i] <= 0) continue;
      this.powderLife[i] -= dt;
      const index = i * 3;
      this.powderPositions[index] += this.powderVelocity[index] * dt;
      this.powderPositions[index + 1] += this.powderVelocity[index + 1] * dt;
      this.powderPositions[index + 2] += this.powderVelocity[index + 2] * dt;
      this.powderVelocity[index + 1] -= 2.8 * dt;
      this.powderVelocity[index] *= Math.exp(-dt * 1.8);
      if (this.powderLife[i] <= 0) this.powderPositions[index + 1] = -9999;
    }
    (this.powder.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.powder.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  private createSoftParticleTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) return new THREE.CanvasTexture(canvas);
    const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.42, 'rgba(255,255,255,.86)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}

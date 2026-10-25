import * as THREE from 'three';
import type { AssetManager } from '../assets/AssetManager';
import { applySharedMaterial, createParkMaterial } from '../assets/MaterialLibrary';
import { fitModel, quaternionAlongSegment } from '../assets/model-utils';
import type { TerrainSample, WorldQuery } from '../game/types';
import { MOUNTAIN_LENGTH } from '../game/types';
import { createSeededRandom } from '../utils/random';
import type { StaticColliderPlan } from './collision-types';

export type GrindRail = {
  id: string;
  kind: 'rail' | 'cable';
  start: THREE.Vector3;
  end: THREE.Vector3;
  radius: number;
  visual?: 'straight' | 'kink' | 'box' | 'cable';
  width?: number;
  deckHeight?: number;
};

type PropPlacement = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  variant: number;
};

export type RideableSurfaceStrip = {
  id: string;
  start: THREE.Vector3;
  end: THREE.Vector3;
  width: number;
  mountStep?: number;
  region?: string;
};

type JumpFeature = {
  progress: number;
  radius: number;
  height: number;
  width: number;
  launchVelocity: number;
};

const WIDTH = 260;
const X_SEGMENTS = 84;
const Z_SEGMENTS = 420;
const START_Z = 40;
const END_Z = -MOUNTAIN_LENGTH - 80;
const JUMP_VISUAL_EMBED = 0.04;

export class TerrainGenerator implements WorldQuery {
  readonly group = new THREE.Group();
  readonly rails: GrindRail[] = [];
  private readonly rideableSurfaces: RideableSurfaceStrip[] = [];
  readonly jumpCenters: readonly JumpFeature[] = [
    { progress: 76, radius: 14, height: 2.4, width: 9, launchVelocity: 4.4 },
    { progress: 235, radius: 20, height: 5, width: 12, launchVelocity: 5.2 },
    { progress: 525, radius: 25, height: 6.4, width: 13, launchVelocity: 5.8 },
    { progress: 690, radius: 24, height: 5.7, width: 13, launchVelocity: 5.5 },
    { progress: 1110, radius: 34, height: 9.5, width: 18, launchVelocity: 7.2 },
    { progress: 1360, radius: 22, height: 5.6, width: 13, launchVelocity: 5.5 },
    { progress: 1590, radius: 29, height: 7.4, width: 17, launchVelocity: 6.4 },
  ];
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly propArt = new THREE.Group();
  private readonly mobilePropArt = new THREE.Group();
  private readonly railArt = new THREE.Group();
  private readonly markerArt = new THREE.Group();
  private readonly jumpArt = new THREE.Group();
  private readonly propPlan = this.createPropPlan();
  private mobileDetail = false;

  constructor() {
    this.group.name = 'mountain-world';
    this.mesh = this.createTerrainMesh();
    this.propArt.name = 'mint-alpine-props';
    this.mobilePropArt.name = 'mint-alpine-mobile-props';
    this.mobilePropArt.visible = false;
    this.railArt.name = 'mint-park-rails';
    this.markerArt.name = 'mint-park-markers';
    this.jumpArt.name = 'mint-snow-park-jumps';
    this.group.add(this.mesh, this.propArt, this.mobilePropArt, this.railArt, this.markerArt, this.jumpArt);
    this.createMobileProps();
    this.createRails();
  }

  async applyMintAssets(assets: AssetManager): Promise<void> {
    const [snowMaterial, tallTree, mediumTree, youngTree, cluster, roundedRock, fracturedRock, straightRail, kinkedRail, boxRail, routeMarker, warningSign, beginnerKicker, mediumTabletop, hipJump, largeStepUp, landingBerm] = await Promise.all([
      assets.loadPbrMaterial('material-powder', 20, 140),
      assets.loadModel('prop-tall-conifer'),
      assets.loadModel('prop-medium-conifer'),
      assets.loadModel('prop-young-conifer'),
      assets.loadModel('prop-conifer-cluster'),
      assets.loadModel('prop-rounded-boulder'),
      assets.loadModel('prop-fractured-boulder'),
      assets.loadModel('prop-straight-rail'),
      assets.loadModel('prop-kinked-rail'),
      assets.loadModel('prop-low-box-rail'),
      assets.loadModel('prop-route-marker'),
      assets.loadModel('prop-warning-sign'),
      assets.loadModelArtifact('snow-park-jumps', 'beginner-kicker'),
      assets.loadModelArtifact('snow-park-jumps', 'medium-tabletop'),
      assets.loadModelArtifact('snow-park-jumps', 'hip-jump'),
      assets.loadModelArtifact('snow-park-jumps', 'large-step-up'),
      assets.loadModelArtifact('snow-park-jumps', 'landing-berm'),
    ]);
    if (snowMaterial) {
      this.mesh.material.dispose();
      this.mesh.material = snowMaterial;
    }

    const treeModels = [
      tallTree && fitModel(tallTree, 9.5, 'height'),
      mediumTree && fitModel(mediumTree, 7.5, 'height'),
      youngTree && fitModel(youngTree, 5.2, 'height'),
      cluster && fitModel(cluster, 8.4, 'height'),
    ].filter((model): model is THREE.Object3D => !!model);
    const rockModels = [
      roundedRock && fitModel(roundedRock, 3.6, 'largest'),
      fracturedRock && fitModel(fracturedRock, 4.2, 'largest'),
    ].filter((model): model is THREE.Object3D => !!model);
    this.populateProps(treeModels, rockModels);

    const railModels = { straight: straightRail, kink: kinkedRail, box: boxRail };
    const railMaterial = createParkMaterial('rail');
    const boxMaterial = createParkMaterial('box');
    for (const [kind, source] of Object.entries(railModels) as Array<[keyof typeof railModels, THREE.Object3D | null]>) {
      if (!source) continue;
      fitModel(source, 1, 'largest');
      applySharedMaterial(source, kind === 'box' ? boxMaterial : railMaterial);
    }
    this.rails.forEach((rail) => {
      if (rail.visual === 'cable') return;
      const template = railModels[rail.visual ?? 'straight'];
      if (!template) return;
      const source = template.clone(true);
      const sourceHeight = new THREE.Box3().setFromObject(source).getSize(new THREE.Vector3()).y;
      const root = new THREE.Group();
      root.name = `mint-${rail.id}`;
      root.add(source);
      const direction = new THREE.Vector3().subVectors(rail.end, rail.start);
      root.position.copy(rail.start).add(rail.end).multiplyScalar(0.5);
      root.userData.progress = Math.max(0, -root.position.z);
      quaternionAlongSegment(rail.start, rail.end, root.quaternion);
      const profile = rail.visual === 'box' ? new THREE.Vector3(3.6, 3.6, direction.length()) : new THREE.Vector3(3.2, 4.4, direction.length());
      root.scale.copy(profile);
      root.position.y -= sourceHeight * profile.y * 0.92;
      this.railArt.add(root);
    });

    const markerModels = [routeMarker, warningSign].filter((model): model is THREE.Object3D => !!model);
    const markerMaterial = createParkMaterial('marker');
    markerModels.forEach((model) => {
      fitModel(model, 2.35, 'height');
      applySharedMaterial(model, markerMaterial);
    });
    this.featureMarkerPlans().forEach((plan, index) => {
      const source = markerModels[index % markerModels.length];
      if (!source) return;
      const root = source.clone(true);
      root.name = `mint-${plan.id}`;
      root.position.copy(plan.position);
      root.rotation.y = plan.rotationY;
      root.userData.progress = Math.max(0, -root.position.z);
      this.markerArt.add(root);
    });

    const jumpModels = [beginnerKicker, mediumTabletop, hipJump, mediumTabletop, largeStepUp, hipJump, largeStepUp];
    const jumpMaterial = createParkMaterial('jump');
    new Set([beginnerKicker, mediumTabletop, hipJump, largeStepUp, landingBerm])
      .forEach((model) => { if (model) applySharedMaterial(model, jumpMaterial); });
    this.jumpCenters.forEach((jump, index) => {
      const source = jumpModels[index];
      if (!source) return;
      const root = new THREE.Group();
      root.name = `mint-snow-jump-${index}`;
      const visual = source.clone(true);
      this.fitJumpModel(visual, jump.width, jump.height * 1.06, jump.radius * 1.7);
      root.add(visual);
      const progress = jump.progress;
      const x = this.routeCenter(progress);
      const z = -progress;
      const halfLength = jump.radius * 0.82;
      const startProgress = Math.max(0, progress - halfLength);
      const endProgress = progress + halfLength;
      const start = new THREE.Vector3(this.routeCenter(startProgress), 0, -startProgress);
      const end = new THREE.Vector3(this.routeCenter(endProgress), 0, -endProgress);
      start.y = this.baseHeightAt(start.x, start.z);
      end.y = this.baseHeightAt(end.x, end.z);
      root.position.set(x, this.baseHeightAt(x, z) - JUMP_VISUAL_EMBED, z);
      quaternionAlongSegment(start, end, root.quaternion);
      root.userData.progress = progress;
      this.jumpArt.add(root);
    });
    if (landingBerm) {
      for (const progress of [1134, 1615]) {
        const root = new THREE.Group();
        root.name = `mint-landing-berm-${progress}`;
        const visual = landingBerm.clone(true);
        this.fitJumpModel(visual, 15, 3.2, 13);
        root.add(visual);
        const x = this.routeCenter(progress);
        const startProgress = progress - 6.5;
        const endProgress = progress + 6.5;
        const start = new THREE.Vector3(this.routeCenter(startProgress), 0, -startProgress);
        const end = new THREE.Vector3(this.routeCenter(endProgress), 0, -endProgress);
        start.y = this.baseHeightAt(start.x, start.z);
        end.y = this.baseHeightAt(end.x, end.z);
        root.position.set(x, this.baseHeightAt(x, -progress) - JUMP_VISUAL_EMBED, -progress);
        quaternionAlongSegment(start, end, root.quaternion);
        root.userData.progress = progress;
        this.jumpArt.add(root);
      }
    }
  }

  routeCenter(progress: number): number {
    return Math.sin(progress * 0.0062) * 17 + Math.sin(progress * 0.0147 + 0.8) * 6;
  }

  addRideableSurface(surface: RideableSurfaceStrip): void {
    this.rideableSurfaces.push({
      ...surface,
      start: surface.start.clone(),
      end: surface.end.clone(),
    });
  }

  heightAt(x: number, z: number): number {
    const s = THREE.MathUtils.clamp(-z, 0, MOUNTAIN_LENGTH + 100);
    const center = this.routeCenter(s);
    const lateral = x - center;
    let height = 210 - s * 0.105;

    height += Math.sin(s * 0.018) * 2.3 + Math.sin(s * 0.051 + x * 0.028) * 0.8;
    height += Math.sin(x * 0.055 + s * 0.008) * 1.4 + Math.sin(x * 0.13 - s * 0.011) * 0.34;
    height += Math.pow(Math.abs(lateral) / 74, 2) * 8.5;

    const channels = this.sectionMask(s, 500, 735, 55);
    height += channels * (Math.cos(lateral * 0.105) * 1.7 + Math.pow(Math.abs(lateral) / 48, 2) * 5);

    const canyon = this.sectionMask(s, 780, 1040, 70);
    const canyonWall = Math.max(0, Math.abs(lateral) - 27);
    height += canyon * Math.pow(canyonWall / 12, 1.55) * 7;

    for (const jump of this.jumpCenters) height += this.jumpBump(s, jump.progress, jump.radius, jump.height);

    height -= THREE.MathUtils.smoothstep(s, 920, 955) * 17;
    if (s > 1430) height -= (s - 1430) * 0.055;
    return height;
  }

  sampleSurface(position: THREE.Vector3, target?: TerrainSample): TerrainSample {
    const output = target ?? {
      point: new THREE.Vector3(), normal: new THREE.Vector3(), routeCenter: 0, progress: 0, region: 'opening',
    };
    const x = position.x;
    const z = position.z;
    const epsilon = 0.65;
    const h = this.heightAt(x, z);
    const hx = this.heightAt(x + epsilon, z) - this.heightAt(x - epsilon, z);
    const hz = this.heightAt(x, z + epsilon) - this.heightAt(x, z - epsilon);
    output.point.set(x, h, z);
    output.normal.set(-hx / (epsilon * 2), 1, -hz / (epsilon * 2)).normalize();
    output.progress = THREE.MathUtils.clamp(-z, 0, MOUNTAIN_LENGTH);
    output.routeCenter = this.routeCenter(output.progress);
    output.region = this.regionAt(output.progress);

    let selectedHeight = h;
    for (const surface of this.rideableSurfaces) {
      const dx = surface.end.x - surface.start.x;
      const dz = surface.end.z - surface.start.z;
      const lengthSq = dx * dx + dz * dz;
      if (lengthSq < 1e-8) continue;
      const t = ((x - surface.start.x) * dx + (z - surface.start.z) * dz) / lengthSq;
      if (t < 0 || t > 1) continue;
      const closestX = surface.start.x + dx * t;
      const closestZ = surface.start.z + dz * t;
      const lateralSq = (x - closestX) ** 2 + (z - closestZ) ** 2;
      if (lateralSq > (surface.width * 0.5) ** 2) continue;

      const surfaceY = THREE.MathUtils.lerp(surface.start.y, surface.end.y, t);
      const mountStep = surface.mountStep ?? 1.25;
      if (surfaceY <= selectedHeight || position.y + mountStep < surfaceY) continue;

      const rise = surface.end.y - surface.start.y;
      output.normal.set(-dx * rise, lengthSq, -dz * rise).normalize();
      output.point.y = surfaceY;
      output.region = surface.region ?? surface.id;
      selectedHeight = surfaceY;
    }
    return output;
  }

  nearestRail(position: THREE.Vector3, maxDistance = 2.2): { rail: GrindRail; t: number; point: THREE.Vector3; distance: number } | null {
    let best: { rail: GrindRail; t: number; point: THREE.Vector3; distance: number } | null = null;
    const segment = new THREE.Vector3();
    const toPoint = new THREE.Vector3();
    const point = new THREE.Vector3();
    for (const rail of this.rails) {
      segment.subVectors(rail.end, rail.start);
      const lengthSq = segment.lengthSq();
      const t = THREE.MathUtils.clamp(toPoint.subVectors(position, rail.start).dot(segment) / lengthSq, 0, 1);
      point.copy(rail.start).addScaledVector(segment, t);
      const distance = point.distanceTo(position);
      if (distance <= maxDistance && (!best || distance < best.distance)) best = { rail, t, point: point.clone(), distance };
    }
    return best;
  }

  colliderData(): { vertices: Float32Array; indices: Uint32Array } {
    const position = this.mesh.geometry.getAttribute('position');
    const index = this.mesh.geometry.getIndex();
    return {
      vertices: new Float32Array(position.array as ArrayLike<number>),
      indices: new Uint32Array(index?.array as ArrayLike<number>),
    };
  }

  collisionPrimitives(): StaticColliderPlan[] {
    const colliders: StaticColliderPlan[] = [];
    this.propPlan.trees.forEach((placement, index) => {
      const scale = placement.scale.y;
      const halfHeight = 2.45 * scale;
      colliders.push({
        id: `tree-${index}`, tag: 'tree', shape: 'cylinder',
        position: placement.position.clone().add(new THREE.Vector3(0, halfHeight, 0)),
        radius: 0.48 * scale, halfHeight,
      });
    });
    this.propPlan.rocks.forEach((placement, index) => {
      const radius = 1.18 * Math.max(placement.scale.x, placement.scale.y, placement.scale.z);
      colliders.push({
        id: `rock-${index}`, tag: 'rock', shape: 'ball',
        position: placement.position.clone().add(new THREE.Vector3(0, radius * 0.62, 0)),
        radius,
      });
    });
    this.rails.forEach((rail) => {
      const direction = new THREE.Vector3().subVectors(rail.end, rail.start);
      const length = direction.length();
      const rotation = rail.kind === 'cable'
        ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())
        : quaternionAlongSegment(rail.start, rail.end);
      const deckHeight = rail.deckHeight ?? (rail.kind === 'cable' ? rail.radius * 2 : rail.visual === 'box' ? 0.82 : 0.34);
      const center = rail.start.clone().add(rail.end).multiplyScalar(0.5);
      if (rail.kind === 'cable') {
        colliders.push({
          id: `${rail.id}-solid`, tag: `rail:${rail.id}`, shape: 'capsule',
          position: center, rotation, radius: rail.radius, halfHeight: Math.max(0.01, length * 0.5 - rail.radius),
        });
      } else {
        center.y -= deckHeight * 0.5;
        colliders.push({
          id: `${rail.id}-solid`, tag: `rail:${rail.id}`, shape: 'box',
          position: center, rotation,
          halfExtents: new THREE.Vector3((rail.width ?? 0.62) * 0.5, deckHeight * 0.5, length * 0.5),
        });
      }
      colliders.push({
        id: `${rail.id}-sensor`, tag: `grind:${rail.id}`, shape: 'box', sensor: true,
        position: rail.start.clone().add(rail.end).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.3, 0)),
        rotation: quaternionAlongSegment(rail.start, rail.end),
        halfExtents: new THREE.Vector3(Math.max(0.75, (rail.width ?? 0.6) * 0.8), 0.72, length * 0.5),
      });
    });
    this.jumpCenters.forEach((jump, index) => {
      const progress = jump.progress;
      const x = this.routeCenter(progress);
      const z = -progress;
      const before = this.routeCenter(Math.max(0, progress - 5));
      const after = this.routeCenter(progress + 5);
      const rotationY = Math.atan2(after - before, -10);
      const rotation = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rotationY);
      const lateral = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
      for (const side of [-1, 1]) {
        const position = new THREE.Vector3(x, 0, z).addScaledVector(lateral, side * jump.width * 0.5);
        const halfHeight = Math.max(0.45, jump.height * 0.5);
        position.y = this.baseHeightAt(position.x, position.z) + halfHeight - JUMP_VISUAL_EMBED;
        colliders.push({
          id: `snow-jump-${index}-side-${side < 0 ? 'left' : 'right'}`,
          tag: 'snow-jump-side',
          shape: 'box',
          position,
          rotation,
          halfExtents: new THREE.Vector3(0.32, halfHeight, jump.radius * 0.82),
        });
      }
    });
    this.featureMarkerPlans().forEach((plan) => {
      colliders.push({
        id: `${plan.id}-solid`, tag: 'course-marker', shape: 'box',
        position: plan.position.clone().add(new THREE.Vector3(0, 1.05, 0)),
        rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), plan.rotationY),
        halfExtents: new THREE.Vector3(0.45, 1.05, 0.34),
      });
    });
    return colliders;
  }

  updateVisibility(progress: number): void {
    const apply = (root: THREE.Group, range: number) => {
      root.children.forEach((object) => {
        const objectProgress = Number(object.userData.progress);
        const inRange = !Number.isFinite(objectProgress) || Math.abs(objectProgress - progress) <= range;
        const mobileJumpMarker = this.mobileDetail && object.name.startsWith('mint-jump-marker-');
        const markerIndex = mobileJumpMarker ? Number(object.name.slice(object.name.lastIndexOf('-') + 1)) : 0;
        object.visible = inRange && (!mobileJumpMarker || markerIndex % 3 === 0);
      });
    };
    apply(this.propArt, this.mobileDetail ? 0 : 390);
    apply(this.railArt, 460);
    apply(this.markerArt, 460);
    apply(this.jumpArt, 390);
  }

  setMobileDetail(enabled: boolean): void {
    this.mobileDetail = enabled;
    this.propArt.visible = !enabled;
    this.mobilePropArt.visible = enabled;
    this.jumpArt.visible = !enabled;
    if (enabled && this.mesh.geometry.getAttribute('position').count > 20_000) {
      const replacement = this.createTerrainMesh(56, 240);
      this.mesh.geometry.dispose();
      this.mesh.geometry = replacement.geometry;
      replacement.material.dispose();
    }
  }

  dispose(): void {
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
  }

  private createTerrainMesh(xSegments = X_SEGMENTS, zSegments = Z_SEGMENTS): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
    const geometry = new THREE.PlaneGeometry(WIDTH, START_Z - END_Z, xSegments, zSegments);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, (START_Z + END_Z) / 2);
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors: number[] = [];
    const snowA = new THREE.Color('#d7edf4');
    const snowB = new THREE.Color('#f1fbff');
    const color = new THREE.Color();
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const y = this.heightAt(x, z);
      positions.setY(i, y);
      const s = THREE.MathUtils.clamp(-z / MOUNTAIN_LENGTH, 0, 1);
      const shade = THREE.MathUtils.clamp(0.45 + 0.35 * Math.sin(x * 0.06 + z * 0.03) + 0.2 * s, 0, 1);
      color.copy(snowA).lerp(snowB, shade);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.87, metalness: 0.02 });
    material.name = 'procedural-snow-surface';
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'procedural-terrain';
    mesh.receiveShadow = true;
    return mesh;
  }

  private populateProps(treeModels: THREE.Object3D[], rockModels: THREE.Object3D[]): void {
    const treeTransforms = treeModels.map(() => [] as THREE.Matrix4[]);
    this.propPlan.trees.forEach((placement) => {
      if (!treeModels.length) return;
      treeTransforms[placement.variant % treeModels.length].push(new THREE.Matrix4().compose(placement.position, placement.quaternion, placement.scale));
    });
    treeModels.forEach((model, index) => this.addInstancedModel(model, treeTransforms[index], `mint-conifer-${index}`));

    const rockTransforms = rockModels.map(() => [] as THREE.Matrix4[]);
    this.propPlan.rocks.forEach((placement) => {
      if (!rockModels.length) return;
      rockTransforms[placement.variant % rockModels.length].push(new THREE.Matrix4().compose(placement.position, placement.quaternion, placement.scale));
    });
    rockModels.forEach((model, index) => this.addInstancedModel(model, rockTransforms[index], `mint-rock-${index}`));
  }

  private fitJumpModel(root: THREE.Object3D, width: number, height: number, length: number): void {
    root.updateMatrixWorld(true);
    let size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    if (size.x > size.z) {
      root.rotation.y += Math.PI * 0.5;
      root.updateMatrixWorld(true);
      size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    }
    root.scale.multiply(new THREE.Vector3(
      width / Math.max(0.001, size.x),
      height / Math.max(0.001, size.y),
      length / Math.max(0.001, size.z),
    ));
    root.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(root);
    const center = fitted.getCenter(new THREE.Vector3());
    root.position.set(-center.x, -fitted.min.y, -center.z);
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
  }

  private createMobileProps(): void {
    const trunkGeometry = new THREE.CylinderGeometry(0.22, 0.34, 2.1, 6);
    const crownGeometry = new THREE.ConeGeometry(2.15, 6.2, 7);
    const rockGeometry = new THREE.DodecahedronGeometry(1.25, 0);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#31585a', roughness: 0.92 });
    const crownMaterial = new THREE.MeshStandardMaterial({ color: '#176b62', roughness: 0.88 });
    const rockMaterial = new THREE.MeshStandardMaterial({ color: '#6f9394', roughness: 0.96 });
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, this.propPlan.trees.length);
    const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, this.propPlan.trees.length);
    const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, this.propPlan.rocks.length);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    this.propPlan.trees.forEach((placement, index) => {
      position.copy(placement.position).addScaledVector(new THREE.Vector3(0, 1, 0), placement.scale.y * 1.05);
      scale.set(placement.scale.x, placement.scale.y, placement.scale.z);
      matrix.compose(position, placement.quaternion, scale);
      trunks.setMatrixAt(index, matrix);
      position.copy(placement.position).addScaledVector(new THREE.Vector3(0, 1, 0), placement.scale.y * 4);
      matrix.compose(position, placement.quaternion, scale);
      crowns.setMatrixAt(index, matrix);
    });
    this.propPlan.rocks.forEach((placement, index) => {
      position.copy(placement.position).add(new THREE.Vector3(0, placement.scale.y * 0.72, 0));
      matrix.compose(position, placement.quaternion, placement.scale);
      rocks.setMatrixAt(index, matrix);
    });
    [trunks, crowns, rocks].forEach((mesh) => {
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.mobilePropArt.add(mesh);
    });
  }

  private addInstancedModel(prototype: THREE.Object3D, transforms: THREE.Matrix4[], name: string): void {
    if (transforms.length === 0) return;
    prototype.updateMatrixWorld(true);
    const chunks = new Map<number, THREE.Matrix4[]>();
    const position = new THREE.Vector3();
    transforms.forEach((transform) => {
      position.setFromMatrixPosition(transform);
      const chunk = Math.floor(Math.max(0, -position.z) / 240);
      const values = chunks.get(chunk) ?? [];
      values.push(transform);
      chunks.set(chunk, values);
    });
    let part = 0;
    prototype.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh) return;
      chunks.forEach((chunkTransforms, chunk) => {
        const instances = new THREE.InstancedMesh(object.geometry, object.material, chunkTransforms.length);
        const matrix = new THREE.Matrix4();
        chunkTransforms.forEach((transform, index) => {
          matrix.multiplyMatrices(transform, object.matrixWorld);
          instances.setMatrixAt(index, matrix);
        });
        instances.name = `${name}-part-${part}-chunk-${chunk}`;
        instances.userData.progress = (chunk + 0.5) * 240;
        instances.castShadow = true;
        instances.receiveShadow = true;
        instances.instanceMatrix.needsUpdate = true;
        instances.computeBoundingBox();
        instances.computeBoundingSphere();
        this.propArt.add(instances);
      });
      part += 1;
    });
  }

  private createRails(): void {
    const addRail = (
      id: string,
      s0: number,
      s1: number,
      lateral0: number,
      lateral1: number,
      lift: number,
      visual: 'straight' | 'kink' | 'box',
      width: number,
    ) => {
      const start = new THREE.Vector3(this.routeCenter(s0) + lateral0, this.heightAt(this.routeCenter(s0) + lateral0, -s0) + lift, -s0);
      const end = new THREE.Vector3(this.routeCenter(s1) + lateral1, this.heightAt(this.routeCenter(s1) + lateral1, -s1) + lift, -s1);
      const rail = { id, kind: 'rail', start, end, radius: visual === 'box' ? 0.34 : 0.16, visual, width, deckHeight: visual === 'box' ? 0.82 : 0.34 } satisfies GrindRail;
      this.rails.push(rail);
    };
    addRail('starter-box', 108, 130, -7, -7, 0.92, 'box', 1.18);
    addRail('starter-straight', 168, 194, 8, 7, 1.02, 'straight', 0.7);
    addRail('park-long-box', 334, 370, -7, -5, 0.96, 'box', 1.24);
    addRail('park-kink', 424, 458, 9, 15, 1.18, 'kink', 0.78);
    addRail('powder-transfer-a', 610, 636, -12, -8, 1.08, 'straight', 0.68);
    addRail('powder-transfer-b', 642, 672, 8, 15, 1.15, 'box', 1.08);
    addRail('canyon-rail', 824, 864, -12, -8, 1.28, 'straight', 0.72);
    addRail('canyon-kink', 902, 934, 10, 4, 1.2, 'kink', 0.78);
    addRail('forest-box', 1190, 1220, -9, -6, 0.92, 'box', 1.14);
    addRail('finale-hero', 1512, 1564, 6, 13, 1.32, 'straight', 0.76);
  }

  private createPropPlan(): { trees: PropPlacement[]; rocks: PropPlacement[] } {
    const rng = createSeededRandom(1847);
    const trees: PropPlacement[] = [];
    for (let i = 0; i < 230 * 4 && trees.length < 230; i += 1) {
      const s = 80 + rng() * (MOUNTAIN_LENGTH - 120);
      const forestBias = s > 1030 && s < 1430 ? 0.68 : 0.38;
      if (rng() > forestBias) continue;
      const side = rng() > 0.5 ? 1 : -1;
      const corridor = s > 780 && s < 1040 ? 38 : 50;
      const x = this.routeCenter(s) + side * (corridor + rng() * 76);
      const z = -s + (rng() - 0.5) * 8;
      const scale = 0.68 + rng() * 0.75;
      trees.push({
        position: new THREE.Vector3(x, this.heightAt(x, z), z),
        quaternion: new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rng() * Math.PI * 2),
        scale: new THREE.Vector3(scale, scale, scale),
        variant: Math.floor(rng() * 4),
      });
    }
    const rocks: PropPlacement[] = [];
    for (let i = 0; i < 70; i += 1) {
      const s = 180 + rng() * (MOUNTAIN_LENGTH - 220);
      const side = rng() > 0.5 ? 1 : -1;
      const x = this.routeCenter(s) + side * (48 + rng() * 74);
      const z = -s;
      rocks.push({
        position: new THREE.Vector3(x, this.heightAt(x, z) - 0.2, z),
        quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 0.16, rng() * Math.PI * 2, rng() * 0.12)),
        scale: new THREE.Vector3(0.55 + rng() * 1.2, 0.5 + rng() * 0.7, 0.55 + rng() * 1.1),
        variant: Math.floor(rng() * 2),
      });
    }
    return { trees, rocks };
  }

  private featureMarkerPlans(): Array<{ id: string; position: THREE.Vector3; rotationY: number }> {
    const railPlans = this.rails
      .filter((rail) => rail.kind === 'rail')
      .map((rail, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const progress = Math.max(0, -rail.start.z - 5);
        const x = rail.start.x + side * 2.7;
        const z = -progress;
        return {
          id: `feature-marker-${rail.id}`,
          position: new THREE.Vector3(x, this.heightAt(x, z), z),
          rotationY: side < 0 ? 0.24 : -0.24,
        };
      });
    const jumpPlans = this.jumpCenters.map((jump, index) => {
      const side = index % 2 === 0 ? 1 : -1;
      const progress = Math.max(0, jump.progress - jump.radius * 0.72);
      const x = this.routeCenter(progress) + side * 6.2;
      const z = -progress;
      return {
        id: `jump-marker-${index}`,
        position: new THREE.Vector3(x, this.heightAt(x, z), z),
        rotationY: side < 0 ? 0.24 : -0.24,
      };
    });
    return [...railPlans, ...jumpPlans];
  }

  private sectionMask(value: number, start: number, end: number, feather: number): number {
    return THREE.MathUtils.smoothstep(value, start - feather, start) * (1 - THREE.MathUtils.smoothstep(value, end, end + feather));
  }

  private jumpBump(progress: number, center: number, radius: number, height: number): number {
    const x = Math.abs(progress - center) / radius;
    return x >= 1 ? 0 : Math.pow(1 - x * x, 2) * height;
  }

  private baseHeightAt(x: number, z: number): number {
    const progress = THREE.MathUtils.clamp(-z, 0, MOUNTAIN_LENGTH + 100);
    let height = this.heightAt(x, z);
    for (const jump of this.jumpCenters) {
      height -= this.jumpBump(progress, jump.progress, jump.radius, jump.height);
    }
    return height;
  }

  private regionAt(progress: number): string {
    if (progress < 260) return 'opening-slope';
    if (progress < 510) return 'lift-corridor';
    if (progress < 780) return 'powder-channels';
    if (progress < 1050) return 'rock-canyon';
    if (progress < 1420) return 'conifer-forest';
    return 'final-chute';
  }
}

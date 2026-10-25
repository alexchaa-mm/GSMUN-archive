import * as THREE from 'three';
import type { AssetManager } from '../assets/AssetManager';
import { applyMintMaterialRole, createParkMaterial, MINT_ALPINE } from '../assets/MaterialLibrary';
import { fitModel, quaternionAlongSegment } from '../assets/model-utils';
import type { GrindRail, TerrainGenerator } from '../world/TerrainGenerator';
import type { MovingColliderTransform, StaticColliderPlan } from '../world/collision-types';

const STATION_PROGRESS = [178, 675] as const;

export class LiftSystem {
  readonly group = new THREE.Group();
  readonly cableRail: GrindRail;
  private readonly chairs: THREE.Group[] = [];
  private readonly cableMeshes: THREE.Mesh[] = [];
  private readonly chairCurve: THREE.CatmullRomCurve3;
  private readonly stationSize = new THREE.Vector3(14.1, 12.8, 15);
  private stationRideLinesCreated = false;
  private time = 0;

  constructor(private readonly terrain: TerrainGenerator) {
    this.group.name = 'mint-ski-lift';
    const points = [190, 300, 420, 540, 660].map((s) => {
      const x = terrain.routeCenter(s) + 42;
      return new THREE.Vector3(x, terrain.heightAt(x, -s) + 16.5, -s);
    });
    const returnPoints = [...points].reverse().map((point) => point.clone().add(new THREE.Vector3(5, -0.25, 0)));
    this.chairCurve = new THREE.CatmullRomCurve3([...points, ...returnPoints], true, 'centripetal');
    this.addCable(this.chairCurve, 0.095);

    const s0 = 285;
    const s1 = 405;
    const x0 = terrain.routeCenter(s0) + 12;
    const x1 = terrain.routeCenter(s1) + 15;
    this.cableRail = {
      id: 'service-cable',
      kind: 'cable',
      radius: 0.13,
      start: new THREE.Vector3(x0, terrain.heightAt(x0, -s0) + 2.15, -s0),
      end: new THREE.Vector3(x1, terrain.heightAt(x1, -s1) + 2.35, -s1),
    };
    const serviceCurve = new THREE.LineCurve3(this.cableRail.start, this.cableRail.end);
    const service = new THREE.Mesh(
      new THREE.TubeGeometry(serviceCurve, 32, 0.13, 7, false),
      this.cableMaterial(),
    );
    service.name = 'procedural-grindable-service-cable';
    service.castShadow = true;
    this.cableMeshes.push(service);
    this.group.add(service);
  }

  async applyMintAssets(assets: AssetManager): Promise<void> {
    const [tower, chair, pulley, station, cableMaterial] = await Promise.all([
      assets.loadModel('prop-lift-tower'),
      assets.loadModel('prop-lift-chair'),
      assets.loadModel('prop-lift-pulley'),
      assets.loadModel('prop-lift-station'),
      assets.loadPbrMaterial('material-cable-metal', 5, 1),
    ]);

    if (cableMaterial) {
      this.cableMeshes.forEach((mesh) => {
        const previous = mesh.material;
        mesh.material = cableMaterial.clone();
        if (previous instanceof THREE.Material) previous.dispose();
      });
      cableMaterial.dispose();
    }

    if (tower) {
      fitModel(tower, 16, 'height');
      applyMintMaterialRole(tower, 'rail');
      for (const progress of [200, 320, 445, 570, 660]) {
        const root = new THREE.Group();
        const x = this.terrain.routeCenter(progress) + 42;
        root.name = 'mint-lift-tower';
        root.position.set(x, this.terrain.heightAt(x, -progress), -progress);
        root.add(tower.clone(true));
        if (pulley) {
          const pulleyCopy = pulley.clone(true);
          fitModel(pulleyCopy, 3.2, 'largest');
          pulleyCopy.position.y = 14.4;
          root.add(pulleyCopy);
        }
        this.group.add(root);
      }
    }

    if (chair) {
      fitModel(chair, 3.2, 'largest');
      applyMintMaterialRole(chair, 'board');
      for (let i = 0; i < 13; i += 1) {
        const root = new THREE.Group();
        const visual = chair.clone(true);
        root.name = 'mint-lift-chair';
        visual.position.y -= 3.2;
        root.add(visual);
        this.chairs.push(root);
        this.group.add(root);
      }
    }

    if (station) {
      fitModel(station, 15, 'largest');
      station.updateMatrixWorld(true);
      new THREE.Box3().setFromObject(station).getSize(this.stationSize);
      applyMintMaterialRole(station, 'marker');
      this.createStationRideLines();
      for (const progress of STATION_PROGRESS) {
        const root = station.clone(true);
        const x = this.terrain.routeCenter(progress) + 45;
        root.name = 'mint-lift-station';
        root.position.set(x, this.terrain.heightAt(x, -progress), -progress);
        root.rotation.y = progress < 300 ? 0.12 : Math.PI;
        this.group.add(root);
      }
    }
  }

  update(dt: number): void {
    this.time += dt;
    const tangent = new THREE.Vector3();
    this.chairs.forEach((chair, index) => {
      const t = (this.time * 0.018 + index / this.chairs.length) % 1;
      this.chairCurve.getPointAt(t, chair.position);
      this.chairCurve.getTangentAt(t, tangent);
      chair.rotation.y = Math.atan2(tangent.x, tangent.z);
      chair.position.y += Math.sin(this.time * 1.2 + index) * 0.05;
    });
  }

  staticCollisionPrimitives(): StaticColliderPlan[] {
    const colliders: StaticColliderPlan[] = [];
    for (const progress of [200, 320, 445, 570, 660]) {
      const x = this.terrain.routeCenter(progress) + 42;
      const ground = this.terrain.heightAt(x, -progress);
      colliders.push({
        id: `lift-tower-${progress}`, tag: 'lift-tower', shape: 'box',
        position: new THREE.Vector3(x, ground + 7.8, -progress),
        halfExtents: new THREE.Vector3(2.1, 7.8, 2.1),
      });
    }
    for (const progress of STATION_PROGRESS) {
      const x = this.terrain.routeCenter(progress) + 45;
      const ground = this.terrain.heightAt(x, -progress);
      const bodyHeight = this.stationSize.y * 0.62;
      colliders.push({
        id: `lift-station-${progress}`, tag: 'lift-station', shape: 'box',
        position: new THREE.Vector3(x, ground + bodyHeight * 0.5, -progress),
        halfExtents: new THREE.Vector3(this.stationSize.x * 0.48, bodyHeight * 0.5, this.stationSize.z * 0.48),
        rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), progress < 300 ? 0.12 : Math.PI),
      });
    }
    const cablePoints = this.chairCurve.getSpacedPoints(34);
    for (let index = 0; index < cablePoints.length - 1; index += 1) {
      const start = cablePoints[index];
      const end = cablePoints[index + 1];
      const direction = end.clone().sub(start);
      colliders.push({
        id: `lift-cable-${index}`, tag: 'lift-cable', shape: 'capsule',
        position: start.clone().add(end).multiplyScalar(0.5),
        rotation: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()),
        radius: 0.095,
        halfHeight: Math.max(0.02, direction.length() * 0.5 - 0.095),
      });
    }
    return colliders;
  }

  movingColliderIds(): string[] {
    return this.chairs.map((_, index) => `lift-chair-${index}`);
  }

  movingColliderTransforms(): MovingColliderTransform[] {
    return this.chairs.map((chair, index) => ({
      id: `lift-chair-${index}`,
      position: chair.position.clone().add(new THREE.Vector3(0, -1.65, 0)),
      rotation: chair.quaternion.clone(),
    }));
  }

  dispose(): void {
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
  }

  private addCable(curve: THREE.Curve<THREE.Vector3>, radius: number): void {
    const cable = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 220, radius, 6, true),
      this.cableMaterial(),
    );
    cable.name = 'procedural-lift-cable';
    cable.castShadow = true;
    this.cableMeshes.push(cable);
    this.group.add(cable);
  }

  private createStationRideLines(): void {
    if (this.stationRideLinesCreated) return;
    this.stationRideLinesCreated = true;
    const accessMaterial = createParkMaterial('jump');

    for (const progress of STATION_PROGRESS) {
      const centerX = this.terrain.routeCenter(progress) + 45;
      const centerZ = -progress;
      const ground = this.terrain.heightAt(centerX, centerZ);
      const routeBefore = this.terrain.routeCenter(Math.max(0, progress - 5));
      const routeAfter = this.terrain.routeCenter(progress + 5);
      const downhill = new THREE.Vector3(routeAfter - routeBefore, 0, -10).normalize();
      const roofHeight = ground + this.stationSize.y;
      const roofHalfLength = this.stationSize.z * 0.5;
      const roofStart = new THREE.Vector3(centerX, roofHeight, centerZ).addScaledVector(downhill, -roofHalfLength);
      const roofEnd = new THREE.Vector3(centerX, roofHeight, centerZ).addScaledVector(downhill, roofHalfLength);
      const accessLength = Math.max(24, this.stationSize.y * 2.1);
      const accessStart = roofStart.clone().addScaledVector(downhill, -accessLength);
      accessStart.y = this.terrain.heightAt(accessStart.x, accessStart.z) + 0.08;
      const rideWidth = Math.min(4.4, this.stationSize.x * 0.31);

      this.terrain.addRideableSurface({
        id: `ski-station-access-${progress}`,
        start: accessStart,
        end: roofStart,
        width: rideWidth,
        mountStep: 1.35,
        region: 'ski-station-access',
      });
      this.terrain.addRideableSurface({
        id: `ski-station-roof-${progress}`,
        start: roofStart,
        end: roofEnd,
        width: Math.min(3.4, rideWidth),
        mountStep: 1.4,
        region: 'ski-station-roof',
      });

      const rampLength = accessStart.distanceTo(roofStart);
      const ramp = new THREE.Mesh(
        new THREE.BoxGeometry(rideWidth, 0.46, rampLength),
        accessMaterial,
      );
      ramp.name = `procedural-ski-station-roof-access-${progress}`;
      ramp.position.copy(accessStart).add(roofStart).multiplyScalar(0.5);
      quaternionAlongSegment(accessStart, roofStart, ramp.quaternion);
      const rampUp = new THREE.Vector3(0, 1, 0).applyQuaternion(ramp.quaternion);
      ramp.position.addScaledVector(rampUp, -0.23);
      ramp.userData.progress = progress - roofHalfLength - accessLength * 0.5;
      ramp.castShadow = true;
      ramp.receiveShadow = true;
      this.group.add(ramp);
    }
  }

  private cableMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      name: 'procedural-cable-surface',
      color: MINT_ALPINE.steel,
      roughness: 0.75,
      metalness: 0.52,
    });
  }
}

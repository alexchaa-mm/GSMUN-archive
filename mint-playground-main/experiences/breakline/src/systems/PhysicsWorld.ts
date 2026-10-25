import * as THREE from 'three';
import type { Collider, Cuboid, RigidBody, World } from '@dimforge/rapier3d-compat';
import type { RiderState } from '../game/types';
import type { TerrainGenerator } from '../world/TerrainGenerator';
import type { MovingColliderTransform, StaticColliderPlan } from '../world/collision-types';

export class PhysicsWorld {
  readonly world: World;
  readonly debugGroup = new THREE.Group();
  private readonly riderBody: RigidBody;
  private readonly riderCollider: Collider;
  private readonly riderShape: Cuboid;
  private terrainCollider: Collider | null = null;
  private readonly staticColliders: Collider[] = [];
  private readonly sensorColliders: Collider[] = [];
  private readonly colliderTags = new Map<number, string>();
  private readonly movingBodies = new Map<string, RigidBody>();
  private readonly movingColliders: Collider[] = [];
  private readonly activeSensors = new Set<string>();
  private readonly debugGeometry = new THREE.BufferGeometry();
  private readonly debugMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthTest: false });
  private readonly debugLines = new THREE.LineSegments(this.debugGeometry, this.debugMaterial);
  private debugVisible = false;
  private stepCount = 0;

  private constructor(private readonly RAPIER: typeof import('@dimforge/rapier3d-compat').default) {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.riderBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 210, 0).setCcdEnabled(true),
    );
    this.riderCollider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.34, 0.22, 0.91).setFriction(0.12).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.riderBody,
    );
    this.riderShape = new RAPIER.Cuboid(0.34, 0.22, 0.91);
    this.debugGroup.name = 'rapier-collision-debug';
    this.debugGroup.renderOrder = 1000;
    this.debugGroup.visible = false;
    this.debugLines.frustumCulled = false;
    this.debugGroup.add(this.debugLines);
  }

  static async create(terrain: TerrainGenerator): Promise<PhysicsWorld> {
    const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
    const warn = console.warn;
    console.warn = (...values: unknown[]) => {
      if (String(values[0]).includes('using deprecated parameters for the initialization function')) return;
      warn(...values);
    };
    try {
      await RAPIER.init();
    } finally {
      console.warn = warn;
    }
    const physics = new PhysicsWorld(RAPIER);
    const data = terrain.colliderData();
    try {
      physics.terrainCollider = physics.world.createCollider(
        RAPIER.ColliderDesc.trimesh(data.vertices, data.indices).setFriction(0.08),
      );
    } catch (error) {
      console.warn('Rapier terrain collider creation failed; shared terrain height queries remain authoritative.', error);
    }
    return physics;
  }

  addStaticColliders(plans: StaticColliderPlan[]): void {
    for (const plan of plans) {
      const descriptor = plan.shape === 'box'
        ? this.RAPIER.ColliderDesc.cuboid(
          plan.halfExtents?.x ?? 0.5,
          plan.halfExtents?.y ?? 0.5,
          plan.halfExtents?.z ?? 0.5,
        )
        : plan.shape === 'ball'
          ? this.RAPIER.ColliderDesc.ball(plan.radius ?? 0.5)
          : plan.shape === 'capsule'
            ? this.RAPIER.ColliderDesc.capsule(plan.halfHeight ?? 0.5, plan.radius ?? 0.25)
            : this.RAPIER.ColliderDesc.cylinder(plan.halfHeight ?? 0.5, plan.radius ?? 0.5);
      descriptor.setTranslation(plan.position.x, plan.position.y, plan.position.z);
      if (plan.rotation) descriptor.setRotation(plan.rotation);
      descriptor.setFriction(plan.tag.startsWith('rail:') ? 0.04 : 0.18);
      descriptor.setActiveEvents(this.RAPIER.ActiveEvents.COLLISION_EVENTS);
      if (plan.sensor) descriptor.setSensor(true);
      const collider = this.world.createCollider(descriptor);
      this.colliderTags.set(collider.handle, plan.tag);
      if (plan.sensor) this.sensorColliders.push(collider);
      else this.staticColliders.push(collider);
    }
  }

  registerMovingBoxes(ids: string[], halfExtents: THREE.Vector3): void {
    for (const id of ids) {
      if (this.movingBodies.has(id)) continue;
      const body = this.world.createRigidBody(this.RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -1000, 0));
      const collider = this.world.createCollider(
        this.RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
          .setActiveEvents(this.RAPIER.ActiveEvents.COLLISION_EVENTS),
        body,
      );
      this.movingBodies.set(id, body);
      this.movingColliders.push(collider);
      this.colliderTags.set(collider.handle, id);
    }
  }

  syncMovingColliders(transforms: MovingColliderTransform[]): void {
    for (const transform of transforms) {
      const body = this.movingBodies.get(transform.id);
      if (!body) continue;
      body.setNextKinematicTranslation(transform.position);
      body.setNextKinematicRotation(transform.rotation);
    }
  }

  teleportRider(state: RiderState, rotation: THREE.Quaternion): void {
    this.riderBody.setTranslation(state.position, true);
    this.riderBody.setRotation(rotation, true);
  }

  step(state: RiderState, rotation: THREE.Quaternion): string[] {
    const currentPosition = this.riderBody.translation();
    const currentRotation = this.riderBody.rotation();
    const displacement = {
      x: state.position.x - currentPosition.x,
      y: state.position.y - currentPosition.y,
      z: state.position.z - currentPosition.z,
    };
    const hits = new Set<string>();
    const acceptsSolid = (collider: Collider) => {
      const tag = this.colliderTags.get(collider.handle);
      return !!tag && !tag.startsWith('grind:');
    };
    const sweptHit = this.world.castShape(
      currentPosition,
      currentRotation,
      displacement,
      this.riderShape,
      0,
      1,
      true,
      undefined,
      undefined,
      this.riderCollider,
      this.riderBody,
      acceptsSolid,
    );
    if (sweptHit) {
      const tag = this.colliderTags.get(sweptHit.collider.handle);
      if (tag) hits.add(tag);
    }
    this.riderBody.setNextKinematicTranslation({ x: state.position.x, y: state.position.y, z: state.position.z });
    this.riderBody.setNextKinematicRotation(rotation);
    this.world.timestep = 1 / 60;
    this.world.step();
    this.stepCount += 1;
    this.world.intersectionsWithShape(state.position, rotation, this.riderShape, (collider) => {
      const tag = this.colliderTags.get(collider.handle);
      if (tag && !tag.startsWith('grind:')) hits.add(tag);
      return true;
    }, undefined, undefined, this.riderCollider, this.riderBody, acceptsSolid);
    this.activeSensors.clear();
    this.world.intersectionPairsWith(this.riderCollider, (collider) => {
      const tag = this.colliderTags.get(collider.handle);
      if (tag) this.activeSensors.add(tag);
    });
    if (this.debugVisible) this.updateDebugGeometry();
    return [...hits];
  }

  setDebugVisible(visible: boolean): void {
    this.debugVisible = visible;
    this.debugGroup.visible = visible;
    if (visible) this.updateDebugGeometry();
  }

  diagnostics(): string {
    return `Rapier bodies ${this.world.bodies.len()} | colliders ${this.world.colliders.len()} | CCD 1 | sensors ${this.sensorColliders.length} | active ${this.activeSensors.size} | steps ${this.stepCount}`;
  }

  stats(): { engine: 'rapier'; timestep: number; bodies: number; colliders: number; sensors: number; ccdBodies: number } {
    return {
      engine: 'rapier',
      timestep: 1 / 60,
      bodies: this.world.bodies.len(),
      colliders: this.world.colliders.len(),
      sensors: this.sensorColliders.length,
      ccdBodies: 1,
    };
  }

  dispose(): void {
    for (const body of this.movingBodies.values()) this.world.removeRigidBody(body);
    this.movingBodies.clear();
    for (const collider of this.staticColliders) this.world.removeCollider(collider, true);
    for (const collider of this.sensorColliders) this.world.removeCollider(collider, true);
    if (this.terrainCollider) this.world.removeCollider(this.terrainCollider, true);
    this.world.removeRigidBody(this.riderBody);
    this.debugGeometry.dispose();
    this.debugMaterial.dispose();
    this.world.free();
  }

  private updateDebugGeometry(): void {
    const buffers = this.world.debugRender(undefined, (collider) => collider.handle !== this.terrainCollider?.handle);
    this.debugGeometry.setAttribute('position', new THREE.BufferAttribute(buffers.vertices, 3));
    const rgb = new Float32Array((buffers.colors.length / 4) * 3);
    for (let source = 0, target = 0; source < buffers.colors.length; source += 4, target += 3) {
      rgb[target] = buffers.colors[source];
      rgb[target + 1] = Math.max(buffers.colors[source + 1], 0.72);
      rgb[target + 2] = Math.max(buffers.colors[source + 2], 0.58);
    }
    this.debugGeometry.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    this.debugGeometry.computeBoundingSphere();
  }
}

import * as THREE from 'three';
import type { AssetManager } from '../assets/AssetManager';
import { applyMintMaterialRole } from '../assets/MaterialLibrary';
import { fitModel } from '../assets/model-utils';
import type { InputManager } from '../core/InputManager';
import type { GrindRail, TerrainGenerator } from '../world/TerrainGenerator';
import type { LandingQuality, RiderState, TerrainSample } from '../game/types';
import { METERS_PER_SECOND_TO_MPH } from '../game/types';
import { RiderPoseSystem } from '../systems/RiderPoseSystem';
import type { BindingDiagnostics } from '../systems/RiderPoseSystem';

export type RiderEvent =
  | { type: 'takeoff'; charge: number }
  | { type: 'land'; quality: LandingQuality; impact: number }
  | { type: 'bail'; reason: string }
  | { type: 'recover' }
  | { type: 'grind-start'; kind: 'rail' | 'cable'; style: '50-50' | 'boardslide' }
  | { type: 'grind-end'; duration: number; style: '50-50' | 'boardslide' }
  | { type: 'special' }
  | { type: 'reset' };

const BOARD_HEIGHT = 0.58;
const BOARD_SNOW_SINK = 0.03;
const AIR_ROTATION_RATE = Math.PI * 2;
const CLEAN_LANDING_ROTATION_ERROR = Math.PI * 0.25;
const SKETCHY_LANDING_ROTATION_ERROR = Math.PI * 0.61;
const CLEAN_LANDING_MAX_IMPACT = 16.5;
const SKETCHY_LANDING_MAX_IMPACT = 22;

export type BoardVisualDiagnostics = {
  loaded: boolean;
  baseLocalY: number;
  topLocalY: number;
  groundClearanceCm: number;
  passed: boolean;
};

export type RiderTestPose =
  | 'stance'
  | 'air-trick'
  | 'backflip'
  | 'spin-360'
  | 'spin-720'
  | 'cork'
  | 'grind'
  | 'grind-5050'
  | 'grind-boardslide'
  | 'jump-feature'
  | 'park-feature';

export class SnowboardController {
  readonly group = new THREE.Group();
  readonly state: RiderState;
  readonly surface: TerrainSample;
  readonly events: RiderEvent[] = [];
  readonly collisionRadius = 0.72;
  private readonly presentation = new THREE.Group();
  private readonly board = new THREE.Group();
  private readonly rider = new THREE.Group();
  private readonly pose = new RiderPoseSystem(this.presentation, this.rider, this.board);
  private jumpCharge = 0;
  private verticalVelocity = 0;
  private heading = 0;
  private bailTimer = 0;
  private recoverMash = 0;
  private lastProgress = 0;
  private autoJumped = new Set<number>();
  private grindRail: GrindRail | null = null;
  private grindT = 0;
  private grindDuration = 0;
  private grindBalance = 0;
  private groundQuaternion = new THREE.Quaternion();
  private airQuaternion = new THREE.Quaternion();
  private readonly tmpQuaternion = new THREE.Quaternion();
  private readonly tmpEuler = new THREE.Euler();
  private readonly forward = new THREE.Vector3();
  private readonly nextPosition = new THREE.Vector3();
  private readonly boardVisualBounds = new THREE.Box3();
  private readonly boardContactPoint = new THREE.Vector3();
  private readonly diagnosticSurface: TerrainSample = {
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    routeCenter: 0,
    progress: 0,
    region: 'opening',
  };
  private mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private activeAction: THREE.AnimationAction | null = null;
  private activeAnimationState = 'stance-procedural';

  constructor(private readonly terrain: TerrainGenerator) {
    const position = new THREE.Vector3(terrain.routeCenter(0), 0, 0);
    this.surface = terrain.sampleSurface(position);
    position.y = this.surface.point.y + BOARD_HEIGHT;
    this.state = {
      position, velocity: new THREE.Vector3(0, 0, -12), speedMps: 12, speedMph: 12 * METERS_PER_SECOND_TO_MPH,
      maxSpeedMph: 0, distance: 0, grounded: true, bailing: false, tucked: false, grinding: null, grindStyle: null,
      steer: 0, airTime: 0, airHeight: 0, yawRotation: 0, flipRotation: 0, corked: false, grab: null, butter: null, lastLanding: null,
    };
    this.group.name = 'rider-entity';
    this.group.add(this.presentation);
    this.presentation.name = 'mint-rider-and-board';
    this.rider.name = 'mint-rider';
    this.board.name = 'mint-snowboard';
    // Rider state is the simulation center; visuals pivot one board-height lower at the snow contact plane.
    this.presentation.position.y = -BOARD_HEIGHT;
    this.presentation.add(this.board, this.rider);
    this.syncPresentation(0);
  }

  async applyMintAssets(assets: AssetManager): Promise<void> {
    const [animationSet, trickClips, boardModel] = await Promise.all([
      assets.loadAnimationSet('rider-animation'),
      assets.loadAnimationClips('rider-tricks'),
      assets.loadModel('snowboard'),
    ]);
    if (animationSet) {
      fitModel(animationSet.root, 1.72, 'height');
      animationSet.root.rotation.y = Math.PI / 2;
      applyMintMaterialRole(animationSet.root, 'rider');
      this.rider.add(animationSet.root);
      this.pose.bind(animationSet.root);
      this.mixer = new THREE.AnimationMixer(animationSet.root);
      animationSet.clips.forEach((clip, name) => {
        const action = this.mixer!.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
        this.actions.set(name, action);
      });
      trickClips.forEach((clip, name) => {
        const action = this.mixer!.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
        this.actions.set(name, action);
      });
      this.selectAnimation('idle', 0);
    }
    if (boardModel) {
      fitModel(boardModel, 1.82, 'largest');
      // fitModel stores its ground-alignment translation on position; preserve it when adding the snow sink.
      boardModel.position.y -= BOARD_SNOW_SINK;
      boardModel.updateMatrixWorld(true);
      this.boardVisualBounds.setFromObject(boardModel);
      this.pose.setBoardBounds(this.boardVisualBounds);
      applyMintMaterialRole(boardModel, 'board');
      this.board.add(boardModel);
    }
  }

  fixedUpdate(dt: number, input: InputManager, specialActive: boolean): void {
    this.events.length = 0;
    this.state.lastLanding = null;
    this.state.steer = input.steer();
    this.state.tucked = input.held('tuck') && !this.state.bailing;
    this.state.grab = input.held('frontGrab') ? 'frontside' : input.held('backGrab') ? 'backside' : !this.state.grounded && input.held('noseButter') ? 'nose' : !this.state.grounded && input.held('tailButter') ? 'tail' : null;
    this.state.butter = this.state.grounded && !this.state.grinding && input.held('noseButter') ? 'nose' : this.state.grounded && !this.state.grinding && input.held('tailButter') ? 'tail' : null;

    if (input.pressed('reset')) { this.resetToSafeRoute(); this.updateSpeedTelemetry(); return; }
    if (this.state.bailing) { this.updateBail(dt, input); this.updateSpeedTelemetry(); this.syncPresentation(dt); return; }
    if (this.state.grinding) { this.updateGrind(dt, input); this.updateSpeedTelemetry(); this.syncPresentation(dt); return; }

    if (input.held('grind')) {
      const candidate = this.terrain.nearestRail(this.state.position, 2.25);
      if (candidate && this.state.speedMps > 8 && this.canMountRail(candidate.rail, candidate.t)) {
        this.startGrind(candidate.rail, candidate.t);
        this.updateSpeedTelemetry();
        this.syncPresentation(dt);
        return;
      }
    }

    if (this.state.grounded) this.updateGrounded(dt, input, specialActive);
    else this.updateAirborne(dt, input, specialActive);
    this.updateSpeedTelemetry();
    this.syncPresentation(dt);
  }

  addCableRail(rail: GrindRail): void { this.terrain.rails.push(rail); }

  triggerBail(reason: string): void {
    if (this.state.bailing) return;
    this.state.bailing = true;
    this.state.grounded = false;
    this.state.grinding = null;
    this.state.grindStyle = null;
    this.state.corked = false;
    this.grindRail = null;
    this.bailTimer = 0;
    this.recoverMash = 0;
    this.verticalVelocity = Math.max(3, Math.abs(this.verticalVelocity) * 0.25);
    this.state.speedMps *= 0.38;
    this.events.push({ type: 'bail', reason });
  }

  resetToSafeRoute(): void {
    const progress = Math.round(this.state.distance / 25) * 25;
    this.state.position.set(this.terrain.routeCenter(progress), 0, -progress);
    this.surface.point.copy(this.terrain.sampleSurface(this.state.position).point);
    this.state.position.y = this.surface.point.y + BOARD_HEIGHT;
    this.state.velocity.set(0, 0, -11);
    this.state.speedMps = 11;
    this.state.grounded = true;
    this.state.bailing = false;
    this.state.grinding = null;
    this.state.grindStyle = null;
    this.state.airTime = 0;
    this.state.yawRotation = 0;
    this.state.flipRotation = 0;
    this.state.corked = false;
    this.verticalVelocity = 0;
    this.heading = 0;
    this.airQuaternion.identity();
    this.events.push({ type: 'reset' });
    this.syncPresentation(0);
  }

  resetRun(): void {
    this.state.distance = 0;
    this.state.maxSpeedMph = 0;
    this.autoJumped.clear();
    this.resetToSafeRoute();
    this.state.position.z = 0;
    this.state.position.x = this.terrain.routeCenter(0);
    this.terrain.sampleSurface(this.state.position, this.surface);
    this.state.position.y = this.surface.point.y + BOARD_HEIGHT;
    this.lastProgress = 0;
  }

  dispose(): void {
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
  }

  collisionQuaternion(): THREE.Quaternion {
    return this.group.quaternion;
  }

  rigDiagnostics(): string {
    return this.pose.diagnostics();
  }

  bindingDiagnostics(): BindingDiagnostics {
    return this.pose.metrics();
  }

  boardVisualDiagnostics(): BoardVisualDiagnostics {
    const loaded = !this.boardVisualBounds.isEmpty();
    if (!loaded) {
      return {
        loaded: false,
        baseLocalY: 0,
        topLocalY: 0,
        groundClearanceCm: Number.POSITIVE_INFINITY,
        passed: false,
      };
    }

    const baseLocalY = this.boardVisualBounds.min.y;
    const topLocalY = this.boardVisualBounds.max.y;
    this.board.updateWorldMatrix(true, false);
    this.boardContactPoint.set(0, baseLocalY, 0);
    this.board.localToWorld(this.boardContactPoint);
    const groundY = this.terrain.sampleSurface(this.boardContactPoint, this.diagnosticSurface).point.y;
    const groundClearanceCm = (this.boardContactPoint.y - groundY) * 100;
    const normalized = Math.abs(baseLocalY + BOARD_SNOW_SINK) <= 0.005;
    const contactAligned = !this.state.grounded
      || Math.abs(groundClearanceCm + BOARD_SNOW_SINK * 100) <= 5;

    return {
      loaded,
      baseLocalY,
      topLocalY,
      groundClearanceCm,
      passed: normalized && contactAligned,
    };
  }

  trickDiagnostics(): string {
    const yaw = this.nearestHalfTurnDegrees(this.state.yawRotation);
    const flips = Math.round(Math.abs(this.state.flipRotation) / (Math.PI * 2));
    if (this.state.corked && yaw >= 180 && flips > 0) return `${this.state.yawRotation >= 0 ? 'FS' : 'BS'} CORK ${yaw}`;
    if (flips > 0) return `${flips > 1 ? `${flips}X ` : ''}${this.state.flipRotation >= 0 ? 'FRONTFLIP' : 'BACKFLIP'}`;
    if (yaw >= 180) return `${this.state.yawRotation >= 0 ? 'FS' : 'BS'} ${yaw}`;
    return this.state.grindStyle?.toUpperCase() ?? 'STRAIGHT AIR';
  }

  animationDiagnostics(): string {
    return `${this.activeAnimationState} | ${this.actions.size} Mint clips + procedural trick overlay`;
  }

  setTestPose(name: RiderTestPose): void {
    const isGrind = name === 'grind' || name === 'grind-5050' || name === 'grind-boardslide';
    const progress = name === 'park-feature' ? 103 : name === 'jump-feature' ? 63 : isGrind ? 114 : 36;
    const approachX = name === 'park-feature' ? this.terrain.rails[0].start.x : this.terrain.routeCenter(progress);
    this.state.position.set(approachX, 0, -progress);
    this.heading = 0;
    if (name === 'park-feature') {
      const rail = this.terrain.rails[0];
      const direction = rail.end.clone().sub(rail.start).setY(0).normalize();
      this.state.position.copy(rail.start).addScaledVector(direction, -5);
      this.heading = Math.atan2(direction.x, -direction.z);
    }
    this.terrain.sampleSurface(this.state.position, this.surface);
    this.state.position.y = this.surface.point.y + BOARD_HEIGHT;
    this.state.distance = this.surface.progress;
    this.state.speedMps = name === 'stance' ? 12 : 18;
    this.state.velocity.set(Math.sin(this.heading), 0, -Math.cos(this.heading)).multiplyScalar(this.state.speedMps);
    this.state.bailing = false;
    this.state.tucked = false;
    this.state.grinding = null;
    this.state.grindStyle = null;
    this.state.grab = null;
    this.state.grounded = true;
    this.state.yawRotation = 0;
    this.state.flipRotation = 0;
    this.state.corked = false;
    this.airQuaternion.identity();
    this.lastProgress = this.surface.progress;
    if (name === 'air-trick' || name === 'backflip' || name === 'spin-360' || name === 'spin-720' || name === 'cork') {
      this.state.grounded = false;
      this.state.position.y += 3.6;
      this.state.airHeight = 3.6;
      this.state.airTime = 0.8;
      if (name === 'air-trick') {
        this.state.yawRotation = Math.PI * 2;
        this.state.grab = 'frontside';
      } else if (name === 'backflip') {
        this.state.flipRotation = -Math.PI * 2;
      } else if (name === 'spin-360') {
        this.state.yawRotation = Math.PI * 2;
      } else if (name === 'spin-720') {
        this.state.yawRotation = Math.PI * 4;
      } else {
        this.state.yawRotation = Math.PI * 2;
        this.state.flipRotation = -Math.PI * 2;
        this.state.corked = true;
        this.state.grab = 'backside';
      }
      this.airQuaternion.setFromEuler(new THREE.Euler(this.state.flipRotation, this.state.yawRotation, 0, 'YXZ'));
    } else if (isGrind) {
      const rail = this.terrain.rails[0];
      this.state.steer = name === 'grind-5050' ? 0 : 0.7;
      this.startGrind(rail, 0.28);
      this.updateGrind(0, { held: () => true, steer: () => 0 } as unknown as InputManager);
    }
    this.syncPresentation(1 / 60);
  }

  setTestCollision(position: THREE.Vector3): void {
    this.state.position.copy(position);
    this.terrain.sampleSurface(this.state.position, this.surface);
    this.state.position.y = this.surface.point.y + BOARD_HEIGHT;
    this.state.distance = this.surface.progress;
    this.state.speedMps = 16;
    this.state.grounded = true;
    this.state.bailing = false;
    this.state.grinding = null;
    this.state.grindStyle = null;
    this.state.corked = false;
    this.state.yawRotation = 0;
    this.state.flipRotation = 0;
    this.lastProgress = this.surface.progress;
    this.terrain.jumpCenters.forEach((jump) => {
      if (jump.progress < this.lastProgress) this.autoJumped.add(jump.progress);
    });
    this.syncPresentation(1 / 60);
  }

  private updateGrounded(dt: number, input: InputManager, specialActive: boolean): void {
    this.terrain.sampleSurface(this.state.position, this.surface);
    const routeError = this.state.position.x - this.surface.routeCenter;
    const edgePressure = Math.max(0, Math.abs(routeError) - 43) / 28;
    const steerStrength = this.state.tucked ? 0.58 : 0.86;
    const targetHeading = this.state.steer * steerStrength - THREE.MathUtils.clamp(routeError / 115, -0.24, 0.24);
    this.heading += (targetHeading - this.heading) * (1 - Math.exp(-dt * 4.4));

    const slopeDrive = 4.3 + (1 - this.surface.normal.y) * 23;
    const tuckFactor = this.state.tucked ? 0.52 : 1;
    const drag = (0.0043 * tuckFactor + Math.abs(this.state.steer) * 0.0033) * this.state.speedMps * this.state.speedMps;
    const boost = specialActive ? 10.5 : 0;
    this.state.speedMps += (slopeDrive + boost - drag - edgePressure * 7.5) * dt;
    const maxSpeed = specialActive ? 40 : this.state.tucked ? 34 : 27.5;
    this.state.speedMps = THREE.MathUtils.clamp(this.state.speedMps, 5.5, maxSpeed);

    this.forward.set(Math.sin(this.heading), 0, -Math.cos(this.heading));
    this.nextPosition.copy(this.state.position).addScaledVector(this.forward, this.state.speedMps * dt);
    const nextSurface = this.terrain.sampleSurface(this.nextPosition);
    const drop = this.state.position.y - (nextSurface.point.y + BOARD_HEIGHT);
    this.state.position.copy(this.nextPosition);
    this.state.velocity.copy(this.forward).multiplyScalar(this.state.speedMps);
    this.state.distance = nextSurface.progress;

    if (input.held('jump')) this.jumpCharge = Math.min(1, this.jumpCharge + dt * 1.35);
    if (input.released('jump') && this.jumpCharge > 0.04) {
      this.takeoff(5.2 + this.jumpCharge * 4.2);
      this.events.push({ type: 'takeoff', charge: this.jumpCharge });
      this.jumpCharge = 0;
      return;
    }

    const jump = this.terrain.jumpCenters.find((feature) => {
      const lip = feature.progress + feature.radius * 0.42;
      return this.lastProgress < lip && nextSurface.progress >= lip && !this.autoJumped.has(feature.progress);
    });
    if ((jump !== undefined && this.state.speedMps > 12) || drop > 0.85) {
      if (jump !== undefined) this.autoJumped.add(jump.progress);
      const launchVelocity = jump?.launchVelocity ?? 3.4;
      this.takeoff(launchVelocity);
      this.events.push({ type: 'takeoff', charge: THREE.MathUtils.clamp((launchVelocity - 3.2) / 5.4, 0.25, 1) });
      this.lastProgress = nextSurface.progress;
      return;
    }

    this.state.position.y = nextSurface.point.y + BOARD_HEIGHT;
    this.surface.point.copy(nextSurface.point); this.surface.normal.copy(nextSurface.normal); this.surface.routeCenter = nextSurface.routeCenter; this.surface.progress = nextSurface.progress; this.surface.region = nextSurface.region;
    this.alignToSurface(this.surface.normal, dt);
    this.state.airTime = 0;
    this.state.airHeight = 0;
    this.state.yawRotation = 0;
    this.state.flipRotation = 0;
    this.state.corked = false;
    this.airQuaternion.identity();
    this.lastProgress = nextSurface.progress;
  }

  private updateAirborne(dt: number, input: InputManager, specialActive: boolean): void {
    this.state.airTime += dt;
    const spinIntent = input.spinIntent();
    const flip = (input.held('frontFlip') ? 1 : 0) - (input.held('backFlip') ? 1 : 0);
    if (spinIntent !== 0 && flip !== 0) this.state.corked = true;
    const spin = spinIntent !== 0 ? spinIntent : this.state.steer * 0.22;
    const yawDelta = spin * AIR_ROTATION_RATE * dt;
    const flipDelta = flip * AIR_ROTATION_RATE * dt;
    this.state.yawRotation += yawDelta;
    this.state.flipRotation += flipDelta;
    this.tmpEuler.set(flipDelta, yawDelta, 0, 'YXZ');
    this.tmpQuaternion.setFromEuler(this.tmpEuler);
    this.airQuaternion.multiply(this.tmpQuaternion).normalize();

    this.verticalVelocity -= 9.81 * dt;
    const airSpeed = this.state.speedMps + (specialActive ? 2 : 0);
    this.forward.set(Math.sin(this.heading), 0, -Math.cos(this.heading));
    this.state.position.addScaledVector(this.forward, airSpeed * dt);
    this.state.position.y += this.verticalVelocity * dt;
    this.state.velocity.copy(this.forward).multiplyScalar(airSpeed); this.state.velocity.y = this.verticalVelocity;
    this.terrain.sampleSurface(this.state.position, this.surface);
    this.state.distance = this.surface.progress;
    this.state.airHeight = Math.max(0, this.state.position.y - this.surface.point.y - BOARD_HEIGHT);

    if (input.held('grind')) {
      const candidate = this.terrain.nearestRail(this.state.position, 2.3);
      if (candidate && this.canMountRail(candidate.rail, candidate.t)) { this.startGrind(candidate.rail, candidate.t); return; }
    }

    if (this.state.position.y <= this.surface.point.y + BOARD_HEIGHT && this.state.airTime > 0.12) {
      const impact = Math.abs(this.verticalVelocity);
      const yawError = this.rotationError(this.state.yawRotation);
      const flipError = this.rotationError(this.state.flipRotation);
      const error = yawError + flipError * 1.1;
      const quality: LandingQuality = error < CLEAN_LANDING_ROTATION_ERROR && impact < CLEAN_LANDING_MAX_IMPACT
        ? 'clean'
        : error < SKETCHY_LANDING_ROTATION_ERROR && impact < SKETCHY_LANDING_MAX_IMPACT
          ? 'sketchy'
          : 'wipeout';
      this.state.position.y = this.surface.point.y + BOARD_HEIGHT;
      this.state.lastLanding = quality;
      this.events.push({ type: 'land', quality, impact });
      if (quality === 'wipeout') { this.triggerBail('FAILED LANDING'); return; }
      if (quality === 'sketchy') this.state.speedMps *= 0.78;
      this.state.grounded = true;
      this.verticalVelocity = 0;
      this.state.airTime = 0;
      this.airQuaternion.identity();
      this.alignToSurface(this.surface.normal, dt);
    }
  }

  private updateBail(dt: number, input: InputManager): void {
    this.bailTimer += dt;
    this.state.speedMps = Math.max(0, this.state.speedMps - 8.5 * dt);
    this.forward.set(Math.sin(this.heading), 0, -Math.cos(this.heading));
    this.state.position.addScaledVector(this.forward, this.state.speedMps * dt);
    this.verticalVelocity -= 9.81 * dt;
    this.state.position.y += this.verticalVelocity * dt;
    this.terrain.sampleSurface(this.state.position, this.surface);
    if (this.state.position.y < this.surface.point.y + BOARD_HEIGHT) { this.state.position.y = this.surface.point.y + BOARD_HEIGHT; this.verticalVelocity *= -0.18; }
    this.state.distance = this.surface.progress;
    if (input.pressed('jump')) this.recoverMash += 0.34;
    if (this.bailTimer > 1.55 || this.recoverMash >= 1) {
      this.state.bailing = false; this.state.grounded = true; this.state.speedMps = Math.max(8.5, this.state.speedMps);
      this.verticalVelocity = 0; this.airQuaternion.identity(); this.events.push({ type: 'recover' });
    }
  }

  private startGrind(rail: GrindRail, t: number): void {
    this.grindRail = rail; this.grindT = t; this.grindDuration = 0; this.grindBalance = 0;
    this.state.grinding = rail.kind;
    this.state.grindStyle = Math.abs(this.state.steer) > 0.42 ? 'boardslide' : '50-50';
    this.state.grounded = false; this.verticalVelocity = 0;
    this.events.push({ type: 'grind-start', kind: rail.kind, style: this.state.grindStyle });
  }

  private updateGrind(dt: number, input: InputManager): void {
    const rail = this.grindRail;
    if (!rail) { this.state.grinding = null; return; }
    this.grindDuration += dt;
    const segment = this.forward.subVectors(rail.end, rail.start);
    const length = segment.length();
    segment.normalize();
    this.grindT += (this.state.speedMps / length) * dt;
    this.grindBalance += (this.state.steer * 1.25 + Math.sin(this.grindDuration * 4.7) * 0.12) * dt;
    this.grindBalance *= Math.exp(-dt * 0.35);
    this.state.position.copy(rail.start).lerp(rail.end, THREE.MathUtils.clamp(this.grindT, 0, 1));
    this.state.position.y += BOARD_HEIGHT * 0.58;
    this.state.velocity.copy(segment).multiplyScalar(this.state.speedMps);
    this.state.distance = THREE.MathUtils.clamp(-this.state.position.z, 0, 1800);
    this.heading = Math.atan2(segment.x, -segment.z);
    if (!input.held('grind') || this.grindT >= 1 || Math.abs(this.grindBalance) > 1.05) {
      const failed = Math.abs(this.grindBalance) > 1.05;
      const style = this.state.grindStyle ?? '50-50';
      const exitSide = new THREE.Vector3(segment.z, 0, -segment.x).normalize();
      const dismount = Math.abs(this.state.steer) > 0.15 ? this.state.steer : style === 'boardslide' ? Math.sign(this.grindBalance || 1) : 0;
      this.state.position.addScaledVector(exitSide, dismount * 0.72);
      this.state.grinding = null; this.state.grindStyle = null; this.grindRail = null; this.verticalVelocity = this.grindT >= 1 ? 2.8 : 2.35; this.state.grounded = false;
      this.events.push({ type: 'grind-end', duration: this.grindDuration, style });
      if (failed) this.triggerBail('LOST GRIND');
    }
  }

  private takeoff(verticalVelocity: number): void {
    this.state.grounded = false; this.verticalVelocity = verticalVelocity;
    this.state.airTime = 0; this.state.airHeight = 0; this.state.corked = false; this.airQuaternion.copy(this.groundQuaternion);
  }

  private canMountRail(rail: GrindRail, t: number): boolean {
    // The solid collider begins at the rail nose, so a valid aligned approach
    // must be allowed to snap onto t=0 before physics reports an impact.
    if (t > 0.985) return false;
    const railDirection = this.nextPosition.subVectors(rail.end, rail.start).setY(0).normalize();
    const approach = this.forward.copy(this.state.velocity).setY(0);
    if (approach.lengthSq() < 1e-5) approach.set(Math.sin(this.heading), 0, -Math.cos(this.heading));
    approach.normalize();
    return approach.dot(railDirection) > 0.35;
  }

  private alignToSurface(normal: THREE.Vector3, dt: number): void {
    const zAxis = this.forward.set(Math.sin(this.heading), 0, -Math.cos(this.heading)).projectOnPlane(normal).normalize();
    const xAxis = new THREE.Vector3().crossVectors(normal, zAxis).normalize();
    const matrix = new THREE.Matrix4().makeBasis(xAxis, normal, zAxis.clone().negate());
    this.tmpQuaternion.setFromRotationMatrix(matrix);
    this.groundQuaternion.slerp(this.tmpQuaternion, 1 - Math.exp(-dt * 10));
  }

  private syncPresentation(dt: number): void {
    this.group.position.copy(this.state.position);
    const targetQ = this.state.grounded ? this.groundQuaternion : this.airQuaternion;
    this.group.quaternion.slerp(targetQ, dt <= 0 ? 1 : 1 - Math.exp(-dt * 13));
    this.presentation.rotation.z = this.state.bailing ? Math.sin(this.bailTimer * 14) * 1.8 : -this.state.steer * 0.38;
    this.presentation.rotation.x = this.state.bailing ? this.bailTimer * 5.5 : this.state.butter === 'nose' ? -0.42 : this.state.butter === 'tail' ? 0.42 : 0;
    this.presentation.rotation.y = this.state.bailing ? this.bailTimer * 4 : 0;
    this.updateAnimation(dt);
    this.board.rotation.y = this.state.grindStyle === 'boardslide' ? Math.PI * 0.5 : 0;
    this.pose.update(this.state);
  }

  private updateAnimation(dt: number): void {
    if (!this.mixer || dt <= 0) return;
    let requested = 'idle';
    this.activeAnimationState = 'stance-procedural';
    if (this.state.bailing) {
      requested = 'climb-attempt-and-fall';
      this.activeAnimationState = 'bail-mint';
    } else if (this.state.grinding) {
      requested = 'stand-on-pole-and-balance';
      this.activeAnimationState = `${this.state.grindStyle ?? '50-50'}-mint-balance-plus-procedural`;
    } else if (!this.state.grounded && this.state.corked) {
      requested = 'backflip-jump';
      this.activeAnimationState = 'cork-mint-backflip-plus-procedural';
    } else if (!this.state.grounded && Math.abs(this.state.flipRotation) > 0.45) {
      requested = 'backflip-jump';
      this.activeAnimationState = `${this.state.flipRotation < 0 ? 'backflip' : 'frontflip'}-mint-plus-procedural`;
    } else if (!this.state.grounded && Math.abs(this.state.yawRotation) > 0.25) {
      requested = '360-power-spin-jump';
      this.activeAnimationState = 'spin-mint-power-spin-plus-procedural';
    } else if (!this.state.grounded) {
      requested = 'regular-jump';
      this.activeAnimationState = 'straight-air-mint';
    } else if (this.state.lastLanding) {
      requested = 'dive-down-and-land';
      this.activeAnimationState = `${this.state.lastLanding}-landing-mint`;
    } else if (this.state.tucked) {
      requested = 'squat-stance';
      this.activeAnimationState = 'tuck-mint-squat-plus-procedural';
    } else if (this.state.steer > 0.28) {
      requested = 'cautious-crouch-walk-right';
      this.activeAnimationState = 'carve-right-mint-plus-procedural';
    } else if (this.state.steer < -0.28) {
      requested = 'cautious-crouch-walk-left';
      this.activeAnimationState = 'carve-left-mint-plus-procedural';
    }
    this.selectAnimation(requested, 0.16);
    this.mixer.update(dt * (this.state.grounded ? 0.85 + this.state.speedMps / 34 : 1));
  }

  private selectAnimation(fragment: string, fade: number): void {
    const match = [...this.actions.entries()].find(([name]) => name.includes(fragment))?.[1];
    if (!match || match === this.activeAction) return;
    match.reset().fadeIn(fade).play();
    this.activeAction?.fadeOut(fade);
    this.activeAction = match;
  }

  private rotationError(value: number): number {
    const wrapped = Math.atan2(Math.sin(value), Math.cos(value));
    return Math.abs(wrapped);
  }

  private nearestHalfTurnDegrees(value: number): number {
    return Math.min(1080, Math.round(Math.abs(value) / Math.PI) * 180);
  }

  private updateSpeedTelemetry(): void {
    this.state.speedMph = this.state.speedMps * METERS_PER_SECOND_TO_MPH;
    this.state.maxSpeedMph = Math.max(this.state.maxSpeedMph, this.state.speedMph);
  }
}

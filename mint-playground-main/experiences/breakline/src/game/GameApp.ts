import * as THREE from 'three';
import { AssetManager } from '../assets/AssetManager';
import { disposeMintGltfRuntime } from '../assets/gltf-runtime';
import { applySharedMaterial, createParkMaterial, MINT_ALPINE } from '../assets/MaterialLibrary';
import { fitModel } from '../assets/model-utils';
import { InputManager } from '../core/InputManager';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { SnowboardController, type RiderEvent } from '../entities/SnowboardController';
import { AudioManager } from '../systems/AudioManager';
import { CameraRig } from '../systems/CameraRig';
import { ChaseSystem } from '../systems/ChaseSystem';
import { HUDController } from '../systems/HUDController';
import { LiftSystem } from '../systems/LiftSystem';
import { PhysicsWorld } from '../systems/PhysicsWorld';
import { SnowFXSystem } from '../systems/SnowFXSystem';
import { TrickSystem } from '../systems/TrickSystem';
import { TerrainGenerator } from '../world/TerrainGenerator';
import type { StaticColliderPlan } from '../world/collision-types';
import { FIXED_DT, MOUNTAIN_LENGTH, type GamePhase, type GameSettings, type RunStats } from './types';

type Hazard = { position: THREE.Vector3; radius: number; kind: string; mesh: THREE.Object3D };

export class GameApp {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2400);
  private readonly terrain = new TerrainGenerator();
  private readonly rider = new SnowboardController(this.terrain);
  private readonly lift = new LiftSystem(this.terrain);
  private readonly chase = new ChaseSystem(this.terrain);
  private readonly fx = new SnowFXSystem();
  private readonly audio = new AudioManager();
  private readonly input: InputManager;
  private readonly hud: HUDController;
  private readonly tricks: TrickSystem;
  private readonly cameraRig = new CameraRig(this.camera, this.terrain);
  private readonly physics: PhysicsWorld;
  private readonly hazards: Hazard[] = [];
  private readonly sun = new THREE.DirectionalLight('#fff9e7', 2.65);
  private readonly sunTarget = new THREE.Object3D();
  private phase: GamePhase = 'title';
  private settings: GameSettings = { music: 0.72, effects: 0.85, ambience: 0.7, quality: 'High', reducedMotion: false };
  private accumulator = 0;
  private lastTime = 0;
  private frameId = 0;
  private running = false;
  private frame = 0;
  private elapsed = 0;
  private fps = 60;
  private fixedMs = 0;
  private previousSpecial = 0;
  private collisionCooldown = 0;
  private suppressRailCollisionUntilLanding = false;
  private lastCollision = 'none';
  private freezeTimer = 0;
  private screenshotPaused = false;
  private mintIntegrated = false;
  private readonly mobileProfile = window.innerWidth <= 700;
  private readonly constrainedRenderProfile = this.mobileProfile || import.meta.env.VITE_TEST_RENDER_PROFILE === 'low';

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    physics: PhysicsWorld,
    private readonly assets: AssetManager,
  ) {
    this.physics = physics;
    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = 1.1;
    this.terrain.setMobileDetail(this.constrainedRenderProfile);
    if (this.constrainedRenderProfile) this.settings.quality = 'Low';
    const stick = this.required('#touch-stick'); const knob = this.required('#touch-knob');
    this.input = new InputManager(canvas, stick, knob, document.querySelectorAll<HTMLButtonElement>('.touch-actions button'));
    this.tricks = new TrickSystem((label, combo) => this.hud.showCallout(label, combo));
    this.hud = new HUDController({
      play: () => this.startRun(), resume: () => this.resume(), restart: () => this.startRun(), quit: () => this.quitToTitle(), settings: (settings) => this.applySettings(settings),
    });
    this.createScene();
    if (this.constrainedRenderProfile) this.applySettings(this.settings);
    this.rider.addCableRail(this.lift.cableRail);
    this.cameraRig.snap(this.rider.state);
    this.hud.showPhase('title');
    this.installTestHooks();
    this.publishDiagnostics();
  }

  static async create(canvas: HTMLCanvasElement): Promise<GameApp> {
    const assets = new AssetManager();
    await assets.initialize();
    const terrain = new TerrainGenerator();
    const physics = await PhysicsWorld.create(terrain);
    terrain.dispose();
    const game = new GameApp(canvas, physics, assets);
    await game.integrateMintAssets();
    game.registerWorldPhysics();
    const status = document.querySelector<HTMLElement>('#asset-status');
    if (status) status.textContent = game.mintIntegrated ? 'MINT ASSET PIPELINE ONLINE' : 'LOCAL ASSETS UNAVAILABLE';
    return game;
  }

  start(): void {
    if (this.running) return; this.running = true; this.lastTime = performance.now(); this.frameId = requestAnimationFrame(this.tick);
  }

  dispose(): void {
    this.running = false; cancelAnimationFrame(this.frameId); this.input.dispose(); this.audio.dispose(); this.physics.dispose(); this.terrain.dispose(); this.lift.dispose(); this.chase.dispose(); this.fx.dispose(); this.rider.dispose(); this.assets.dispose(); disposeMintGltfRuntime(); this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined; window.__THREE_GAME_TEST_HOOKS__ = undefined;
  }

  private readonly tick = (time: number) => {
    if (!this.running) return;
    const delta = Math.min(0.05, Math.max(0, (time - this.lastTime) / 1000)); this.lastTime = time; this.frame += 1;
    this.fps += ((delta > 0 ? 1 / delta : 60) - this.fps) * 0.08;
    this.input.beginFrame();
    if (this.input.pressed('debug')) {
      this.hud.toggleDebug();
      this.physics.setDebugVisible(this.hud.isDebugVisible());
    }
    if (this.input.pressed('pause')) { if (this.phase === 'playing') this.pause(); else if (this.phase === 'paused') this.resume(); }

    let consumedSimulationInput = false;
    if (this.phase === 'playing' && !this.screenshotPaused) {
      if (this.freezeTimer > 0) this.freezeTimer = Math.max(0, this.freezeTimer - delta);
      else {
        this.accumulator += delta;
        let steps = 0;
        const begin = performance.now();
        while (this.accumulator >= FIXED_DT && steps < 5) { this.fixedStep(FIXED_DT); this.accumulator -= FIXED_DT; steps += 1; }
        consumedSimulationInput = steps > 0;
        this.fixedMs = performance.now() - begin;
      }
      this.lift.update(delta);
      this.fx.update(delta, this.rider.state, this.tricks.specialActive);
      this.cameraRig.update(delta, this.rider.state, this.input.cameraLook, this.settings.reducedMotion, this.tricks.specialActive);
      this.hud.update(delta, this.rider.state, this.chase.state, this.tricks, this.input.activeDevice);
      const danger = 1 - Math.min(1, Math.min(this.chase.state.yetiDistance, this.chase.state.bearDistance) / 35);
      this.audio.update(this.rider.state.speedMps, this.rider.state.steer, this.rider.state.grounded, !!this.rider.state.grinding, danger);
      document.documentElement.style.setProperty(
        '--speed-streak-opacity',
        String(THREE.MathUtils.clamp((this.rider.state.speedMps - 22) / 18 + (this.tricks.specialActive ? 0.45 : 0), 0, 0.72)),
      );
    } else if (this.phase === 'title') {
      this.lift.update(delta * 0.45);
      this.cameraRig.update(delta, this.rider.state, new THREE.Vector2(Math.sin(time * 0.00012) * 0.15, -0.08), true, false);
      document.documentElement.style.setProperty('--speed-streak-opacity', '0');
    }

    if (!(this.screenshotPaused && this.constrainedRenderProfile)) {
      this.updateSun();
      this.terrain.updateVisibility(this.rider.state.distance);
      resizeRenderer(this.renderer, this.camera, this.settings.quality === 'High' ? 2 : this.settings.quality === 'Medium' ? 1.5 : 1);
      this.renderer.render(this.scene, this.camera);
    }
    this.publishDiagnostics();
    if (consumedSimulationInput || this.phase !== 'playing') this.input.endFrame();
    this.frameId = requestAnimationFrame(this.tick);
  };

  private fixedStep(dt: number): void {
    this.elapsed += dt;
    this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    const specialWasActive = this.tricks.specialActive;
    this.tricks.handleInput(dt, this.input);
    this.physics.syncMovingColliders(this.lift.movingColliderTransforms());
    this.rider.fixedUpdate(dt, this.input, this.tricks.specialActive);
    if (this.rider.events.some((event) => event.type === 'grind-end')) {
      this.collisionCooldown = Math.max(this.collisionCooldown, 0.32);
      this.suppressRailCollisionUntilLanding = true;
    }
    if (this.rider.events.some((event) => event.type === 'bail' || event.type === 'reset')) {
      this.suppressRailCollisionUntilLanding = false;
    }
    const collisionTags = this.physics.step(this.rider.state, this.rider.collisionQuaternion());
    this.resolveCollisions(collisionTags);
    if (
      this.suppressRailCollisionUntilLanding
      && this.rider.state.grounded
      && !collisionTags.some((tag) => tag.startsWith('rail:'))
    ) {
      this.suppressRailCollisionUntilLanding = false;
    }
    this.tricks.update(dt, this.rider.state, this.rider.events);
    this.processRiderEvents(this.rider.events);
    this.chase.fixedUpdate(dt, this.rider.state, this.tricks.specialActive);

    if (this.previousSpecial < 0.999 && this.tricks.special >= 0.999) this.audio.specialReady();
    if (!specialWasActive && this.tricks.specialActive) this.audio.special();
    this.previousSpecial = this.tricks.special;

    if (this.chase.state.caughtBy) { this.endRun(false, this.chase.state.caughtBy); return; }
    if (this.rider.state.distance >= MOUNTAIN_LENGTH - 12) this.endRun(true, null);
  }

  private processRiderEvents(events: RiderEvent[]): void {
    for (const event of events) {
      if (event.type === 'takeoff') this.audio.jump();
      if (event.type === 'land') {
        this.audio.land(event.impact); this.fx.burst(this.rider.state.position, event.impact > 15 ? 1.4 : 0.75);
        this.cameraRig.addTrauma(event.quality === 'clean' ? 0.16 : event.quality === 'sketchy' ? 0.3 : 0.65);
        if (event.quality !== 'wipeout') this.audio.score();
      }
      if (event.type === 'bail') { this.audio.bail(); this.fx.burst(this.rider.state.position, 1.8); this.cameraRig.addTrauma(0.72); this.freezeTimer = 0.075; }
      if (event.type === 'grind-start') this.cameraRig.addTrauma(0.08);
    }
  }

  private startRun(): void {
    void this.audio.unlock(); this.rider.resetRun(); this.chase.reset(); this.tricks.reset(); this.fx.reset(); this.elapsed = 0; this.accumulator = 0; this.previousSpecial = 0; this.collisionCooldown = 0; this.suppressRailCollisionUntilLanding = false; this.lastCollision = 'none'; this.freezeTimer = 0;
    this.physics.teleportRider(this.rider.state, this.rider.collisionQuaternion());
    this.phase = 'playing'; this.hud.showPhase('playing'); this.cameraRig.snap(this.rider.state); this.canvas.focus();
  }

  private pause(): void { this.phase = 'paused'; this.hud.showPhase('paused'); if (document.pointerLockElement === this.canvas) void document.exitPointerLock(); }
  private resume(): void { this.phase = 'playing'; this.hud.showPhase('playing'); this.lastTime = performance.now(); this.canvas.focus(); }
  private quitToTitle(): void { this.phase = 'title'; this.hud.showPhase('title'); this.rider.resetRun(); this.cameraRig.snap(this.rider.state); }

  private endRun(finished: boolean, caughtBy: string | null): void {
    if (this.phase !== 'playing') return;
    const stats: RunStats = { score: 0, maxSpeed: this.rider.state.maxSpeedMph, longestCombo: 0, bestTrick: '—', bestTrickScore: 0, distance: this.rider.state.distance, caughtBy };
    this.tricks.populateStats(stats); this.hud.showResults(stats, finished); this.hud.flashWhiteout(); this.phase = 'results';
    window.setTimeout(() => this.hud.showPhase('results'), 520);
  }

  private applySettings(settings: GameSettings): void {
    this.settings = settings; this.audio.setVolumes({ music: settings.music, effects: settings.effects, ambience: settings.ambience });
    this.renderer.shadowMap.enabled = settings.quality !== 'Low'; this.sun.castShadow = settings.quality !== 'Low';
    this.sun.shadow.mapSize.set(settings.quality === 'High' ? 2048 : 1024, settings.quality === 'High' ? 2048 : 1024);
  }

  private createScene(): void {
    this.scene.background = new THREE.Color('#9fd9dc');
    this.scene.fog = new THREE.FogExp2('#c5ece9', 0.0082);
    this.scene.add(new THREE.HemisphereLight(MINT_ALPINE.ice, MINT_ALPINE.ink, 1.72));
    this.sun.position.set(-48, 96, 52); this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 260; this.sun.shadow.camera.left = -85; this.sun.shadow.camera.right = 85; this.sun.shadow.camera.top = 85; this.sun.shadow.camera.bottom = -85;
    this.scene.add(this.sun, this.sunTarget); this.sun.target = this.sunTarget;
    this.scene.add(this.terrain.group, this.lift.group, this.rider.group, this.chase.group, this.fx.group, this.physics.debugGroup);
  }

  private async integrateMintAssets(): Promise<void> {
    this.audio.initialize(this.assets);
    const [sky] = await Promise.all([
      this.assets.loadTexture('alpine-sky', 'image_file', true),
      this.terrain.applyMintAssets(this.assets),
      this.lift.applyMintAssets(this.assets),
      this.rider.applyMintAssets(this.assets),
      this.chase.applyMintAssets(this.assets, this.constrainedRenderProfile),
      this.createHazards(),
    ]);
    if (sky) {
      sky.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.background = sky;
      this.scene.environment = sky;
    }
    this.mintIntegrated = this.assets.isMintReady();
    this.publishDiagnostics();
  }

  private async createHazards(): Promise<void> {
    const [rock, tree, fence] = await Promise.all([
      this.assets.loadModel('prop-rounded-boulder'),
      this.assets.loadModel('prop-young-conifer'),
      this.assets.loadModel('prop-snow-fence'),
    ]);
    if (rock) fitModel(rock, 3.2, 'largest');
    if (tree) fitModel(tree, 5.4, 'height');
    if (fence) fitModel(fence, 4.4, 'largest');
    if (fence) applySharedMaterial(fence, createParkMaterial('marker'));
    const root = new THREE.Group();
    root.name = 'mint-gameplay-hazards';
    const plan = [
      [150, -12, 'rock'], [225, 14, 'tree'], [310, -16, 'fence'], [470, 10, 'rock'], [585, -13, 'tree'], [748, 15, 'fence'],
      [815, -9, 'rock'], [875, 11, 'rock'], [1015, -12, 'tree'], [1160, 13, 'tree'], [1235, -15, 'fence'], [1320, 8, 'rock'],
      [1435, -11, 'tree'], [1515, 14, 'rock'], [1590, -7, 'fence'], [1690, 12, 'rock'], [1750, -11, 'tree'],
    ] as const;
    for (const [progress, lateral, kind] of plan) {
      const x = this.terrain.routeCenter(progress) + lateral; const z = -progress; const y = this.terrain.heightAt(x, z);
      const source = kind === 'rock' ? rock : kind === 'tree' ? tree : fence;
      if (!source) continue;
      const mesh = new THREE.Group();
      mesh.name = `mint-hazard-${kind}`;
      mesh.position.set(x, y, z);
      mesh.add(source.clone(true));
      if (kind === 'rock') mesh.scale.set(1.15, 0.82, 1.35);
      if (kind === 'fence') mesh.rotation.y = 0.18;
      root.add(mesh); this.hazards.push({ position: mesh.position.clone(), radius: kind === 'fence' ? 2.2 : kind === 'tree' ? 1.2 : 1.65, kind, mesh });
    }
    this.scene.add(root);
  }

  private registerWorldPhysics(): void {
    const hazardPlans: StaticColliderPlan[] = this.hazards.map((hazard, index) => ({
      id: `hazard-${hazard.kind}-${index}`,
      tag: `hazard:${hazard.kind}`,
      shape: hazard.kind === 'rock' ? 'ball' : 'box',
      position: hazard.position.clone().add(new THREE.Vector3(0, hazard.kind === 'tree' ? 2.55 : hazard.kind === 'fence' ? 1.15 : 0.95, 0)),
      radius: hazard.kind === 'rock' ? hazard.radius : undefined,
      halfExtents: hazard.kind === 'tree'
        ? new THREE.Vector3(0.68, 2.55, 0.68)
        : hazard.kind === 'fence'
          ? new THREE.Vector3(2.2, 1.15, 0.28)
          : undefined,
      rotation: hazard.mesh.quaternion.clone(),
    }));
    this.physics.addStaticColliders([
      ...this.terrain.collisionPrimitives(),
      ...this.lift.staticCollisionPrimitives(),
      ...hazardPlans,
    ]);
    this.physics.registerMovingBoxes(this.lift.movingColliderIds(), new THREE.Vector3(1.35, 1.2, 1.35));
  }

  private resolveCollisions(tags: string[]): void {
    if (this.collisionCooldown > 0 || this.rider.state.bailing) return;
    const tag = tags.find((value) => {
      if (!value.startsWith('rail:')) return true;
      return !this.rider.state.grinding && !this.suppressRailCollisionUntilLanding;
    });
    if (!tag) return;
    this.lastCollision = tag;
    this.collisionCooldown = 0.9;
    const label = tag.startsWith('hazard:') ? tag.slice('hazard:'.length) : tag.startsWith('rail:') ? 'rail' : tag;
    this.rider.triggerBail(`HIT ${label.replaceAll('-', ' ').toUpperCase()}`);
  }

  private updateSun(): void {
    const p = this.rider.state.position; this.sun.position.set(p.x - 58, p.y + 98, p.z + 58); this.sunTarget.position.set(p.x, p.y, p.z - 28); this.sunTarget.updateMatrixWorld();
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame, elapsed: this.elapsed, score: this.tricks.score, targetScore: 0, complete: this.phase === 'results',
      player: { position: { x: this.rider.state.position.x, y: this.rider.state.position.y, z: this.rider.state.position.z }, speed: this.rider.state.speedMps },
      renderer: { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures },
      physics: this.physics.stats(),
      rig: this.rider.rigDiagnostics(),
      binding: this.rider.bindingDiagnostics(),
      boardVisual: this.rider.boardVisualDiagnostics(),
      trick: this.rider.trickDiagnostics(),
      animation: this.rider.animationDiagnostics(),
      bestTrick: this.tricks.bestTrick,
      collision: this.lastCollision,
      canvas: { clientWidth: this.canvas.clientWidth, clientHeight: this.canvas.clientHeight, width: this.canvas.width, height: this.canvas.height, dpr: this.renderer.getPixelRatio() },
      phase: this.phase, riderState: this.rider.state.bailing ? 'bailing' : this.rider.state.grinding ?? (this.rider.state.grounded ? 'grounded' : 'airborne'),
      pursuers: { bear: this.chase.state.bearDistance, yeti: this.chase.state.yetiDistance }, special: this.tricks.special, specialActive: this.tricks.specialActive, blockoutAssets: !this.mintIntegrated,
    };
    this.hud.updateDebug([
      `FPS ${this.fps.toFixed(0)} | fixed ${this.fixedMs.toFixed(2)}ms`,
      `pos ${this.rider.state.position.x.toFixed(1)} ${this.rider.state.position.y.toFixed(1)} ${this.rider.state.position.z.toFixed(1)}`,
      `speed ${this.rider.state.speedMph.toFixed(1)} MPH | region ${this.rider.surface.region}`,
      `normal ${this.rider.surface.normal.x.toFixed(2)} ${this.rider.surface.normal.y.toFixed(2)} ${this.rider.surface.normal.z.toFixed(2)}`,
      `state ${window.__THREE_GAME_DIAGNOSTICS__.riderState} | grind ${this.rider.state.grinding ?? 'none'}`,
      `${this.rider.rigDiagnostics()} | collision ${this.lastCollision}`,
      `board ${window.__THREE_GAME_DIAGNOSTICS__.boardVisual.baseLocalY.toFixed(2)}..${window.__THREE_GAME_DIAGNOSTICS__.boardVisual.topLocalY.toFixed(2)} | contact ${window.__THREE_GAME_DIAGNOSTICS__.boardVisual.groundClearanceCm.toFixed(1)}cm`,
      `trick ${this.rider.trickDiagnostics()} | anim ${this.rider.animationDiagnostics()}`,
      `bear ${this.chase.state.bearDistance.toFixed(1)}m | yeti ${this.chase.state.yetiDistance.toFixed(1)}m`,
      `score ${this.tricks.score} | special ${(this.tricks.special * 100).toFixed(0)}%`,
      `${this.physics.diagnostics()}`,
      `draw ${info.render.calls} | tris ${info.render.triangles} | geo ${info.memory.geometries} | tex ${info.memory.textures}`,
    ].join('\n'));
  }

  private installTestHooks(): void {
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: () => { /* Runtime generation is already deterministic; preserved for harness contract. */ },
      setState: (name: string) => {
        if (name === 'active-play') this.startRun();
        else if (name === 'complete') { this.startRun(); this.rider.state.position.z = -1785; this.rider.state.distance = 1785; }
        else if (
          name === 'stance'
          || name === 'air-trick'
          || name === 'backflip'
          || name === 'spin-360'
          || name === 'spin-720'
          || name === 'cork'
          || name === 'grind'
          || name === 'grind-5050'
          || name === 'grind-boardslide'
          || name === 'jump-feature'
          || name === 'park-feature'
        ) {
          this.startRun();
          this.rider.setTestPose(name);
          this.physics.teleportRider(this.rider.state, this.rider.collisionQuaternion());
          this.cameraRig.snap(this.rider.state);
        } else if (name === 'collision-debug') {
          this.startRun(); this.rider.setTestPose('park-feature'); this.physics.setDebugVisible(true); this.cameraRig.snap(this.rider.state);
        } else if (name === 'collision-test') {
          this.startRun();
          const hazard = this.hazards[0];
          if (hazard) this.rider.setTestCollision(hazard.position);
          this.physics.teleportRider(this.rider.state, this.rider.collisionQuaternion());
          this.cameraRig.snap(this.rider.state);
        } else if (name === 'special-ready') { this.startRun(); this.tricks.special = 1; }
        else if (name === 'caught') { this.startRun(); this.chase.state.yetiDistance = 1.7; }
        this.publishDiagnostics();
      },
      setPausedForScreenshot: (paused: boolean) => { this.screenshotPaused = paused; },
      stepFrames: (frames: number) => {
        const count = THREE.MathUtils.clamp(Math.floor(frames), 0, 600);
        this.accumulator = 0;
        for (let index = 0; index < count && this.phase === 'playing'; index += 1) {
          this.input.beginFrame();
          this.fixedStep(FIXED_DT);
          this.input.endFrame();
          this.frame += 1;
        }
        this.publishDiagnostics();
      },
      setReducedMotion: (enabled: boolean) => { this.settings.reducedMotion = enabled; },
      hideDebugUi: (hidden: boolean) => { if (hidden && this.hud.isDebugVisible()) this.hud.toggleDebug(); },
      setKey: (code: string, held: boolean) => { this.input.setTestKey(code, held); },
    };
  }

  private required<T extends HTMLElement = HTMLElement>(selector: string): T { const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing element ${selector}`); return element; }
}

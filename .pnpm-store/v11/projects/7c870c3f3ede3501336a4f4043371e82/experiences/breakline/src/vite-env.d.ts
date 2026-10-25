/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** CI-only low-detail render profile for software-WebGL browser tests. */
  readonly VITE_TEST_RENDER_PROFILE?: 'low';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ThreeGameDiagnostics {
  frame: number;
  elapsed: number;
  score: number;
  targetScore: number;
  complete: boolean;
  player: {
    position: { x: number; y: number; z: number };
    speed: number;
  };
  renderer: {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
  };
  physics: {
    engine: 'rapier';
    timestep: number;
    bodies: number;
    colliders: number;
    sensors: number;
    ccdBodies: number;
  };
  rig: string;
  binding: {
    bound: boolean;
    boardGeometryAligned: boolean;
    maxPositionErrorCm: number;
    maxAngularErrorDeg: number;
    passed: boolean;
    detail: string;
  };
  boardVisual: {
    loaded: boolean;
    baseLocalY: number;
    topLocalY: number;
    groundClearanceCm: number;
    passed: boolean;
  };
  trick: string;
  animation: string;
  bestTrick: string;
  collision: string;
  canvas: {
    clientWidth: number;
    clientHeight: number;
    width: number;
    height: number;
    dpr: number;
  };
  phase: string;
  riderState: string;
  pursuers: { bear: number; yeti: number };
  special: number;
  specialActive: boolean;
  blockoutAssets: boolean;
}

interface ThreeGameTestHooks {
  /** Re-seed the game RNG; all gameplay randomness must flow through it. */
  seed(value: number): void;
  /** Jump to a named state for baselines (scaffold: 'active-play' | 'complete'). */
  setState(name: string): void;
  /** Freeze the simulation while continuing to render the current frame. */
  setPausedForScreenshot(paused: boolean): void;
  /** Advance deterministic fixed simulation frames without relying on rendered frame rate. */
  stepFrames(frames: number): void;
  /** Freeze ambient/idle animation time so screenshots are stable. */
  setReducedMotion(enabled: boolean): void;
  /** Hide debug UI (lil-gui) before capturing. */
  hideDebugUi(hidden: boolean): void;
  /** Inject a key intent without depending on browser focus timing. */
  setKey(code: string, held: boolean): void;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
  __THREE_GAME_TEST_HOOKS__?: ThreeGameTestHooks;
}

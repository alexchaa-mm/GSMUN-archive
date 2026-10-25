import type * as THREE from 'three';

export type GamePhase = 'title' | 'playing' | 'paused' | 'results';
export type InputDevice = 'keyboard' | 'gamepad' | 'touch';
export type LandingQuality = 'clean' | 'sketchy' | 'wipeout';
export type GrindKind = 'rail' | 'cable' | null;
export type GrindStyle = '50-50' | 'boardslide' | null;

export type TerrainSample = {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  routeCenter: number;
  progress: number;
  region: string;
};

export interface WorldQuery {
  sampleSurface(position: THREE.Vector3, target?: TerrainSample): TerrainSample;
}

export type RiderState = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  speedMps: number;
  speedMph: number;
  maxSpeedMph: number;
  distance: number;
  grounded: boolean;
  bailing: boolean;
  tucked: boolean;
  grinding: GrindKind;
  grindStyle: GrindStyle;
  steer: number;
  airTime: number;
  airHeight: number;
  yawRotation: number;
  flipRotation: number;
  corked: boolean;
  grab: 'frontside' | 'backside' | 'nose' | 'tail' | null;
  butter: 'nose' | 'tail' | null;
  lastLanding: LandingQuality | null;
};

export type ChaseState = {
  bearDistance: number;
  yetiDistance: number;
  bearClosing: boolean;
  yetiClosing: boolean;
  danger: boolean;
  caughtBy: 'POLAR BEAR' | 'YETI' | null;
};

export type RunStats = {
  score: number;
  maxSpeed: number;
  longestCombo: number;
  bestTrick: string;
  bestTrickScore: number;
  distance: number;
  caughtBy: string | null;
};

export type QualityLevel = 'High' | 'Medium' | 'Low';

export type GameSettings = {
  music: number;
  effects: number;
  ambience: number;
  quality: QualityLevel;
  reducedMotion: boolean;
};

export const FIXED_DT = 1 / 60;
export const MOUNTAIN_LENGTH = 1800;
export const METERS_PER_SECOND_TO_MPH = 2.236936;

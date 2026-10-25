import * as THREE from "three";
import { loadMintModel } from "../assets/loadModel";
import type { EnvironmentId, StageDef } from "../config/stages";
import {
  createEnvironment,
  IceEnvironment,
  MoltenEnvironment,
  SkyfieldEnvironment,
} from "./environments";
import type { StageEnvironment } from "./environments";

// Renderer, scene, fixed side-view camera, and the current stage backdrop.
// 2.5D: the camera looks down -Z at the z=0 gameplay plane and does not follow
// the fighter (classic fixed Battlefield framing); blast zones sit off-screen.
//
// Lighting belongs to the environment, not here — a sunlit plateau and a lava
// cavern need completely different light rigs.

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private env: StageEnvironment;
  private envId: EnvironmentId | null = null;

  private readonly canvas: HTMLCanvasElement;
  private readonly clock = new THREE.Clock();

  constructor(canvas: HTMLCanvasElement, stageDef: StageDef) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    this.camera.position.set(0, 4, 32);
    this.camera.lookAt(0, 2.2, 0);

    this.env = createEnvironment(stageDef, this.scene);
    this.envId = stageDef.environment;
    this.decorate(this.env);

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  get environment(): StageEnvironment {
    return this.env;
  }

  /** Tear down the current backdrop and build the one this stage calls for. */
  setEnvironment(stageDef: StageDef) {
    if (this.envId === stageDef.environment) return;
    this.env.dispose();
    this.env = createEnvironment(stageDef, this.scene);
    this.envId = stageDef.environment;
    this.decorate(this.env);
  }

  /**
   * Drop generated scenery into the backdrop's slots. Fired and not awaited:
   * the stage is playable without it, and it pops in when it arrives.
   */
  private decorate(env: StageEnvironment) {
    if (env instanceof SkyfieldEnvironment) {
      loadMintModel("bg-island")
        .then((m) => m && env === this.env && env.useIslandModel(m))
        .catch((err) => console.warn("bg-island failed to load", err));
    } else if (env instanceof MoltenEnvironment) {
      loadMintModel("cavern-rock")
        .then((m) => m && env === this.env && env.useRockModel(m))
        .catch((err) => console.warn("cavern-rock failed to load", err));
    } else if (env instanceof IceEnvironment) {
      loadMintModel("summit-peak")
        .then((m) => m && env === this.env && env.usePeakModel(m))
        .catch((err) => console.warn("summit-peak failed to load", err));
    }
  }

  resize() {
    // Size from the canvas's own client rect so rendering works even while the
    // preview pane is offscreen (window.innerWidth can be 0 there).
    const w = this.canvas.clientWidth || window.innerWidth || 1280;
    const h = this.canvas.clientHeight || window.innerHeight || 720;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the stage framed on portrait screens by easing the camera back.
    const base = 32;
    this.camera.position.z = base * Math.max(1, 1.2 / this.camera.aspect);
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.env.update(this.clock.getElapsedTime());
    this.renderer.render(this.scene, this.camera);
  }
}

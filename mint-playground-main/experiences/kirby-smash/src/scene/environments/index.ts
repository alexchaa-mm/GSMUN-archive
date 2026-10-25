import * as THREE from "three";
import type { StageDef } from "../../config/stages";
import { IceEnvironment } from "./IceEnvironment";
import { MoltenEnvironment } from "./MoltenEnvironment";
import { SkyfieldEnvironment } from "./SkyfieldEnvironment";
import type { StageEnvironment } from "./types";

export { IceEnvironment } from "./IceEnvironment";
export { MoltenEnvironment } from "./MoltenEnvironment";
export { SkyfieldEnvironment } from "./SkyfieldEnvironment";
export type { StageEnvironment } from "./types";

/**
 * Build the backdrop a stage calls for. Takes the whole StageDef, not just the
 * environment id, because a backdrop can be load-bearing: the ice sea has to
 * render at exactly the waterline the swimming physics uses.
 */
export function createEnvironment(def: StageDef, scene: THREE.Scene): StageEnvironment {
  switch (def.environment) {
    case "molten":
      return new MoltenEnvironment(scene);
    case "ice":
      return new IceEnvironment(scene, def.water);
    case "skyfield":
    default:
      return new SkyfieldEnvironment(scene);
  }
}

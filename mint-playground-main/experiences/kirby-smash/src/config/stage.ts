// Which stage the current match is played on. Gameplay code reads geometry
// through `stage()` rather than importing constants, so picking a map on the
// title screen swaps collision, blast zones and spawns along with the art.
//
// The stage may only change between matches (see main.ts): a fighter mid-flight
// would otherwise be measured against a blast zone that no longer exists.

import { DEFAULT_STAGE_ID, STAGES } from "./stages";
import type { StageDef, StageId } from "./stages";

export type { BlastZone, PlatformDef, StageDef, StageId, WaterDef } from "./stages";
export { STAGE_LIST, STAGES } from "./stages";

let active: StageDef = STAGES[DEFAULT_STAGE_ID];

/** Geometry for the stage the current match is being played on. */
export function stage(): StageDef {
  return active;
}

export function setStage(id: StageId): void {
  active = STAGES[id];
}

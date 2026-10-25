// Every selectable map. A stage owns its collision geometry, blast zones,
// spawn height, backdrop style, and the Mint art keys its platforms are fit to.
// Collision is hand-built here (authoritative); stage models are fit to these
// boxes at load time so the art lines up with the physics.
//
// Units are meters-ish; the fighter is ~1 unit tall. +x right, +y up, gameplay
// lives on the z=0 plane. `config/stage.ts` tracks which stage is active.

export interface PlatformDef {
  minX: number;
  maxX: number;
  topY: number;
  solid: boolean; // solid = main stage (land from above, walk off edges).
  // soft = one-way: land from above, pass through from below, drop through.
}

export interface BlastZone {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

/**
 * Swimmable water. A fighter who falls below `surfaceY` starts swimming
 * instead of simply falling: they sink unless the player strokes upward, and
 * after `drownSeconds` in the water their strokes stop working and they go
 * under for good. Stages without water omit this entirely.
 */
export interface WaterDef {
  surfaceY: number;
  drownSeconds: number;
}

/** Art keys + visual dimensions used to build (or fake) the stage geometry. */
export interface StageArt {
  /** Mint logical key for the main platform; null falls back to a box. */
  mainModel: string | null;
  /** Mint logical key cloned onto every soft platform. */
  slabModel: string | null;
  depth: number; // z extent of platform art and placeholder boxes
  mainHeight: number; // visual body height below the main top surface
  softHeight: number;
  mainColor: number; // placeholder box colours, used only until art loads
  softColor: number;
}

/** Palette for the menu thumbnail, so a card always matches its backdrop. */
export interface StageTheme {
  skyTop: string;
  skyBottom: string;
  deck: string;
  accent: string;
}

export type EnvironmentId = "skyfield" | "molten" | "ice";
export type StageId = "battlefield" | "norfair" | "summit";

export interface StageDef {
  id: StageId;
  name: string;
  blurb: string;
  environment: EnvironmentId;
  main: PlatformDef;
  soft: PlatformDef[];
  /** main + soft — the set collision queries walk. */
  platforms: PlatformDef[];
  blast: BlastZone;
  /** Drop point after a KO: `x` is the distance out from centre, mirrored per
   *  player. Keep it clear of soft platforms so both fighters land on the main
   *  deck facing each other rather than on separate perches. */
  spawn: { x: number; y: number };
  /** Present only on stages you can fall into and swim in. */
  water?: WaterDef;
  art: StageArt;
  theme: StageTheme;
}

type StageSpec = Omit<StageDef, "platforms">;

function defineStage(spec: StageSpec): StageDef {
  return { ...spec, platforms: [spec.main, ...spec.soft] };
}

// Battlefield: the original wide plateau with a three-platform triangle.
const BATTLEFIELD = defineStage({
  id: "battlefield",
  name: "Battlefield",
  blurb: "Floating plateau, three soft platforms",
  environment: "skyfield",
  main: { minX: -7, maxX: 7, topY: 0, solid: true },
  soft: [
    { minX: -4.6, maxX: -1.6, topY: 3.0, solid: false }, // lower left
    { minX: 1.6, maxX: 4.6, topY: 3.0, solid: false }, // lower right
    { minX: -1.5, maxX: 1.5, topY: 5.6, solid: false }, // top center
  ],
  blast: { left: -16, right: 16, bottom: -11, top: 17 },
  spawn: { x: 3.5, y: 8.5 },
  art: {
    mainModel: "stage-main",
    slabModel: "stage-slab",
    depth: 2.2,
    mainHeight: 3.2,
    softHeight: 0.6,
    mainColor: 0x6f7a55,
    softColor: 0x7d8a63,
  },
  theme: {
    skyTop: "#3f93d6",
    skyBottom: "#cfe8f6",
    deck: "#7d8a63",
    accent: "#a8d8f0",
  },
});

// Molten Cavern: a narrower main deck over a lava lake, with two mid slabs and
// two high outer slabs forming a staircase out toward the blast zones. More
// open than Battlefield — edges are further from safety in every direction.
const NORFAIR = defineStage({
  id: "norfair",
  name: "Molten Cavern",
  blurb: "Narrow deck over lava, four floating slabs",
  environment: "molten",
  main: { minX: -4.6, maxX: 4.6, topY: 0, solid: true },
  soft: [
    { minX: -6.6, maxX: -3.2, topY: 3.3, solid: false }, // mid left
    { minX: 3.2, maxX: 6.6, topY: 3.3, solid: false }, // mid right
    { minX: -10.8, maxX: -7.4, topY: 6.2, solid: false }, // high left
    { minX: 7.4, maxX: 10.8, topY: 6.2, solid: false }, // high right
  ],
  blast: { left: -17, right: 17, bottom: -10, top: 17 },
  spawn: { x: 2.2, y: 9 }, // inside the mid slabs' inner edge at |x| = 3.2
  art: {
    mainModel: "cavern-main",
    slabModel: "cavern-slab",
    depth: 2.0,
    mainHeight: 3.0,
    softHeight: 0.55,
    mainColor: 0x3b3350,
    softColor: 0x3f6a70,
  },
  theme: {
    skyTop: "#2a1030",
    skyBottom: "#ff6a1a",
    deck: "#3f6a70",
    accent: "#ffb347",
  },
});

// Summit: a snow ledge on an iceberg, ringed by open sea. The peak behind the
// stage is scenery, not geometry — nothing here collides except these five
// boxes. Falling off is survivable, which makes this the most forgiving stage
// horizontally and the only one where you can drown.
const SUMMIT = defineStage({
  id: "summit",
  name: "Summit",
  blurb: "Iceberg ledges over open, swimmable sea",
  environment: "ice",
  main: { minX: -5.5, maxX: 5.5, topY: 0, solid: true },
  soft: [
    { minX: -7.4, maxX: -3.6, topY: 3.4, solid: false }, // medium left
    { minX: 3.6, maxX: 7.4, topY: 3.4, solid: false }, // medium right
    { minX: -4.6, maxX: -2.4, topY: 6.5, solid: false }, // small left
    { minX: 2.4, maxX: 4.6, topY: 6.5, solid: false }, // small right
  ],
  // A deep bottom zone: the sea catches you long before the KO line, so the
  // drop is a swim you have to escape rather than an instant loss.
  blast: { left: -16.5, right: 16.5, bottom: -13, top: 17 },
  spawn: { x: 1.8, y: 9 }, // clear of the small slabs' inner edge at |x| = 2.4
  water: { surfaceY: -2.6, drownSeconds: 6 },
  art: {
    mainModel: "summit-main",
    slabModel: "summit-slab",
    depth: 2.2,
    mainHeight: 3.4,
    softHeight: 0.5,
    mainColor: 0xdCEBF5,
    softColor: 0x9a8f7d,
  },
  theme: {
    skyTop: "#6fb2e0",
    skyBottom: "#e8f6ff",
    deck: "#f2fbff",
    accent: "#3d9bd4",
  },
});

export const STAGES: Record<StageId, StageDef> = {
  battlefield: BATTLEFIELD,
  norfair: NORFAIR,
  summit: SUMMIT,
};

/** Menu order. */
export const STAGE_LIST: StageDef[] = [BATTLEFIELD, NORFAIR, SUMMIT];

export const DEFAULT_STAGE_ID: StageId = "battlefield";

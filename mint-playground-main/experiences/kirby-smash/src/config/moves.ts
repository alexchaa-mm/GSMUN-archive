// Move frame + hitbox data. Shared types live here along with Kirby's moveset;
// each additional character gets its own file (see samusMoves.ts) and every
// character must define all 17 MoveIds so the state machine can stay uniform.
//
// Values are tuned for relative feel (jabs weak, smashes and Hammer heavy)
// rather than frame-exact Melee data. Offsets are FORWARD-RELATIVE: +x is in
// front of the fighter, +y is up. Angle is the launch direction in degrees,
// also forward-relative (0 = straight forward, 90 = straight up, 270 = down).
//
// Specials (neutralB/sideB/upB/downB) carry timing here but their motion,
// projectiles and invulnerability live in Fighter.ts because they do more than
// spawn a hitbox.

export type MoveId =
  | "jab"
  | "ftilt"
  | "utilt"
  | "dtilt"
  | "dashAttack"
  | "fsmash"
  | "usmash"
  | "dsmash"
  | "nair"
  | "fair"
  | "bair"
  | "uair"
  | "dair"
  | "neutralB"
  | "sideB"
  | "upB"
  | "downB";

export type MoveKind = "ground" | "air" | "special";

export interface HitboxSpec {
  start: number; // first active frame (0-based, within the move)
  end: number; // last active frame (inclusive)
  x: number;
  y: number;
  r: number;
  damage: number;
  baseKnockback: number;
  knockbackGrowth: number;
  angle: number;
}

export interface MoveSpec {
  id: MoveId;
  name: string;
  kind: MoveKind;
  startup: number;
  active: number;
  endlag: number;
  chargeable?: boolean;
  hitboxes: HitboxSpec[];
}

export function totalFrames(m: MoveSpec): number {
  return m.startup + m.active + m.endlag;
}

/** A complete moveset. Every character supplies one. */
export type MoveSet = Record<MoveId, MoveSpec>;

export const hb = (
  start: number,
  end: number,
  x: number,
  y: number,
  r: number,
  damage: number,
  baseKnockback: number,
  knockbackGrowth: number,
  angle: number,
): HitboxSpec => ({ start, end, x, y, r, damage, baseKnockback, knockbackGrowth, angle });

export const KIRBY_MOVES: MoveSet = {
  jab: {
    id: "jab", name: "Jab", kind: "ground",
    startup: 3, active: 2, endlag: 8,
    hitboxes: [hb(3, 4, 0.65, 0.15, 0.35, 4, 10, 0.15, 30)],
  },
  ftilt: {
    id: "ftilt", name: "Forward Tilt", kind: "ground",
    startup: 5, active: 3, endlag: 11,
    hitboxes: [hb(5, 7, 0.85, 0.15, 0.42, 8, 18, 0.55, 20)],
  },
  utilt: {
    id: "utilt", name: "Up Tilt", kind: "ground",
    startup: 4, active: 4, endlag: 10,
    hitboxes: [hb(4, 7, 0.2, 0.85, 0.5, 6, 22, 0.7, 85)],
  },
  dtilt: {
    id: "dtilt", name: "Down Tilt", kind: "ground",
    startup: 4, active: 2, endlag: 8,
    hitboxes: [hb(4, 5, 0.75, -0.35, 0.38, 6, 14, 0.45, 15)],
  },
  dashAttack: {
    id: "dashAttack", name: "Dash Attack", kind: "ground",
    startup: 6, active: 4, endlag: 15,
    hitboxes: [hb(6, 9, 0.7, 0.15, 0.48, 9, 28, 0.5, 45)],
  },
  fsmash: {
    id: "fsmash", name: "Forward Smash", kind: "ground", chargeable: true,
    startup: 10, active: 3, endlag: 22,
    hitboxes: [hb(10, 12, 0.95, 0.15, 0.52, 16, 30, 1.0, 38)],
  },
  usmash: {
    id: "usmash", name: "Up Smash", kind: "ground", chargeable: true,
    startup: 9, active: 4, endlag: 24,
    hitboxes: [hb(9, 12, 0.1, 1.05, 0.58, 15, 32, 1.0, 90)],
  },
  dsmash: {
    id: "dsmash", name: "Down Smash", kind: "ground", chargeable: true,
    startup: 8, active: 3, endlag: 22,
    hitboxes: [
      hb(8, 10, 0.9, -0.3, 0.45, 14, 28, 0.9, 25),
      hb(8, 10, -0.9, -0.3, 0.45, 14, 28, 0.9, 155),
    ],
  },
  nair: {
    id: "nair", name: "Neutral Air", kind: "air",
    startup: 4, active: 8, endlag: 8,
    hitboxes: [hb(4, 11, 0.0, 0.15, 0.72, 9, 16, 0.5, 45)],
  },
  fair: {
    id: "fair", name: "Forward Air", kind: "air",
    startup: 6, active: 4, endlag: 12,
    hitboxes: [hb(6, 9, 0.75, 0.2, 0.46, 11, 20, 0.7, 40)],
  },
  bair: {
    id: "bair", name: "Back Air", kind: "air",
    startup: 5, active: 4, endlag: 12,
    hitboxes: [hb(5, 8, -0.75, 0.2, 0.46, 12, 22, 0.8, 140)],
  },
  uair: {
    id: "uair", name: "Up Air", kind: "air",
    startup: 4, active: 4, endlag: 10,
    hitboxes: [hb(4, 7, 0.0, 0.85, 0.5, 10, 20, 0.7, 88)],
  },
  dair: {
    id: "dair", name: "Down Air (drill)", kind: "air",
    startup: 6, active: 12, endlag: 14,
    hitboxes: [
      hb(6, 17, 0.0, -0.7, 0.46, 2, 6, 0.15, 270),
    ],
  },
  // ---- Specials: timing only; behaviour is in Fighter.ts ----
  neutralB: {
    id: "neutralB", name: "Inhale", kind: "special",
    startup: 6, active: 30, endlag: 12,
    hitboxes: [],
  },
  sideB: {
    id: "sideB", name: "Hammer", kind: "special",
    startup: 12, active: 4, endlag: 24,
    hitboxes: [hb(12, 15, 0.95, 0.35, 0.55, 18, 34, 1.1, 42)],
  },
  upB: {
    id: "upB", name: "Final Cutter", kind: "special",
    startup: 6, active: 6, endlag: 18,
    hitboxes: [hb(6, 11, 0.3, 0.75, 0.5, 8, 24, 0.6, 88)],
  },
  downB: {
    id: "downB", name: "Stone", kind: "special",
    startup: 6, active: 40, endlag: 14,
    hitboxes: [hb(8, 40, 0.0, -0.5, 0.6, 14, 26, 0.8, 80)],
  },
};

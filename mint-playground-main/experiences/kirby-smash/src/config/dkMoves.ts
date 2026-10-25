import { hb } from "./moves";
import type { MoveSet } from "./moves";

// Donkey Kong's moveset, adapted from his Melee kit to the five buttons this
// game has. Grabs, throws and the cargo-carry are dropped outright — there is
// no grab button — which also removes his signature throw game.
//
// Design intent: the heavyweight. He hits harder than either other character
// and reaches further with those long arms, and pays for it everywhere in
// startup and endlag. Where Samus zones, DK has to commit.
//
// Physics (weight, jumps, hurtbox) are still shared with the others; only reach
// and timing differ, so recovery and the CPU stay predictable.
//
// The four specials carry timing only; their motion and behaviour live in
// Fighter.ts. Giant Punch in particular keeps its wind-up charge between uses.

export const DK_MOVES: MoveSet = {
  jab: {
    id: "jab", name: "Jab", kind: "ground",
    startup: 4, active: 3, endlag: 10,
    // A cross punch followed by an uppercut.
    hitboxes: [
      hb(4, 5, 0.85, 0.2, 0.4, 4, 10, 0.15, 25),
      hb(7, 8, 0.9, 0.45, 0.44, 6, 16, 0.35, 55),
    ],
  },
  ftilt: {
    id: "ftilt", name: "Forward Tilt", kind: "ground",
    startup: 7, active: 3, endlag: 14,
    // Open-handed swat with real range.
    hitboxes: [hb(7, 9, 1.25, 0.25, 0.5, 11, 22, 0.6, 20)],
  },
  utilt: {
    id: "utilt", name: "Up Tilt", kind: "ground",
    startup: 6, active: 4, endlag: 13,
    // Overhead swipe; a juggling tool.
    hitboxes: [hb(6, 9, 0.2, 1.15, 0.6, 10, 20, 0.65, 85)],
  },
  dtilt: {
    id: "dtilt", name: "Down Tilt", kind: "ground",
    startup: 6, active: 3, endlag: 12,
    // Low swat across the ground.
    hitboxes: [hb(6, 8, 1.15, -0.4, 0.46, 9, 16, 0.45, 30)],
  },
  dashAttack: {
    id: "dashAttack", name: "Dash Attack", kind: "ground",
    startup: 8, active: 4, endlag: 20, // notoriously high ending lag
    hitboxes: [hb(8, 11, 1.0, 0.1, 0.52, 11, 26, 0.5, 45)],
  },
  fsmash: {
    id: "fsmash", name: "Clap Smash", kind: "ground", chargeable: true,
    startup: 14, active: 3, endlag: 28,
    // Both hands clapped together: his strongest horizontal kill move.
    hitboxes: [hb(14, 16, 1.35, 0.3, 0.62, 21, 36, 1.1, 30)],
  },
  usmash: {
    id: "usmash", name: "Overhead Clap", kind: "ground", chargeable: true,
    startup: 11, active: 4, endlag: 26,
    hitboxes: [hb(11, 14, 0.1, 1.3, 0.66, 18, 34, 1.05, 90)],
  },
  dsmash: {
    id: "dsmash", name: "Double Punch", kind: "ground", chargeable: true,
    startup: 10, active: 3, endlag: 26,
    // Back-handed punches down on both sides at once.
    hitboxes: [
      hb(10, 12, 1.2, -0.35, 0.52, 16, 30, 0.95, 15),
      hb(10, 12, -1.2, -0.35, 0.52, 16, 30, 0.95, 165),
    ],
  },
  nair: {
    id: "nair", name: "Spin Air", kind: "air",
    startup: 5, active: 9, endlag: 12,
    // Spins with both arms extended; lingers.
    hitboxes: [
      hb(5, 6, 0.6, 0.15, 0.78, 12, 20, 0.6, 45),
      hb(7, 13, 0.6, 0.15, 0.72, 7, 12, 0.3, 45),
    ],
  },
  fair: {
    id: "fair", name: "Axe Handle", kind: "air",
    startup: 9, active: 4, endlag: 18, // poor startup, as in Melee
    // Both fists swung down; a meteor.
    hitboxes: [hb(9, 12, 0.9, -0.55, 0.55, 16, 24, 0.7, 270)],
  },
  bair: {
    id: "bair", name: "Back Air", kind: "air",
    startup: 6, active: 5, endlag: 12,
    // Fast backward kick — his best aerial.
    hitboxes: [hb(6, 10, -1.1, 0.2, 0.52, 13, 24, 0.85, 145)],
  },
  uair: {
    id: "uair", name: "Up Headbutt", kind: "air",
    startup: 5, active: 4, endlag: 12,
    // Quick upward headbutt that chains into itself.
    hitboxes: [hb(5, 8, 0.1, 1.1, 0.56, 12, 22, 0.8, 88)],
  },
  dair: {
    id: "dair", name: "Stomp", kind: "air",
    startup: 8, active: 5, endlag: 18,
    hitboxes: [hb(8, 12, 0.2, -0.9, 0.54, 15, 24, 0.7, 270)],
  },
  // ---- Specials: timing only; behaviour is in Fighter.ts ----
  neutralB: {
    id: "neutralB", name: "Giant Punch", kind: "special",
    startup: 12, active: 4, endlag: 22,
    // Damage scales with the wind-up; the base hitbox is replaced at fire time.
    hitboxes: [hb(12, 15, 1.2, 0.35, 0.62, 10, 30, 0.9, 35)],
  },
  sideB: {
    id: "sideB", name: "Headbutt", kind: "special",
    startup: 14, active: 3, endlag: 26, // very slow and punishable, as in Melee
    hitboxes: [hb(14, 16, 1.0, 0.2, 0.5, 12, 26, 0.5, 270)],
  },
  upB: {
    id: "upB", name: "Spinning Kong", kind: "special",
    startup: 4, active: 22, endlag: 18,
    // Helicopter spin: lots of horizontal recovery, little height.
    hitboxes: [
      hb(4, 6, 0.0, 0.35, 0.8, 8, 18, 0.3, 75),
      hb(9, 11, 0.0, 0.35, 0.8, 4, 10, 0.1, 75),
      hb(14, 16, 0.0, 0.35, 0.8, 4, 10, 0.1, 75),
      hb(19, 22, 0.0, 0.35, 0.8, 7, 24, 0.7, 80),
    ],
  },
  downB: {
    id: "downB", name: "Hand Slap", kind: "special",
    startup: 8, active: 20, endlag: 20,
    // Pounds the ground; the quake hits low on both sides, grounded only.
    hitboxes: [
      hb(8, 10, 1.3, -0.5, 0.6, 12, 24, 0.6, 80),
      hb(8, 10, -1.3, -0.5, 0.6, 12, 24, 0.6, 100),
      hb(16, 18, 1.3, -0.5, 0.6, 12, 24, 0.6, 80),
      hb(16, 18, -1.3, -0.5, 0.6, 12, 24, 0.6, 100),
    ],
  },
};

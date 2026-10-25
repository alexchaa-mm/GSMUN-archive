import { hb } from "./moves";
import type { MoveSet } from "./moves";

// Samus's moveset, adapted from her Melee kit to the five buttons this game
// has. Grapple beam, throws and shield-dependent options are dropped outright
// because there is no button for them.
//
// Design intent against Kirby: she reaches noticeably further and hits harder
// per connect, and pays for it in startup and endlag. Physics (weight, jumps,
// hurtbox) are deliberately shared with Kirby — only reach and timing differ.
//
// The four specials carry timing only; their projectiles and motion live in
// Fighter.ts. Charge Shot in particular keeps charge between uses.

export const SAMUS_MOVES: MoveSet = {
  jab: {
    id: "jab", name: "Jab", kind: "ground",
    startup: 4, active: 3, endlag: 9,
    // Two quick punches rather than one poke.
    hitboxes: [
      hb(4, 4, 0.8, 0.15, 0.34, 3, 8, 0.1, 25),
      hb(6, 6, 0.92, 0.15, 0.36, 4, 12, 0.2, 30),
    ],
  },
  ftilt: {
    id: "ftilt", name: "Forward Tilt", kind: "ground",
    startup: 7, active: 3, endlag: 13,
    hitboxes: [hb(7, 9, 1.15, 0.15, 0.46, 10, 20, 0.6, 20)],
  },
  utilt: {
    id: "utilt", name: "Up Tilt", kind: "ground",
    startup: 6, active: 4, endlag: 13,
    // Overhead arcing kick: covers in front then above.
    hitboxes: [
      hb(6, 7, 0.7, 0.6, 0.44, 8, 18, 0.6, 70),
      hb(8, 9, 0.15, 1.05, 0.52, 9, 24, 0.75, 88),
    ],
  },
  dtilt: {
    id: "dtilt", name: "Down Tilt", kind: "ground",
    startup: 6, active: 3, endlag: 11,
    // Low kick that pops the opponent up into a follow-up.
    hitboxes: [hb(6, 8, 1.0, -0.35, 0.42, 8, 18, 0.5, 70)],
  },
  dashAttack: {
    id: "dashAttack", name: "Shoulder Ram", kind: "ground",
    startup: 8, active: 4, endlag: 18,
    hitboxes: [hb(8, 11, 0.9, 0.1, 0.5, 10, 26, 0.5, 45)],
  },
  fsmash: {
    id: "fsmash", name: "Cannon Smash", kind: "ground", chargeable: true,
    startup: 13, active: 3, endlag: 26,
    hitboxes: [hb(13, 15, 1.35, 0.2, 0.58, 18, 32, 1.0, 35)],
  },
  usmash: {
    id: "usmash", name: "Up Smash", kind: "ground", chargeable: true,
    startup: 11, active: 6, endlag: 27,
    // Multi-hit column of fire out of the cannon, ending on a launcher.
    hitboxes: [
      hb(11, 12, 0.1, 0.95, 0.5, 3, 6, 0.1, 88),
      hb(13, 14, 0.1, 1.1, 0.54, 3, 6, 0.1, 88),
      hb(15, 16, 0.1, 1.25, 0.6, 11, 30, 1.0, 90),
    ],
  },
  dsmash: {
    id: "dsmash", name: "Sweep Kick", kind: "ground", chargeable: true,
    startup: 9, active: 3, endlag: 24,
    // Low sweep both sides; launches near-horizontally, so it kills off the ledge.
    hitboxes: [
      hb(9, 11, 1.2, -0.35, 0.5, 15, 30, 0.95, 12),
      hb(9, 11, -1.2, -0.35, 0.5, 15, 30, 0.95, 168),
    ],
  },
  nair: {
    id: "nair", name: "Neutral Air", kind: "air",
    startup: 5, active: 10, endlag: 10,
    // Lingering "sex kick": strong on frame one, weak for the rest.
    hitboxes: [
      hb(5, 6, 0.55, 0.1, 0.7, 11, 20, 0.6, 45),
      hb(7, 14, 0.55, 0.1, 0.66, 6, 12, 0.3, 45),
    ],
  },
  fair: {
    id: "fair", name: "Spin Kick", kind: "air",
    startup: 7, active: 9, endlag: 14,
    // Multi-hit spinning kick that drags the opponent into a final knock-away.
    hitboxes: [
      hb(7, 8, 0.9, 0.2, 0.44, 2, 5, 0.05, 60),
      hb(9, 10, 0.95, 0.2, 0.44, 2, 5, 0.05, 60),
      hb(11, 12, 0.95, 0.2, 0.44, 2, 5, 0.05, 60),
      hb(13, 15, 1.05, 0.2, 0.48, 7, 26, 0.85, 40),
    ],
  },
  bair: {
    id: "bair", name: "Back Air", kind: "air",
    startup: 6, active: 4, endlag: 13,
    // Her best aerial: a hard backward kick that sends opponents offstage.
    hitboxes: [hb(6, 9, -1.05, 0.2, 0.5, 14, 26, 0.9, 145)],
  },
  uair: {
    id: "uair", name: "Up Air", kind: "air",
    startup: 5, active: 5, endlag: 12,
    hitboxes: [hb(5, 9, 0.1, 1.05, 0.55, 11, 22, 0.75, 88)],
  },
  dair: {
    id: "dair", name: "Down Air", kind: "air",
    startup: 8, active: 4, endlag: 18,
    // Meteor: straight down, punishing to eat off the ledge.
    hitboxes: [hb(8, 11, 0.25, -0.85, 0.5, 14, 24, 0.7, 270)],
  },
  // ---- Specials: timing only; behaviour is in Fighter.ts ----
  neutralB: {
    id: "neutralB", name: "Charge Shot", kind: "special",
    startup: 8, active: 4, endlag: 16,
    hitboxes: [], // the shot is a projectile
  },
  sideB: {
    id: "sideB", name: "Missile", kind: "special",
    startup: 10, active: 3, endlag: 20,
    hitboxes: [], // the missile is a projectile
  },
  upB: {
    id: "upB", name: "Screw Attack", kind: "special",
    startup: 4, active: 20, endlag: 16,
    // A rising corkscrew that hits repeatedly on the way up.
    hitboxes: [
      hb(4, 5, 0.0, 0.35, 0.62, 5, 14, 0.2, 85),
      hb(8, 9, 0.0, 0.35, 0.62, 3, 8, 0.1, 85),
      hb(12, 13, 0.0, 0.35, 0.62, 3, 8, 0.1, 85),
      hb(16, 18, 0.0, 0.35, 0.62, 5, 22, 0.7, 88),
    ],
  },
  downB: {
    id: "downB", name: "Bomb", kind: "special",
    startup: 6, active: 4, endlag: 14,
    hitboxes: [], // the bomb is a projectile that detonates on a fuse
  },
};

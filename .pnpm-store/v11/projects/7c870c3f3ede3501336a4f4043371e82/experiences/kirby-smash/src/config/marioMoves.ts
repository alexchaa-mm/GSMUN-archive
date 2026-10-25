import { hb } from "./moves";
import type { MoveSet } from "./moves";

// Mario's moveset, adapted from his Smash Ultimate kit to the five buttons this
// game has. Grab, throws, shield and the up-taunt are dropped — there is no
// button for them. Specials are the standard set: Fireball, Cape, Super Jump
// Punch, F.L.U.D.D.
//
// Design intent: a fast, honest all-rounder. Shorter reach than Samus and less
// raw power than DK, but quick startup, low endlag and strong combo tools (the
// classic up-tilt / up-air juggles and the meteor down-air). Physics (weight,
// jumps, hurtbox) are shared with the rest of the cast in Fighter.ts.
//
// The four specials carry timing only; their projectiles and motion live in
// Fighter.ts (fireFireball / doCape / startSuperJumpPunch / sprayFludd).

export const MARIO_MOVES: MoveSet = {
  jab: {
    id: "jab", name: "Jab", kind: "ground",
    startup: 2, active: 2, endlag: 6,
    // The quick one-two: a fast, low-commitment poke that starts combos.
    hitboxes: [
      hb(2, 3, 0.62, 0.15, 0.32, 2, 6, 0.1, 25),
      hb(4, 5, 0.72, 0.15, 0.34, 3, 10, 0.2, 35),
    ],
  },
  ftilt: {
    id: "ftilt", name: "Forward Tilt", kind: "ground",
    startup: 5, active: 3, endlag: 10,
    hitboxes: [hb(5, 7, 1.0, 0.2, 0.42, 8, 18, 0.5, 25)],
  },
  utilt: {
    id: "utilt", name: "Up Tilt", kind: "ground",
    startup: 4, active: 4, endlag: 9,
    // Arcing uppercut swing — the bread-and-butter juggle starter.
    hitboxes: [hb(4, 7, 0.2, 0.95, 0.5, 6, 14, 0.55, 95)],
  },
  dtilt: {
    id: "dtilt", name: "Down Tilt", kind: "ground",
    startup: 5, active: 2, endlag: 8,
    // Low kick that pops the opponent up into a follow-up.
    hitboxes: [hb(5, 6, 0.95, -0.35, 0.4, 6, 14, 0.4, 80)],
  },
  dashAttack: {
    id: "dashAttack", name: "Dash Attack", kind: "ground",
    startup: 6, active: 5, endlag: 14,
    hitboxes: [hb(6, 10, 0.85, 0.15, 0.48, 9, 22, 0.5, 45)],
  },
  fsmash: {
    id: "fsmash", name: "Fire Palm", kind: "ground", chargeable: true,
    startup: 12, active: 3, endlag: 24,
    // A burst of flame off the palm: his hardest single hit.
    hitboxes: [hb(12, 14, 1.2, 0.25, 0.56, 15, 30, 1.0, 35)],
  },
  usmash: {
    id: "usmash", name: "Headbutt", kind: "ground", chargeable: true,
    startup: 9, active: 4, endlag: 20,
    // An overhead arcing headbutt that launches straight up.
    hitboxes: [hb(9, 12, 0.15, 1.15, 0.56, 13, 28, 0.95, 88)],
  },
  dsmash: {
    id: "dsmash", name: "Split Kick", kind: "ground", chargeable: true,
    startup: 5, active: 3, endlag: 18,
    // Kicks front then back; sends near-horizontally, good off the ledge.
    hitboxes: [
      hb(5, 7, 1.15, -0.3, 0.48, 12, 28, 0.85, 15),
      hb(5, 7, -1.15, -0.3, 0.48, 10, 26, 0.85, 165),
    ],
  },
  nair: {
    id: "nair", name: "Neutral Air", kind: "air",
    startup: 3, active: 12, endlag: 8,
    // Lingering "sex kick": strong on the first frames, weak afterwards.
    hitboxes: [
      hb(3, 4, 0.5, 0.1, 0.66, 9, 18, 0.6, 45),
      hb(5, 14, 0.5, 0.1, 0.62, 5, 10, 0.3, 45),
    ],
  },
  fair: {
    id: "fair", name: "Meteor Fist", kind: "air",
    startup: 14, active: 3, endlag: 15,
    // The iconic overhead hammer-fist: spikes opponents straight down.
    hitboxes: [hb(14, 16, 0.7, 0.1, 0.5, 14, 26, 0.5, 280)],
  },
  bair: {
    id: "bair", name: "Back Air", kind: "air",
    startup: 6, active: 4, endlag: 12,
    hitboxes: [hb(6, 9, -1.0, 0.2, 0.5, 11, 24, 0.85, 145)],
  },
  uair: {
    id: "uair", name: "Up Air", kind: "air",
    startup: 4, active: 5, endlag: 10,
    // Flip kick overhead — his main air-to-air juggle finisher.
    hitboxes: [hb(4, 8, 0.1, 1.0, 0.52, 10, 20, 0.7, 88)],
  },
  dair: {
    id: "dair", name: "Down Air", kind: "air",
    startup: 5, active: 8, endlag: 14,
    // Twisting drill: several small hits as it screws downward.
    hitboxes: [
      hb(5, 6, 0.15, -0.7, 0.46, 2, 4, 0.05, 270),
      hb(8, 9, 0.15, -0.75, 0.46, 2, 4, 0.05, 270),
      hb(11, 12, 0.2, -0.8, 0.48, 5, 20, 0.6, 60),
    ],
  },
  // ---- Specials: timing only; behaviour is in Fighter.ts ----
  neutralB: {
    id: "neutralB", name: "Fireball", kind: "special",
    startup: 6, active: 2, endlag: 16,
    hitboxes: [], // the fireball is a bouncing projectile
  },
  sideB: {
    id: "sideB", name: "Cape", kind: "special",
    startup: 6, active: 4, endlag: 16,
    // The cape swipe does light damage; it also reflects projectiles (Fighter.ts).
    hitboxes: [hb(6, 9, 0.95, 0.2, 0.52, 7, 18, 0.35, 40)],
  },
  upB: {
    id: "upB", name: "Super Jump Punch", kind: "special",
    startup: 3, active: 14, endlag: 16,
    // A rising uppercut that scoops opponents up the way it recovers — many
    // small "coin" hits then a light launch, like the games.
    hitboxes: [
      hb(3, 4, 0.35, 0.5, 0.52, 5, 12, 0.2, 90),
      hb(6, 7, 0.35, 0.7, 0.5, 2, 6, 0.1, 90),
      hb(9, 10, 0.35, 0.9, 0.5, 2, 6, 0.1, 90),
      hb(13, 15, 0.35, 1.05, 0.5, 4, 18, 0.6, 88),
    ],
  },
  downB: {
    id: "downB", name: "F.L.U.D.D.", kind: "special",
    startup: 10, active: 4, endlag: 18,
    hitboxes: [], // a wide, near-harmless water blast that shoves (Fighter.ts)
  },
};

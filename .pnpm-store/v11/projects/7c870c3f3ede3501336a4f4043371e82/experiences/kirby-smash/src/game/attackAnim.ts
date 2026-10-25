import type { MoveId } from "../config/moves";

// Procedural attack poses for the limbless puffball: instead of a skeleton, each
// attack is a scripted whole-body motion (spins, flips, lunges, squash). `p` is
// the move's progress 0..1. Rotations are in radians about the screen plane
// (pivot = body center); lunge is a visual world-space offset (does not move the
// hitbox). Forward = +facing.

export interface Pose {
  sx: number;
  sy: number;
  bob: number;
  rotZ: number; // in-plane rotation (flips, seen from the side)
  spinY: number; // horizontal spin about the vertical axis (reads as 3D depth)
  lungeX: number;
  lungeY: number;
}

const TAU = Math.PI * 2;
const pulse = (p: number) => Math.sin(Math.PI * p); // 0 -> 1 -> 0
const out = (p: number) => p * (2 - p); // ease-out 0 -> 1
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function attackPose(id: MoveId, p: number, facing: number): Pose {
  const pose: Pose = { sx: 1, sy: 1, bob: 0, rotZ: 0, spinY: 0, lungeX: 0, lungeY: 0 };
  const s = pulse(p);
  switch (id) {
    case "jab": {
      // A single committed punch: brief cock-back, then a sharp forward thrust
      // that overshoots at full extension (the impact "pop"), then snaps back.
      const wind = 0.28; // fraction of the move spent winding up
      if (p < wind) {
        const w = out(p / wind); // 0 -> 1 ease-out into the cocked pose
        pose.lungeX = -facing * 0.18 * w; // draw back
        pose.rotZ = facing * 0.14 * w; // cock the body
        pose.sx = 1 - 0.08 * w; // compress ready to fire
        pose.sy = 1 + 0.05 * w;
      } else {
        const t = (p - wind) / (1 - wind); // 0 -> 1 through the thrust
        const ext = out(t); // fast forward extension
        const back = clamp01((t - 0.55) / 0.45); // recovery in the back half
        pose.lungeX = facing * (0.5 * ext - 0.5 * back * ext); // punch out, then home
        pose.sx = 1 + 0.26 * ext * (1 - back * 0.7); // stretch, biggest at impact
        pose.sy = 1 - 0.1 * ext * (1 - back * 0.7);
        pose.rotZ = -facing * 0.08 * ext * (1 - back); // slight follow-through, no spin
      }
      break;
    }
    case "ftilt": {
      pose.rotZ = -facing * 0.95 * s; // roundhouse swing
      pose.lungeX = facing * 0.32 * s;
      pose.sx = 1 + 0.12 * s;
      break;
    }
    case "utilt": {
      pose.rotZ = facing * 0.7 * s; // arc up and over
      pose.sy = 1 + 0.16 * s;
      pose.bob = 0.12 * s;
      break;
    }
    case "dtilt": {
      pose.sy = 1 - 0.34 * s;
      pose.sx = 1 + 0.22 * s;
      pose.bob = -0.15 * s;
      pose.lungeX = facing * 0.26 * s;
      break;
    }
    case "dashAttack": {
      pose.rotZ = -facing * TAU * out(p); // forward roll
      pose.lungeX = facing * 0.5 * s;
      pose.sy = 0.94;
      break;
    }
    case "fsmash": {
      if (p < 0.4) {
        const a = p / 0.4;
        pose.lungeX = -facing * 0.2 * a; // wind back
        pose.rotZ = facing * 0.22 * a;
      } else {
        const a = out((p - 0.4) / 0.6);
        pose.lungeX = facing * 0.55 * a; // thrust
        pose.rotZ = -facing * 0.18 * a;
      }
      pose.sx = 1 + 0.1 * s;
      break;
    }
    case "usmash": {
      pose.rotZ = facing * TAU * out(p); // backflip
      pose.bob = 0.16 * s;
      break;
    }
    case "dsmash": {
      pose.spinY = -facing * TAU * out(p); // low horizontal split spin (3D)
      const low = clamp01(p * 3);
      pose.sy = 1 - 0.32 * low;
      pose.sx = 1 + 0.24 * low;
      pose.bob = -0.12 * low;
      break;
    }
    case "nair": {
      pose.spinY = -facing * TAU * out(p); // horizontal spin (3D)
      pose.rotZ = facing * 0.3 * s;
      break;
    }
    case "fair": {
      pose.spinY = -facing * TAU * 2 * out(p); // forward drill (2 horizontal spins)
      pose.lungeX = facing * 0.2 * s;
      break;
    }
    case "bair": {
      pose.lungeX = -facing * 0.44 * s; // back dropkick
      pose.rotZ = facing * 0.32 * s;
      break;
    }
    case "uair": {
      pose.rotZ = facing * TAU * out(p); // up flip
      pose.bob = 0.14 * s;
      break;
    }
    case "dair": {
      pose.rotZ = -facing * TAU * 3 * out(p); // corkscrew drill
      const st = clamp01(p * 3);
      pose.sy = 1 + 0.22 * st;
      pose.bob = -0.16 * st;
      break;
    }
    case "neutralB": {
      const w = clamp01(p * 3) * (1 - clamp01((p - 0.85) / 0.15));
      pose.sx = 1 + 0.32 * w; // gape wide to inhale
      pose.sy = 1 - 0.12 * w;
      break;
    }
    case "sideB": {
      // Body follows the hammer: wind up back, swing down-forward.
      if (p < 0.45) pose.rotZ = facing * 0.35 * (p / 0.45);
      else if (p < 0.68) pose.rotZ = facing * (0.35 - 1.0 * out((p - 0.45) / 0.23));
      else pose.rotZ = facing * (-0.65 + 0.65 * ((p - 0.68) / 0.32));
      pose.sx = 1 + 0.05;
      break;
    }
    case "upB": {
      if (p < 0.5) {
        const a = p / 0.5;
        pose.sy = 1 + 0.28 * a; // stretch up on the rise
        pose.bob = 0.12 * a;
        pose.rotZ = -facing * 0.18 * a;
      } else {
        pose.sy = 1.28 - 0.28 * ((p - 0.5) / 0.5);
      }
      break;
    }
    case "downB": {
      pose.sx = 1.1;
      pose.sy = 0.9;
      break;
    }
  }
  return pose;
}

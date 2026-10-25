import { stage } from "../config/stage";
import type { PlatformDef } from "../config/stage";

const EPS = 0.02;

export interface Landing {
  platform: PlatformDef;
  topY: number;
}

/**
 * If the fighter's feet crossed a platform top while descending this step,
 * return the highest such platform. Soft platforms are skipped when the fighter
 * is dropping through them.
 */
export function findLanding(
  prevFeetY: number,
  feetY: number,
  x: number,
  softAllowed: boolean,
): Landing | null {
  let best: Landing | null = null;
  for (const p of stage().platforms) {
    if (!p.solid && !softAllowed) continue;
    if (x < p.minX || x > p.maxX) continue;
    if (prevFeetY >= p.topY - EPS && feetY <= p.topY + EPS) {
      if (!best || p.topY > best.topY) best = { platform: p, topY: p.topY };
    }
  }
  return best;
}

/**
 * Solid platforms block the fighter from rising up through them from below. If
 * the fighter's head crossed a solid platform's top surface while ascending,
 * return that surface height (feet should clamp to top - height). Returns the
 * lowest such ceiling.
 */
export function findSolidCeiling(
  prevFeetY: number,
  feetY: number,
  x: number,
  height: number,
): number | null {
  let ceil: number | null = null;
  for (const p of stage().platforms) {
    if (!p.solid) continue;
    if (x < p.minX || x > p.maxX) continue;
    const headPrev = prevFeetY + height;
    const headNew = feetY + height;
    if (headPrev <= p.topY + EPS && headNew > p.topY + EPS) {
      if (ceil === null || p.topY < ceil) ceil = p.topY;
    }
  }
  return ceil;
}

/** Is the fighter still standing on this platform (within its x span)? */
export function overPlatform(p: PlatformDef, x: number): boolean {
  return x >= p.minX && x <= p.maxX;
}

/** Highest platform top at or below the given feet height, for blob shadows. */
export function groundBelow(x: number, feetY: number): number | null {
  let top: number | null = null;
  for (const p of stage().platforms) {
    if (x < p.minX || x > p.maxX) continue;
    if (p.topY <= feetY + 0.05 && (top === null || p.topY > top)) top = p.topY;
  }
  return top;
}

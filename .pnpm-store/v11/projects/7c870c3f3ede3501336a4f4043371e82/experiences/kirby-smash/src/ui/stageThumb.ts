import type { StageDef } from "../config/stage";

// Menu thumbnails are drawn from the stage's own collision boxes rather than
// captured as images, so a card can never drift out of sync with the layout it
// advertises — retune a platform in config/stages.ts and the preview follows.

const W = 160;
const H = 90;
const DECK_Y = 64; // where the main platform's top surface sits in the thumb
const MARGIN = 74; // half-width available to the widest platform, in px

/** Inline SVG preview of a stage's platform layout over its backdrop palette. */
export function stageThumb(def: StageDef): string {
  const reach = Math.max(...def.platforms.flatMap((p) => [Math.abs(p.minX), Math.abs(p.maxX)]));
  const scale = MARGIN / (reach * 1.28);
  const toX = (wx: number) => W / 2 + wx * scale;
  const toY = (wy: number) => DECK_Y - (wy - def.main.topY) * scale;

  const id = `sky-${def.id}`;
  const bars = def.platforms
    .map((p) => {
      const x = toX(p.minX);
      const w = Math.max(3, (p.maxX - p.minX) * scale);
      const h = p.solid ? 6.5 : 3.5;
      const y = toY(p.topY);
      return `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${h}" rx="${h / 2}"
        fill="${def.theme.deck}" stroke="${def.theme.accent}" stroke-width="0.9" />`;
    })
    .join("");

  // A band of the backdrop's signature colour along the floor. On stages with
  // water this is the real waterline, so the card shows how far the drop is.
  const floorY = Math.min(H - 4, def.water ? toY(def.water.surfaceY) : toY(def.main.topY) + 18);

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${def.theme.skyTop}" />
        <stop offset="100%" stop-color="${def.theme.skyBottom}" />
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#${id})" />
    <rect x="0" y="${r(floorY)}" width="${W}" height="${r(H - floorY)}"
      fill="${def.theme.accent}" opacity="${def.water ? 0.85 : 0.35}" />
    ${bars}
  </svg>`;
}

function r(n: number): string {
  return n.toFixed(1);
}

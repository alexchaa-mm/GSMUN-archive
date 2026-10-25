import { audio } from "../audio/audio";
import type { Effects } from "./combat";
import type { Fighter } from "./Fighter";

// Resolves attacks between fighters each frame: active melee hitboxes vs the
// opponent's hurtbox, plus projectiles vs opponents. Applies knockback and
// marks a move so it can't hit the same target twice.

function overlap(ax: number, ay: number, ar: number, bx: number, by: number, br: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy <= (ar + br) * (ar + br);
}

export function resolveCombat(fighters: Fighter[], effects: Effects) {
  for (const attacker of fighters) {
    const hits = attacker.activeHitboxes();
    if (hits.length === 0) continue;
    for (const target of fighters) {
      if (target === attacker || attacker.hasHit(target.playerId)) continue;
      const hb = target.getHurtbox();
      for (const h of hits) {
        if (overlap(h.x, h.y, h.r, hb.x, hb.y, hb.r)) {
          if (target.applyHit(h.info, h.facing, effects)) {
            attacker.markHit(target.playerId);
            audio.sfx("hit");
          }
          break;
        }
      }
    }
  }

  for (const p of effects.projectiles) {
    if (p.dead || p.damage <= 0) continue;
    for (const target of fighters) {
      if (target.playerId === p.owner) continue;
      const hb = target.getHurtbox();
      if (overlap(p.x, p.y, p.radius, hb.x, hb.y, hb.r)) {
        const facing = p.vx >= 0 ? 1 : -1;
        if (
          target.applyHit(
            {
              damage: p.damage,
              baseKnockback: p.baseKnockback,
              knockbackGrowth: p.knockbackGrowth,
              angle: p.angle,
            },
            facing,
            effects,
          )
        ) {
          p.dead = true;
          if (p.explosive) {
            effects.explosion(p.x, p.y, p.explosionRadius);
            audio.sfx("explode");
          }
        }
        break;
      }
    }
  }
}

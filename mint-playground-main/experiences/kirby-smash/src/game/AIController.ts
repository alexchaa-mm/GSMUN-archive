import type { Action, Controller } from "../engine/Input";
import { stage } from "../config/stage";
import type { Fighter } from "./Fighter";

export type Difficulty = "easy" | "medium" | "hard";

interface Params {
  reactionMs: number; // how often the CPU re-decides
  attackChance: number; // chance to attack when in range
  smashChance: number; // chance to use a smash as a finisher
  approachGap: number; // preferred spacing before attacking
  recoverJumps: number; // how eagerly it jumps back when off-stage
}

const PRESETS: Record<Difficulty, Params> = {
  easy: { reactionMs: 300, attackChance: 0.5, smashChance: 0.1, approachGap: 1.3, recoverJumps: 0.5 },
  medium: { reactionMs: 140, attackChance: 0.72, smashChance: 0.28, approachGap: 1.1, recoverJumps: 0.8 },
  hard: { reactionMs: 65, attackChance: 0.92, smashChance: 0.5, approachGap: 0.95, recoverJumps: 1 },
};

// Drives a Fighter by setting the same inputs a keyboard would. Re-decides every
// `reactionMs`; movement is held between decisions, attacks fire as edges.
export class AIController implements Controller {
  private held = new Set<Action>();
  private edges = new Set<Action>();
  private smashDir: Action | null = null;
  dashDir = 0;

  private p: Params;
  private self!: Fighter;
  private opp!: Fighter;
  private timer = 0;
  private usedCutter = false;

  constructor(difficulty: Difficulty) {
    this.p = PRESETS[difficulty];
  }

  setFighters(self: Fighter, opp: Fighter) {
    this.self = self;
    this.opp = opp;
  }

  update(dtMs: number) {
    this.edges.clear();
    this.smashDir = null;
    this.dashDir = 0;
    this.timer -= dtMs;
    if (this.timer <= 0) {
      this.timer = this.p.reactionMs;
      this.decide();
    }
  }

  private decide() {
    const self = this.self;
    const opp = this.opp;
    if (!self || !opp || self.state === "dead") {
      this.held.clear();
      return;
    }
    this.held.clear();

    const dx = opp.x - self.x;
    const adx = Math.abs(dx);
    const dy = opp.y - self.y;
    const towardOpp: Action = dx > 0 ? "right" : "left";
    const towardCenter: Action = self.x > 0 ? "left" : "right";

    const main = stage().main;

    // ---- Swimming: sinking is the default, so keep stroking ----
    // Every stroke is a discrete press, and near the surface it becomes the
    // leap that gets back out. Weaker CPUs stroke less reliably and can drown.
    if (self.state === "swim") {
      this.usedCutter = false; // the up-B is available again once back in the air
      this.held.add(towardCenter);
      if (Math.random() < Math.max(0.7, this.p.recoverJumps)) this.edges.add("up");
      return;
    }

    const selfOffStage = self.y < -0.5 || self.x < main.minX - 0.5 || self.x > main.maxX + 0.5;

    // ---- Recovery: get back to the stage ----
    if (selfOffStage && self.state !== "hitstun") {
      this.held.add(towardCenter);
      if (self.y < 0.5 && Math.random() < this.p.recoverJumps) this.edges.add("up");
      if (self.y < -2.5 && !this.usedCutter) {
        this.held.add("up"); // held (not a fresh jump) so Special reads as up-B
        this.edges.add("special");
        this.usedCutter = true;
      }
      return;
    }
    if (!selfOffStage) this.usedCutter = false;

    // Don't chase the opponent off the stage into a self-destruct.
    const oppOffStage = opp.x < main.minX || opp.x > main.maxX || opp.y < -0.5;
    const nearOwnLedge = self.x < main.minX + 1.5 || self.x > main.maxX - 1.5;

    const inRange = adx < this.p.approachGap + 0.4 && Math.abs(dy) < 1.5;

    // ---- Approach ----
    if (!inRange) {
      const wouldLeaveStage = oppOffStage && nearOwnLedge && Math.sign(dx) === Math.sign(self.x);
      if (!wouldLeaveStage) {
        this.held.add(towardOpp);
        if (adx > 4 && Math.random() < 0.4) this.dashDir = dx > 0 ? 1 : -1;
        if (dy > 1.4 && Math.random() < 0.5) this.edges.add("up"); // hop up toward them
      }
      return;
    }

    // ---- Attack ----
    if (Math.random() > this.p.attackChance) return; // sometimes pause / reposition

    if (dy > 0.9) {
      // Opponent above: hop and swing up.
      this.edges.add("up");
      this.held.add("up");
      this.edges.add("attack");
      return;
    }
    if (opp.damage > 85 && Math.random() < this.p.smashChance) {
      this.held.add(towardOpp); // forward smash finisher
      this.smashDir = towardOpp;
      this.edges.add("attack");
      return;
    }
    if (Math.random() < 0.15) {
      this.held.add(towardOpp); // Hammer
      this.edges.add("special");
      return;
    }
    if (Math.random() < 0.5) this.held.add(towardOpp); // ftilt vs jab
    this.edges.add("attack");
  }

  isHeld(a: Action) {
    return this.held.has(a);
  }
  pressed(a: Action) {
    return this.edges.has(a);
  }
  tappedForSmash(a: Action) {
    return this.smashDir === a;
  }
  get moveX() {
    return (this.held.has("right") ? 1 : 0) - (this.held.has("left") ? 1 : 0);
  }
  get moveY() {
    return (this.held.has("up") ? 1 : 0) - (this.held.has("down") ? 1 : 0);
  }
}

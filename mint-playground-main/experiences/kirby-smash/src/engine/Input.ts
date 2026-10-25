import type { KeyMap } from "../config/controls";

// Per-player keyboard input. Up doubles as jump (tap-jump). Analog "fast tap vs
// hold" is reproduced as double-tap (dash) vs hold (walk); a fresh directional
// tap + attack reads as a smash.

export type Action = "left" | "right" | "up" | "down" | "attack" | "special" | "jump";

// A fighter consumes any Controller — keyboard or AI — through this interface.
export interface Controller {
  update(dtMs: number): void;
  isHeld(a: Action): boolean;
  pressed(a: Action): boolean;
  tappedForSmash(a: Action): boolean;
  readonly moveX: number;
  readonly moveY: number;
  readonly dashDir: number;
}

const DOUBLE_TAP_MS = 240;
const SMASH_TAP_MS = 150;
const DIRECTIONS: Action[] = ["left", "right", "up", "down"];

export class InputController implements Controller {
  private codeToAction = new Map<string, Action>();
  private held = new Set<Action>();
  private pressQueue: Action[] = [];
  private lastTapAt: Partial<Record<Action, number>> = {};
  private clock = 0;

  private edges = new Set<Action>();
  /** -1 = dash left, 1 = dash right, 0 = none (fresh this frame). */
  dashDir = 0;

  constructor(keymap: KeyMap, target: Window | HTMLElement = window) {
    (Object.entries(keymap) as [Action, string][]).forEach(([action, code]) => {
      this.codeToAction.set(code, action);
    });
    target.addEventListener("keydown", (e) => this.onKey(e as KeyboardEvent, true));
    target.addEventListener("keyup", (e) => this.onKey(e as KeyboardEvent, false));
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    const action = this.codeToAction.get(e.code);
    if (!action) return;
    e.preventDefault();
    if (down) {
      if (e.repeat) return;
      this.held.add(action);
      this.pressQueue.push(action);
    } else {
      this.held.delete(action);
    }
  }

  update(dtMs: number) {
    this.clock += dtMs;
    this.edges.clear();
    this.dashDir = 0;

    for (const action of this.pressQueue) {
      this.edges.add(action);
      if (action === "left" || action === "right") {
        const prev = this.lastTapAt[action] ?? -Infinity;
        if (this.clock - prev <= DOUBLE_TAP_MS) {
          this.dashDir = action === "left" ? -1 : 1;
        }
      }
      if (DIRECTIONS.includes(action)) this.lastTapAt[action] = this.clock;
    }
    this.pressQueue.length = 0;
  }

  isHeld(a: Action) {
    return this.held.has(a);
  }
  pressed(a: Action) {
    return this.edges.has(a);
  }
  tappedForSmash(a: Action) {
    const t = this.lastTapAt[a];
    return t !== undefined && this.clock - t <= SMASH_TAP_MS;
  }
  get moveX() {
    return (this.isHeld("right") ? 1 : 0) - (this.isHeld("left") ? 1 : 0);
  }
  get moveY() {
    return (this.isHeld("up") ? 1 : 0) - (this.isHeld("down") ? 1 : 0);
  }
}

// Per-player key bindings. Up doubles as jump (tap-jump); Start/restart is a
// shared key handled separately. Keep these in sync with the start-screen text.

export interface KeyMap {
  left: string;
  right: string;
  up: string;
  down: string;
  attack: string;
  special: string;
  jump: string; // dedicated jump, in addition to tap-jump on Up
}

export const P1_KEYS: KeyMap = {
  left: "KeyA",
  right: "KeyD",
  up: "KeyW",
  down: "KeyS",
  attack: "KeyF",
  special: "KeyG",
  jump: "Space",
};

export const P2_KEYS: KeyMap = {
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  attack: "Period",
  special: "Slash",
  jump: "ShiftRight",
};

export const START_KEY = "Enter";

// Human-readable, for the start screen / HUD.
export interface ControlText {
  move: string;
  jump: string;
  crouch: string;
  attack: string;
  special: string;
}

export const P1_TEXT: ControlText = {
  move: "A / D",
  jump: "W / Space",
  crouch: "S",
  attack: "F",
  special: "G",
};

export const P2_TEXT: ControlText = {
  move: "← / →",
  jump: "↑ / R-Shift",
  crouch: "↓",
  attack: ".",
  special: "/",
};

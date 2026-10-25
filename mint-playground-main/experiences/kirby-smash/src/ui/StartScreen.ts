import { CHARACTER_LIST, DEFAULT_CHARACTER_ID } from "../config/characters";
import type { CharacterId } from "../config/characters";
import { P1_TEXT, P2_TEXT } from "../config/controls";
import type { ControlText } from "../config/controls";
import { STAGE_LIST } from "../config/stage";
import type { StageDef, StageId } from "../config/stage";
import type { Difficulty } from "../game/AIController";
import dkThumb from "../ui-thumbs/characters/dk.webp";
import kirbyThumb from "../ui-thumbs/characters/kirby.webp";
import marioThumb from "../ui-thumbs/characters/mario.webp";
import samusThumb from "../ui-thumbs/characters/samus.webp";
import battlefieldThumb from "../ui-thumbs/stages/battlefield.webp";
import norfairThumb from "../ui-thumbs/stages/norfair.webp";
import summitThumb from "../ui-thumbs/stages/summit.webp";

export type Mode = "cpu" | "2p";

/** Which side a character pick belongs to. */
export type Slot = "p1char" | "p2char";

const CHARACTER_THUMBS: Record<CharacterId, string> = {
  kirby: kirbyThumb,
  samus: samusThumb,
  dk: dkThumb,
  mario: marioThumb,
};

const STAGE_THUMBS: Record<StageId, string> = {
  battlefield: battlefieldThumb,
  norfair: norfairThumb,
  summit: summitThumb,
};

// Title screen: pick mode (P1 vs CPU / 2 players), a difficulty for CPU, and
// the map; shows both control schemes; Enter starts.
export class StartScreen {
  private el: HTMLElement;
  private mode: Mode = "cpu";
  private difficulty: Difficulty = "medium";
  private stageId: StageId = STAGE_LIST[0].id;
  private chars: Record<Slot, CharacterId> = {
    p1char: DEFAULT_CHARACTER_ID,
    p2char: DEFAULT_CHARACTER_ID,
  };
  private diffRow: HTMLElement;
  private p2card: HTMLElement;
  private p2charLabel: HTMLElement;
  private stageChanged: ((id: StageId) => void) | null = null;
  private charChanged: ((slot: Slot, id: CharacterId) => void) | null = null;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "start-screen show";
    this.el.innerHTML = `
      <div class="start-inner">
        <h1 class="start-title">KIRBY <span>SMASH</span></h1>
        <p class="start-sub">Knock your opponent off the stage!</p>

        <div class="opt-row" data-group="mode">
          <button class="opt" data-mode="cpu">P1 vs CPU</button>
          <button class="opt" data-mode="2p">2 Players</button>
        </div>
        <div class="opt-row diff" data-group="diff">
          <span class="opt-label">CPU</span>
          <button class="opt" data-diff="easy">Easy</button>
          <button class="opt" data-diff="medium">Medium</button>
          <button class="opt" data-diff="hard">Hard</button>
        </div>

        <div class="opt-row" data-group="p1char">
          <span class="opt-label pick-label">P1</span>
          ${CHARACTER_LIST.map((c) => charButton("p1char", c.id, c.name, c.accent)).join("")}
        </div>
        <div class="opt-row" data-group="p2char">
          <span class="opt-label pick-label" id="p2-char-label">CPU</span>
          ${CHARACTER_LIST.map((c) => charButton("p2char", c.id, c.name, c.accent)).join("")}
        </div>

        <div class="stage-picker">
          <span class="opt-label">STAGE</span>
          <div class="stage-cards">${STAGE_LIST.map(stageCard).join("")}</div>
        </div>

        <div class="start-controls">
          ${controlCard(1, "P1", "#ff7bbf", P1_TEXT)}
          ${controlCard(2, "P2", "#66b3ff", P2_TEXT)}
        </div>
        <button class="opt start-btn">START</button>
        <div class="start-prompt">or press <b>Enter</b></div>
      </div>`;
    document.body.appendChild(this.el);

    this.diffRow = this.el.querySelector('[data-group="diff"]')!;
    this.p2card = this.el.querySelector(".control-card.p2")!;
    this.p2charLabel = this.el.querySelector("#p2-char-label")!;

    this.el.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) =>
      b.addEventListener("click", () => this.setMode(b.dataset.mode as Mode)),
    );
    this.el.querySelectorAll<HTMLButtonElement>("[data-diff]").forEach((b) =>
      b.addEventListener("click", () => this.setDifficulty(b.dataset.diff as Difficulty)),
    );
    this.el.querySelectorAll<HTMLButtonElement>("[data-stage]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.stage as StageId;
        if (id === this.stageId) return;
        this.setStageId(id);
        this.stageChanged?.(id); // live-preview the map behind the menu
      }),
    );
    for (const slot of ["p1char", "p2char"] as Slot[]) {
      this.el.querySelectorAll<HTMLButtonElement>(`[data-${slot}]`).forEach((b) =>
        b.addEventListener("click", () => {
          const id = b.dataset[slot] as CharacterId;
          if (id === this.chars[slot]) return;
          this.chars[slot] = id;
          this.markSelected(slot, id);
          this.charChanged?.(slot, id);
        }),
      );
    }

    this.setMode("cpu");
    this.setDifficulty("medium");
    this.setStageId(this.stageId);
    this.markSelected("p1char", this.chars.p1char);
    this.markSelected("p2char", this.chars.p2char);
  }

  private setMode(mode: Mode) {
    this.mode = mode;
    this.markSelected("mode", mode);
    this.diffRow.style.display = mode === "cpu" ? "flex" : "none";
    const opponent = mode === "cpu" ? "CPU" : "P2";
    this.p2card.querySelector(".cc-title")!.textContent = opponent;
    this.p2charLabel.textContent = opponent;
  }
  private setDifficulty(d: Difficulty) {
    this.difficulty = d;
    this.markSelected("diff", d);
  }
  private setStageId(id: StageId) {
    this.stageId = id;
    this.markSelected("stage", id);
  }
  private markSelected(group: "mode" | "diff" | "stage" | Slot, value: string) {
    this.el
      .querySelectorAll<HTMLButtonElement>(`[data-${group}]`)
      .forEach((b) => b.classList.toggle("selected", b.dataset[group] === value));
  }

  onStart(cb: () => void) {
    this.el.querySelector<HTMLButtonElement>(".start-btn")!.addEventListener("click", cb);
  }

  /** Fired when the player picks a different map (not on the initial value). */
  onStageChange(cb: (id: StageId) => void) {
    this.stageChanged = cb;
  }

  /** Fired when either side picks a different character. */
  onCharacterChange(cb: (slot: Slot, id: CharacterId) => void) {
    this.charChanged = cb;
  }

  getCharacter(slot: Slot): CharacterId {
    return this.chars[slot];
  }

  getMode() {
    return this.mode;
  }
  getDifficulty() {
    return this.difficulty;
  }
  getStageId() {
    return this.stageId;
  }
  show() {
    this.el.classList.add("show");
  }
  hide() {
    this.el.classList.remove("show");
  }
}

function charButton(slot: Slot, id: CharacterId, name: string, accent: string): string {
  return `<button class="opt char-opt" data-${slot}="${id}" style="--ca:${accent}">
      <img class="char-thumb" src="${CHARACTER_THUMBS[id]}" alt="" draggable="false" />
      <span class="char-name">${name}</span>
    </button>`;
}

function stageCard(def: StageDef): string {
  return `
    <button class="stage-card" data-stage="${def.id}">
      <span class="sc-thumb"><img src="${STAGE_THUMBS[def.id]}" alt="" draggable="false" /></span>
      <span class="sc-name">${def.name}</span>
      <span class="sc-blurb">${def.blurb}</span>
    </button>`;
}

function controlCard(player: number, label: string, color: string, t: ControlText): string {
  const row = (k: string, v: string) => `<div class="ctrl-row"><span>${k}</span><kbd>${v}</kbd></div>`;
  return `
    <div class="control-card p${player}" style="--pc:${color}">
      <div class="cc-title" style="color:${color}">${label}</div>
      ${row("Move", t.move)}
      ${row("Jump", t.jump)}
      ${row("Crouch / Fast-fall", t.crouch)}
      ${row("Attack", t.attack)}
      ${row("Special", t.special)}
    </div>`;
}

// Two-player HUD: a damage% + stock panel for each player, a win banner, and
// an in-match Menu button that pauses behind a confirmation — quitting mid-match
// throws away a match in progress, so it should never be one stray click.

const COLORS: Record<number, string> = { 1: "#ff7bbf", 2: "#66b3ff" };

export class Hud {
  private percentEl: Record<number, HTMLElement> = {};
  private stocksEl: Record<number, HTMLElement> = {};
  private result: HTMLElement;
  private menuBtn: HTMLElement;
  private confirm: HTMLElement;
  private quitCb: (() => void) | null = null;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      ${panel(1, "P1")}
      ${panel(2, "P2")}
      <button class="hud-menu-btn" id="hud-menu-btn" title="Pause (Esc)">MENU</button>
      <div class="hud-confirm" id="hud-confirm">
        <div class="confirm-card">
          <h2>PAUSED</h2>
          <p>Returning to the menu will end this match.</p>
          <div class="confirm-actions">
            <button class="opt confirm-no">Keep Playing</button>
            <button class="opt confirm-yes">Return to Menu</button>
          </div>
          <div class="confirm-hint">Esc to resume</div>
        </div>
      </div>
      <div class="hud-result" id="hud-result">
        <h1></h1>
        <button class="opt menu-btn">Return to Menu</button>
        <p>or press Enter</p>
      </div>`;
    for (const p of [1, 2]) {
      this.percentEl[p] = root.querySelector(`#hud-percent-${p}`)!;
      this.stocksEl[p] = root.querySelector(`#hud-stocks-${p}`)!;
    }
    this.result = root.querySelector("#hud-result")!;
    this.menuBtn = root.querySelector("#hud-menu-btn")!;
    this.confirm = root.querySelector("#hud-confirm")!;

    this.menuBtn.addEventListener("click", () => this.openConfirm());
    this.confirm
      .querySelector<HTMLButtonElement>(".confirm-no")!
      .addEventListener("click", () => this.closeConfirm());
    this.confirm
      .querySelector<HTMLButtonElement>(".confirm-yes")!
      .addEventListener("click", () => this.quitCb?.());
  }

  /** True while the pause dialog is up — the game loop freezes on this. */
  get paused() {
    return this.confirm.classList.contains("show");
  }

  /** Show the in-match Menu button only while a match is actually running. */
  setPlaying(playing: boolean) {
    this.menuBtn.classList.toggle("show", playing);
    if (!playing) this.closeConfirm();
  }

  openConfirm() {
    this.confirm.classList.add("show");
    // Move focus off the Menu button and onto the safe choice, so Space/Enter
    // resumes play rather than re-triggering whatever was last clicked.
    this.confirm.querySelector<HTMLButtonElement>(".confirm-no")!.focus();
  }
  closeConfirm() {
    this.confirm.classList.remove("show");
    const focused = document.activeElement as HTMLElement | null;
    if (focused && this.confirm.contains(focused)) focused.blur();
  }
  toggleConfirm() {
    if (this.paused) this.closeConfirm();
    else this.openConfirm();
  }

  /** Fired when the player confirms quitting a match in progress. */
  onQuit(cb: () => void) {
    this.quitCb = cb;
  }

  setPercent(player: number, percent: number) {
    const p = Math.round(percent);
    this.percentEl[player].innerHTML = `${p}<span class="pct">%</span>`;
    const t = Math.min(1, percent / 150);
    this.percentEl[player].style.color =
      percent < 1 ? "#ffffff" : `hsl(${55 - 55 * t}, 95%, ${100 - 45 * t}%)`;
  }

  setStocks(player: number, current: number, max: number) {
    let html = "";
    for (let i = 0; i < max; i++) {
      html += `<div class="hud-stock${i < current ? "" : " lost"}" style="background:${
        i < current ? COLORS[player] : "rgba(255,255,255,0.12)"
      }"></div>`;
    }
    this.stocksEl[player].innerHTML = html;
  }

  onMenu(cb: () => void) {
    this.result.querySelector<HTMLButtonElement>(".menu-btn")!.addEventListener("click", cb);
  }

  showResult(winner: number) {
    const h1 = this.result.querySelector("h1")!;
    if (winner === 0) {
      this.result.classList.remove("show");
      return;
    }
    h1.textContent = `P${winner} WINS!`;
    h1.style.color = COLORS[winner];
    this.result.classList.add("show");
  }
}

function panel(player: number, label: string): string {
  return `
    <div class="hud-fighter p${player}">
      <div class="hud-name" style="color:${COLORS[player]}">${label}</div>
      <div class="hud-percent" id="hud-percent-${player}">0<span class="pct">%</span></div>
      <div class="hud-stocks" id="hud-stocks-${player}"></div>
    </div>`;
}

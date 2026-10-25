import "./style.css";
import { audio } from "./audio/audio";
import { P1_KEYS, P2_KEYS, START_KEY } from "./config/controls";
import { CHARACTERS } from "./config/characters";
import type { CharacterId } from "./config/characters";
import { setStage, stage } from "./config/stage";
import type { StageId } from "./config/stage";
import { InputController } from "./engine/Input";
import type { Controller } from "./engine/Input";
import { AIController } from "./game/AIController";
import { resolveCombat } from "./game/CombatSystem";
import { Effects } from "./game/combat";
import { Fighter } from "./game/Fighter";
import { Match } from "./game/Match";
import { Stage } from "./game/Stage";
import { SceneManager } from "./scene/SceneManager";
import { Hud } from "./ui/Hud";
import { Labels } from "./ui/Labels";
import { StartScreen } from "./ui/StartScreen";

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const statusEl = document.getElementById("status")!;
const hudRoot = document.getElementById("hud")!;

async function boot() {
  const scene = new SceneManager(canvas, stage());
  const effects = new Effects(scene.scene);
  const stageArt = new Stage(scene.scene);
  const hud = new Hud(hudRoot);
  const labels = new Labels();
  const startScreen = new StartScreen();

  // Mute toggle (also serves as a gesture to unlock audio).
  const muteBtn = document.createElement("button");
  muteBtn.className = "mute-btn";
  muteBtn.textContent = "🔊";
  muteBtn.title = "Mute / unmute";
  muteBtn.addEventListener("click", () => {
    audio.resume();
    const m = !audio.isMuted();
    audio.setMuted(m);
    muteBtn.textContent = m ? "🔇" : "🔊";
  });
  document.body.appendChild(muteBtn);

  const p1 = new Fighter(scene.scene, { playerId: 1, side: -1 });
  const p2 = new Fighter(scene.scene, { playerId: 2, side: 1, placeholderColor: 0x8ab4ff });
  const input1 = new InputController(P1_KEYS);
  const input2kb = new InputController(P2_KEYS);
  let controller2: Controller = input2kb;
  labels.register(1);
  labels.register(2);
  const match = new Match([p1, p2], effects, hud);

  statusEl.textContent = "Loading stage & fighters…";
  await Promise.all([stageArt.build(stage()), p1.load(), p2.load()]);
  statusEl.classList.add("hidden");
  hud.setStocks(1, 3, 3);
  hud.setStocks(2, 3, 3);

  let phase: "title" | "playing" = "title";
  let switching = false;

  /**
   * Make a map current: collision, blast zones and spawns come from the stage
   * registry, the backdrop and platform art are rebuilt to match. Only safe
   * between matches — a fighter mid-flight would be judged against blast zones
   * that no longer exist.
   */
  async function applyStage(id: StageId) {
    if (switching || stage().id === id) return;
    switching = true;
    setStage(id);
    const def = stage();
    scene.setEnvironment(def);
    statusEl.textContent = `Loading ${def.name}…`;
    statusEl.classList.remove("hidden");
    try {
      await stageArt.build(def);
    } finally {
      statusEl.classList.add("hidden");
      switching = false;
    }
  }

  /** Load a side's chosen character, reusing cached art when unchanged. */
  async function applyCharacter(slot: "p1char" | "p2char", id: CharacterId) {
    const fighter = slot === "p1char" ? p1 : p2;
    if (fighter.character.id === id) return;
    statusEl.textContent = `Loading ${CHARACTERS[id].name}…`;
    statusEl.classList.remove("hidden");
    try {
      await fighter.setCharacter(CHARACTERS[id]);
    } finally {
      statusEl.classList.add("hidden");
    }
  }

  async function startGame() {
    if (switching) return;
    await applyStage(startScreen.getStageId());
    await Promise.all([
      applyCharacter("p1char", startScreen.getCharacter("p1char")),
      applyCharacter("p2char", startScreen.getCharacter("p2char")),
    ]);
    audio.sfx("select");
    if (startScreen.getMode() === "cpu") {
      const ai = new AIController(startScreen.getDifficulty());
      ai.setFighters(p2, p1);
      controller2 = ai;
    } else {
      controller2 = input2kb;
    }
    phase = "playing";
    startScreen.hide();
    hud.setPlaying(true);
    match.reset();
  }

  /** Leave a match — either after the win banner, or by confirming the pause. */
  function returnToMenu() {
    if (phase !== "playing") return;
    hud.setPlaying(false); // also dismisses the pause dialog
    match.reset();
    phase = "title";
    startScreen.show();
  }

  // Start / menu buttons work with the mouse (also unlock audio on click).
  startScreen.onStart(() => void startGame());
  // Picking a map swaps it in behind the menu, so the card is a live preview.
  startScreen.onStageChange((id) => void applyStage(id));
  // Picking a fighter swaps them in behind the menu too.
  startScreen.onCharacterChange((slot, id) => void applyCharacter(slot, id));
  hud.onMenu(returnToMenu); // win banner
  hud.onQuit(returnToMenu); // confirmed from the pause dialog

  // Dev-only inspection handle. Character state lives deep inside Fighter, and
  // reaching it from the console is the only practical way to check that the
  // right animation clip is driving the rig.
  if (import.meta.env.DEV) {
    (window as unknown as { game: unknown }).game = { p1, p2, scene, match, effects };
  }

  // Browsers keep the AudioContext suspended until a user gesture.
  window.addEventListener("pointerdown", () => audio.resume(), { once: true });

  window.addEventListener("keydown", (e) => {
    // Esc pauses / resumes mid-match; the win banner has its own flow.
    if (e.code === "Escape" && phase === "playing" && !match.over) {
      hud.toggleConfirm();
      return;
    }
    if (e.code !== START_KEY) return;
    if (phase === "title") void startGame();
    else if (match.over) returnToMenu();
  });

  const STEP_MS = 1000 / 60;
  let last = performance.now();
  let acc = 0;

  function step(ms: number) {
    const dt = ms / 1000;
    input1.update(ms);
    controller2.update(ms);
    p1.setRunning(input1.dashDir, input1);
    p1.update(input1, dt, effects);
    p2.setRunning(controller2.dashDir, controller2);
    p2.update(controller2, dt, effects);
    effects.update(dt);
    if (phase === "playing") {
      resolveCombat([p1, p2], effects);
      match.update();
    }
  }

  function frame(now: number) {
    acc += now - last;
    last = now;
    if (acc > 250) acc = 250;
    // Paused: keep rendering the scene, but bank no simulation time — otherwise
    // resuming would fast-forward every frame spent sitting in the dialog.
    if (hud.paused) acc = 0;
    while (acc >= STEP_MS) {
      step(STEP_MS);
      acc -= STEP_MS;
    }
    scene.render();
    labels.update(scene.camera, [p1, p2], canvas);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error(err);
  statusEl.textContent = `Failed to start: ${err instanceof Error ? err.message : err}`;
});

import type { ChaseState, GamePhase, GameSettings, InputDevice, RiderState, RunStats } from '../game/types';
import type { TrickSystem } from './TrickSystem';

type Handlers = { play: () => void; resume: () => void; restart: () => void; quit: () => void; settings: (settings: GameSettings) => void };

export class HUDController {
  private readonly hud = this.el('#hud');
  private readonly screens = Array.from(document.querySelectorAll<HTMLElement>('.game-screen'));
  private readonly specialSegments = Array.from(document.querySelectorAll<HTMLElement>('#special-meter i'));
  private calloutTimer = 0;
  private lastReady = false;
  private debugVisible = false;

  constructor(handlers: Handlers) {
    this.el<HTMLButtonElement>('#play-button').addEventListener('click', handlers.play);
    this.el<HTMLButtonElement>('#resume-button').addEventListener('click', handlers.resume);
    this.el<HTMLButtonElement>('#restart-button').addEventListener('click', handlers.restart);
    this.el<HTMLButtonElement>('#retry-button').addEventListener('click', handlers.restart);
    this.el<HTMLButtonElement>('#quit-button').addEventListener('click', handlers.quit);
    this.el<HTMLButtonElement>('#results-title-button').addEventListener('click', handlers.quit);
    this.el<HTMLButtonElement>('#controls-button').addEventListener('click', () => this.showScreen('controls'));
    this.el<HTMLButtonElement>('#settings-button').addEventListener('click', () => this.showScreen('settings'));
    document.querySelectorAll<HTMLButtonElement>('.back-button').forEach((button) => button.addEventListener('click', () => this.showScreen('title')));
    ['#music-volume', '#effects-volume', '#ambience-volume', '#quality-select', '#reduced-motion'].forEach((selector) => this.el<HTMLInputElement | HTMLSelectElement>(selector).addEventListener('input', () => handlers.settings(this.readSettings())));
  }

  showPhase(phase: GamePhase): void {
    this.screens.forEach((screen) => screen.classList.remove('active'));
    this.hud.classList.toggle('is-hidden', phase !== 'playing' && phase !== 'paused');
    this.el('#touch-controls').classList.toggle('playing', phase === 'playing');
    if (phase === 'title') this.showScreen('title');
    if (phase === 'paused') this.showScreen('pause');
    if (phase === 'results') this.showScreen('results');
  }

  update(dt: number, rider: RiderState, chase: ChaseState, tricks: TrickSystem, inputDevice: InputDevice): void {
    this.el('#speed-value').textContent = Math.round(rider.speedMph).toString().padStart(3, '0');
    this.el('#score-value').textContent = Math.round(tricks.score).toString().padStart(7, '0');
    this.el('#movement-callout').textContent = tricks.getMovementLabel();
    this.el('#bear-distance').textContent = Math.max(0, Math.round(chase.bearDistance)).toString();
    this.el('#yeti-distance').textContent = Math.max(0, Math.round(chase.yetiDistance)).toString();
    this.updatePursuer('#pursuer-bear', chase.bearClosing, chase.bearDistance);
    this.updatePursuer('#pursuer-yeti', chase.yetiClosing, chase.yetiDistance);
    this.el('#danger-vignette').classList.toggle('active', chase.danger);
    const filled = Math.round(tricks.special * this.specialSegments.length);
    this.specialSegments.forEach((segment, index) => segment.classList.toggle('filled', index < filled));
    this.el('#special-meter').classList.toggle('ready', tricks.special >= 0.999 && !tricks.specialActive);
    if (!this.lastReady && tricks.special >= 0.999) this.showCallout('SPECIAL READY', inputDevice === 'gamepad' ? 'PRESS L3' : 'PRESS F');
    this.lastReady = tricks.special >= 0.999;
    const progress = Math.min(1, rider.distance / 1800);
    this.el('#route-player').style.left = `${15 + progress * 72}%`;
    this.el('#route-yeti').style.left = `${Math.max(3, 15 + progress * 72 - chase.yetiDistance * 0.28)}%`;
    this.el('#route-bear').style.left = `${Math.max(2, 15 + progress * 72 - chase.bearDistance * 0.28)}%`;
    if (this.calloutTimer > 0) { this.calloutTimer -= dt; if (this.calloutTimer <= 0) this.el('#center-callout').classList.remove('show'); }
  }

  showCallout(label: string, combo = ''): void {
    const root = this.el('#center-callout'); root.classList.remove('show'); void root.offsetWidth;
    this.el('#trick-callout').textContent = label; this.el('#combo-value').textContent = combo; root.classList.add('show'); this.calloutTimer = 0.9;
  }

  showResults(stats: RunStats, finished: boolean): void {
    this.el('#result-kicker').textContent = finished ? 'MOUNTAIN CLEARED' : 'RUN OVER';
    this.el('#result-title').textContent = finished ? 'LINE BROKEN' : 'WHITEOUT';
    this.el('#result-score').textContent = stats.score.toLocaleString(); this.el('#result-speed').textContent = `${Math.round(stats.maxSpeed)} MPH`;
    this.el('#result-combo').textContent = stats.longestCombo.toLocaleString(); this.el('#result-trick').textContent = stats.bestTrick;
    this.el('#result-distance').textContent = `${Math.round(stats.distance)} M`; this.el('#result-catcher').textContent = stats.caughtBy ?? '—';
  }

  flashWhiteout(): void { const root = this.el('#whiteout'); root.classList.remove('flash'); void root.offsetWidth; root.classList.add('flash'); }
  toggleDebug(): void { this.debugVisible = !this.debugVisible; this.el('#debug-overlay').classList.toggle('is-hidden', !this.debugVisible); }
  updateDebug(text: string): void { if (this.debugVisible) this.el('#debug-overlay').textContent = text; }
  isDebugVisible(): boolean { return this.debugVisible; }

  private updatePursuer(selector: string, closing: boolean, distance: number): void {
    const root = this.el(selector); root.classList.toggle('closing', distance < 15); const label = root.querySelector('em');
    if (label) label.textContent = distance < 8 ? 'DANGER' : closing ? 'CLOSING' : 'TRACKING';
  }

  private showScreen(name: string): void { this.screens.forEach((screen) => screen.classList.toggle('active', screen.id === `screen-${name}`)); }
  private readSettings(): GameSettings {
    return {
      music: Number(this.el<HTMLInputElement>('#music-volume').value), effects: Number(this.el<HTMLInputElement>('#effects-volume').value),
      ambience: Number(this.el<HTMLInputElement>('#ambience-volume').value), quality: this.el<HTMLSelectElement>('#quality-select').value as GameSettings['quality'],
      reducedMotion: this.el<HTMLInputElement>('#reduced-motion').checked,
    };
  }
  private el<T extends HTMLElement = HTMLElement>(selector: string): T { const value = document.querySelector<T>(selector); if (!value) throw new Error(`Missing UI element: ${selector}`); return value; }
}

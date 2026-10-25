import type { InputManager } from '../core/InputManager';
import type { RiderEvent } from '../entities/SnowboardController';
import type { RiderState, RunStats } from '../game/types';

type Callout = (label: string, combo?: string) => void;

export class TrickSystem {
  score = 0;
  combo = 0;
  multiplier = 1;
  special = 0;
  specialActive = false;
  longestCombo = 0;
  bestTrick = '—';
  bestTrickScore = 0;
  private specialTimer = 0;
  private airborne = false;
  private airTime = 0;
  private maxHeight = 0;
  private yaw = 0;
  private flip = 0;
  private corked = false;
  private frontGrab = 0;
  private backGrab = 0;
  private noseGrab = 0;
  private tailGrab = 0;
  private grindPoints = 0;
  private pendingNames: string[] = [];
  private readonly repeats = new Map<string, number>();
  private movementLabel = 'DROP IN';

  constructor(private readonly callout: Callout) {}

  handleInput(dt: number, input: InputManager): void {
    if (this.specialActive) {
      this.specialTimer -= dt;
      this.special = Math.max(0, this.specialTimer / 5.5);
      if (this.specialTimer <= 0) { this.specialActive = false; this.special = 0; }
    } else if (this.special >= 0.999 && input.pressed('special')) {
      this.specialActive = true; this.specialTimer = 5.5; this.callout('SPECIAL!', '2X SCORE');
    }
  }

  update(dt: number, state: RiderState, events: RiderEvent[]): void {
    if (!state.grounded && !state.bailing && !state.grinding) {
      this.airborne = true;
      this.airTime += dt;
      this.maxHeight = Math.max(this.maxHeight, state.airHeight);
      this.yaw = state.yawRotation;
      this.flip = state.flipRotation;
      this.corked = state.corked;
      if (state.grab === 'frontside') this.frontGrab += dt;
      if (state.grab === 'backside') this.backGrab += dt;
      if (state.grab === 'nose') this.noseGrab += dt;
      if (state.grab === 'tail') this.tailGrab += dt;
      const liveRotation = this.rotationName(this.yaw, this.flip, this.corked);
      this.movementLabel = state.grab === 'frontside' ? 'FRONTSIDE INDY' : state.grab === 'backside' ? 'BACKSIDE INDY' : state.grab === 'nose' ? 'NOSE GRAB' : state.grab === 'tail' ? 'TAIL GRAB' : liveRotation ?? 'AIR';
    } else if (state.grinding) {
      this.grindPoints += dt * (state.grinding === 'cable' ? 260 : 190);
      this.movementLabel = state.grinding === 'cable' ? 'CABLE GRIND' : 'RAIL GRIND';
    } else if (state.bailing) this.movementLabel = 'MASH JUMP!';
    else if (state.butter) this.movementLabel = state.butter === 'nose' ? 'NOSE BUTTER' : 'TAIL BUTTER';
    else if (state.tucked) this.movementLabel = 'TUCK';
    else this.movementLabel = Math.abs(state.steer) > 0.35 ? 'CARVE' : 'DROP IN';

    for (const event of events) {
      if (event.type === 'takeoff') this.beginAir();
      if (event.type === 'grind-start') {
        this.callout(event.kind === 'cable' ? 'CABLE GRIND!' : `${event.style.toUpperCase()}!`);
      }
      if (event.type === 'grind-end') {
        this.finishGrind(event.duration, event.style);
        this.beginAir();
      }
      if (event.type === 'land') this.finishAir(event.quality, state);
      if (event.type === 'bail') this.bail(event.reason);
      if (event.type === 'recover') this.callout('BACK ON IT!');
      if (event.type === 'reset') this.clearPending();
    }
  }

  getMovementLabel(): string { return this.movementLabel; }

  reset(): void {
    this.score = 0; this.combo = 0; this.multiplier = 1; this.special = 0; this.specialActive = false;
    this.longestCombo = 0; this.bestTrick = '—'; this.bestTrickScore = 0; this.specialTimer = 0; this.repeats.clear(); this.clearPending();
  }

  populateStats(stats: RunStats): void {
    stats.score = this.score; stats.longestCombo = this.longestCombo; stats.bestTrick = this.bestTrick; stats.bestTrickScore = this.bestTrickScore;
  }

  private beginAir(): void {
    this.airborne = true; this.airTime = 0; this.maxHeight = 0; this.yaw = 0; this.flip = 0; this.corked = false; this.frontGrab = 0; this.backGrab = 0; this.noseGrab = 0; this.tailGrab = 0;
  }

  private finishAir(quality: 'clean' | 'sketchy' | 'wipeout', state: RiderState): void {
    if (!this.airborne) return;
    if (quality === 'wipeout') { this.bail('WIPEOUT'); return; }
    const names: string[] = [];
    let base = 80 + this.airTime * 125 + this.maxHeight * 52;
    const rotation = this.nearestHalfTurnDegrees(this.yaw);
    const flips = Math.round(Math.abs(this.flip) / (Math.PI * 2));
    if (this.corked && rotation >= 180 && flips > 0) {
      names.push(`${this.yaw >= 0 ? 'FS' : 'BS'} CORK ${rotation}`);
      base += rotation * 1.45 + flips * 760;
    } else {
      if (rotation >= 180) {
        names.push(`${this.yaw >= 0 ? 'FS' : 'BS'} ${rotation}`);
        base += rotation * 1.3;
      }
      if (flips > 0) {
        const label = this.flip > 0 ? 'FRONTFLIP' : 'BACKFLIP';
        names.push(flips > 1 ? `${flips}X ${label}` : label);
        base += flips * 620;
      }
    }
    if (this.frontGrab > 0.16) { names.push('FRONTSIDE INDY'); base += 330 + this.frontGrab * 280; }
    if (this.backGrab > 0.16) { names.push('BACKSIDE INDY'); base += 360 + this.backGrab * 300; }
    if (this.noseGrab > 0.16) { names.push('NOSE GRAB'); base += 300 + this.noseGrab * 260; }
    if (this.tailGrab > 0.16) { names.push('TAIL GRAB'); base += 320 + this.tailGrab * 270; }
    if (names.length === 0) names.push(this.airTime > 0.45 ? 'BIG AIR' : 'OLLIE');
    const speedRisk = 1 + Math.min(0.55, state.speedMph / 180);
    const landingFactor = quality === 'clean' ? 1 : 0.62;
    const repeatKey = names.join(' + ');
    const repeats = this.repeats.get(repeatKey) ?? 0;
    const repetition = Math.max(0.42, 1 - repeats * 0.16);
    this.repeats.set(repeatKey, repeats + 1);
    const points = Math.round(base * speedRisk * landingFactor * repetition);
    this.addPending(points, repeatKey);
    this.bank(quality, repeatKey);
    this.airborne = false;
  }

  private finishGrind(duration: number, style: '50-50' | 'boardslide'): void {
    if (duration < 0.12) { this.grindPoints = 0; return; }
    const name = duration > 2.1 ? `LONG ${style.toUpperCase()}` : style.toUpperCase();
    this.addPending(Math.round(this.grindPoints + duration * (style === 'boardslide' ? 165 : 120)), name);
    this.grindPoints = 0;
  }

  private addPending(points: number, name: string): void {
    this.combo += points;
    this.pendingNames.push(name);
    this.multiplier = Math.min(8, 1 + Math.floor(this.pendingNames.length / 2));
    this.longestCombo = Math.max(this.longestCombo, this.combo * this.multiplier);
  }

  private bank(quality: 'clean' | 'sketchy', name: string): void {
    const total = Math.round(this.combo * this.multiplier * (this.specialActive ? 2 : 1));
    this.score += total;
    if (total > this.bestTrickScore) { this.bestTrickScore = total; this.bestTrick = name; }
    this.special = Math.min(1, this.special + Math.min(0.34, total / 5200));
    this.callout(quality === 'clean' ? 'CLEAN LANDING!' : 'SKETCHY LANDING!', `${name} · ${total.toLocaleString()} PTS`);
    this.combo = 0; this.multiplier = 1; this.pendingNames.length = 0;
  }

  private bail(reason: string): void {
    this.callout(reason.includes('LANDING') ? 'WIPEOUT!' : reason.toUpperCase(), 'COMBO LOST');
    this.combo = 0; this.multiplier = 1; this.special = Math.max(0, this.special - 0.28); this.clearPending();
  }

  private clearPending(): void {
    this.airborne = false; this.airTime = 0; this.maxHeight = 0; this.yaw = 0; this.flip = 0; this.corked = false;
    this.frontGrab = 0; this.backGrab = 0; this.noseGrab = 0; this.tailGrab = 0; this.grindPoints = 0; this.pendingNames.length = 0; this.combo = 0; this.multiplier = 1;
  }

  private nearestHalfTurnDegrees(value: number): number {
    return Math.min(1080, Math.round(Math.abs(value) / Math.PI) * 180);
  }

  private rotationName(yaw: number, flip: number, corked: boolean): string | null {
    const rotation = this.nearestHalfTurnDegrees(yaw);
    const flips = Math.round(Math.abs(flip) / (Math.PI * 2));
    if (corked && rotation >= 180 && flips > 0) return `${yaw >= 0 ? 'FS' : 'BS'} CORK ${rotation}`;
    if (flips > 0) return `${flips > 1 ? `${flips}X ` : ''}${flip >= 0 ? 'FRONTFLIP' : 'BACKFLIP'}`;
    if (rotation >= 180) return `${yaw >= 0 ? 'FS' : 'BS'} ${rotation}`;
    return null;
  }
}

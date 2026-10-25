import { audio } from "../audio/audio";
import type { Effects } from "./combat";
import type { Fighter } from "./Fighter";
import type { Hud } from "../ui/Hud";

// Two-player stocks + KO + respawn. A KO comes from crossing a blast zone
// (self-destruct or getting launched out). Last fighter standing wins.
export class Match {
  private readonly max = 3;
  private stocks: [number, number] = [this.max, this.max];
  over = false;
  winner = 0; // 0 = ongoing, else the winning playerId

  constructor(
    private fighters: Fighter[],
    private effects: Effects,
    private hud: Hud,
  ) {}

  reset() {
    this.stocks = [this.max, this.max];
    this.over = false;
    this.winner = 0;
    this.fighters.forEach((f, i) => {
      f.respawn();
      this.hud.setStocks(f.playerId, this.stocks[i], this.max);
      this.hud.setPercent(f.playerId, 0);
    });
    this.hud.showResult(0);
  }

  update() {
    if (this.over) return;
    this.fighters.forEach((f, i) => {
      if (f.state !== "dead" && f.isOffStage()) {
        audio.sfx("ko");
        this.effects.ring(f.x, f.centerY, f.playerId === 1 ? 0xff7bbf : 0x66b3ff, 1.1);
        this.stocks[i] -= 1;
        this.hud.setStocks(f.playerId, this.stocks[i], this.max);
        if (this.stocks[i] > 0) {
          f.respawn();
        } else {
          f.freeze();
          this.over = true;
          this.winner = this.fighters[i === 0 ? 1 : 0].playerId;
          this.hud.showResult(this.winner);
        }
      }
    });
    this.hud.setPercent(1, this.fighters[0].damage);
    this.hud.setPercent(2, this.fighters[1].damage);
  }
}

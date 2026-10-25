// Procedural audio (Web Audio API): synthesized sound effects with a master
// mute. Everything is generated in code — no copyrighted assets — so it's safe
// to ship in a public repo. There is deliberately no background music.

export type SfxName = "jump" | "swing" | "hit" | "ko" | "select" | "splash" | "stroke" | "explode";

class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private muted = false;

  private ensure(): AudioContext {
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.35;
      this.sfxGain.connect(this.master);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Call on a user gesture (keydown / click) to unlock audio. */
  resume() {
    this.ensure();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 1;
  }
  isMuted() {
    return this.muted;
  }

  // ---- Sound effects ----
  sfx(name: SfxName) {
    const ctx = this.ensure();
    const t = ctx.currentTime;
    switch (name) {
      case "jump":
        this.tone(t, 260, 620, 0.13, "square", 0.5);
        break;
      case "swing":
        this.noise(t, 0.09, 1400, 0.22);
        break;
      case "hit":
        this.noise(t, 0.12, 900, 0.5);
        this.tone(t, 200, 60, 0.15, "sine", 0.7);
        break;
      case "ko":
        this.tone(t, 520, 70, 0.5, "sawtooth", 0.6);
        this.noise(t, 0.4, 600, 0.3);
        break;
      case "explode":
        // Dull low thump under a broad noise burst — a boom, not a hit.
        this.tone(t, 110, 35, 0.32, "sine", 0.7);
        this.noise(t, 0.38, 480, 0.6);
        break;
      case "select":
        this.tone(t, 520, 520, 0.06, "square", 0.4);
        this.tone(t + 0.07, 780, 780, 0.09, "square", 0.4);
        break;
      case "splash":
        // Bright spray over a low "gloop": body hitting water.
        this.noise(t, 0.3, 3200, 0.45);
        this.tone(t, 420, 90, 0.22, "sine", 0.5);
        break;
      case "stroke":
        // A softer, wetter version for each swimming stroke.
        this.noise(t, 0.14, 1800, 0.22);
        break;
    }
  }

  private tone(
    t: number,
    f0: number,
    f1: number,
    dur: number,
    type: OscillatorType,
    peak: number,
  ) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, cutoff: number, peak: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur);
  }

}

export const audio = new AudioManager();

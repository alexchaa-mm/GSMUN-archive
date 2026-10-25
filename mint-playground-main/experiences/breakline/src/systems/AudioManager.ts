import type { AssetManager } from '../assets/AssetManager';

type AudioVolumes = { music: number; effects: number; ambience: number };
type BusName = 'music' | 'effects' | 'ambience';

const AUDIO_KEYS = [
  'music-gameplay',
  'ambience-wind',
  'loop-carve',
  'loop-grind',
  'sfx-powder',
  'sfx-ollie',
  'sfx-clean-landing',
  'sfx-heavy-landing',
  'sfx-special-ready',
  'sfx-bear-growl',
  'sfx-combo',
  'sfx-boost',
  'sfx-yeti-roar',
] as const;

export class AudioManager {
  private context: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private readonly urls = new Map<string, string>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loopSources = new Map<string, AudioBufferSourceNode>();
  private readonly loopGains = new Map<string, GainNode>();
  private loadPromise: Promise<void> | null = null;
  private loopsStarted = false;
  private nextThreatSound = 0;
  private threatToggle = false;
  private volumes: AudioVolumes = { music: 0.72, effects: 0.85, ambience: 0.7 };

  initialize(assets: AssetManager): void {
    AUDIO_KEYS.forEach((key) => {
      const url = assets.getArtifactUrl(key, 'audio_file');
      if (url) this.urls.set(key, url);
    });
  }

  async unlock(): Promise<void> {
    if (!this.context) this.createContext();
    if (this.context?.state === 'suspended') await this.context.resume();
    if (!this.loadPromise) this.loadPromise = this.loadBuffers();
    await this.loadPromise;
    this.startLoops();
  }

  update(speedMps: number, carve: number, grounded: boolean, grinding: boolean, danger: number): void {
    const context = this.context;
    if (!context || context.state !== 'running' || !this.loopsStarted) return;
    const now = context.currentTime;
    this.loopGains.get('ambience-wind')?.gain.setTargetAtTime(0.14 + Math.min(0.5, speedMps / 62), now, 0.12);
    this.loopGains.get('loop-carve')?.gain.setTargetAtTime(
      grounded && !grinding ? Math.min(0.42, speedMps / 58) * (0.4 + Math.abs(carve) * 0.6) : 0,
      now,
      0.07,
    );
    this.loopGains.get('loop-grind')?.gain.setTargetAtTime(grinding ? 0.44 : 0, now, 0.045);
    const wind = this.loopSources.get('ambience-wind');
    const carveLoop = this.loopSources.get('loop-carve');
    if (wind) wind.playbackRate.setTargetAtTime(0.78 + speedMps / 65, now, 0.15);
    if (carveLoop) carveLoop.playbackRate.setTargetAtTime(0.85 + speedMps / 90, now, 0.12);
    if (danger > 0.78 && now >= this.nextThreatSound) {
      this.oneShot(this.threatToggle ? 'sfx-bear-growl' : 'sfx-yeti-roar', 0.26 + danger * 0.18);
      this.threatToggle = !this.threatToggle;
      this.nextThreatSound = now + 4.5;
    }
  }

  setVolumes(volumes: AudioVolumes): void {
    this.volumes = volumes;
    const now = this.context?.currentTime ?? 0;
    this.musicGain?.gain.setTargetAtTime(volumes.music * 0.62, now, 0.06);
    this.effectsGain?.gain.setTargetAtTime(volumes.effects, now, 0.06);
    this.ambienceGain?.gain.setTargetAtTime(volumes.ambience, now, 0.06);
  }

  jump(): void {
    this.oneShot('sfx-ollie', 0.72);
  }

  land(impact: number): void {
    this.oneShot(impact > 15 ? 'sfx-heavy-landing' : 'sfx-clean-landing', Math.min(1, 0.42 + impact / 28));
    this.oneShot('sfx-powder', Math.min(0.78, 0.22 + impact / 42), 0.94 + Math.random() * 0.08);
  }

  bail(): void {
    this.oneShot('sfx-heavy-landing', 0.92, 0.88);
  }

  score(): void {
    this.oneShot('sfx-combo', 0.58);
  }

  specialReady(): void {
    this.oneShot('sfx-special-ready', 0.78);
  }

  special(): void {
    this.oneShot('sfx-boost', 0.95);
  }

  dispose(): void {
    this.loopSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // A stopped source needs no additional cleanup.
      }
    });
    this.loopSources.clear();
    this.loopGains.clear();
    this.buffers.clear();
    void this.context?.close();
    this.context = null;
  }

  private createContext(): void {
    this.context = new AudioContext();
    const master = this.context.createGain();
    master.gain.value = 0.82;
    master.connect(this.context.destination);
    this.musicGain = this.context.createGain();
    this.effectsGain = this.context.createGain();
    this.ambienceGain = this.context.createGain();
    this.musicGain.gain.value = this.volumes.music * 0.62;
    this.effectsGain.gain.value = this.volumes.effects;
    this.ambienceGain.gain.value = this.volumes.ambience;
    this.musicGain.connect(master);
    this.effectsGain.connect(master);
    this.ambienceGain.connect(master);
  }

  private async loadBuffers(): Promise<void> {
    const context = this.context;
    if (!context) return;
    await Promise.all([...this.urls].map(async ([key, url]) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(key, buffer);
      } catch {
        // A missing optional cue should not prevent the game from starting.
      }
    }));
  }

  private startLoops(): void {
    if (this.loopsStarted) return;
    this.startLoop('music-gameplay', 'music', 0.58);
    this.startLoop('ambience-wind', 'ambience', 0.14);
    this.startLoop('loop-carve', 'ambience', 0);
    this.startLoop('loop-grind', 'effects', 0);
    this.loopsStarted = true;
  }

  private startLoop(key: string, bus: BusName, gainValue: number): void {
    const context = this.context;
    const buffer = this.buffers.get(key);
    const destination = this.bus(bus);
    if (!context || !buffer || !destination) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = gainValue;
    source.connect(gain).connect(destination);
    source.start();
    this.loopSources.set(key, source);
    this.loopGains.set(key, gain);
  }

  private oneShot(key: string, gainValue: number, playbackRate = 1): void {
    const context = this.context;
    const buffer = this.buffers.get(key);
    if (!context || !buffer || !this.effectsGain) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    gain.gain.value = gainValue;
    source.connect(gain).connect(this.effectsGain);
    source.start();
  }

  private bus(name: BusName): GainNode | null {
    if (name === 'music') return this.musicGain;
    if (name === 'ambience') return this.ambienceGain;
    return this.effectsGain;
  }
}

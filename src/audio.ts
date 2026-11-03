export type SoundKind = 'ball' | 'pocket';

export class GameAudio {
  private context?: AudioContext;
  private output?: GainNode;
  private pending = new Map<SoundKind, number>();
  private lastPlayed = new Map<SoundKind, number>();
  enabled = true;
  volume = 0.45;

  async unlock() {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      if (!this.output) {
        this.output = this.context.createGain();
        const limiter = this.context.createDynamicsCompressor();
        this.output.connect(limiter);
        limiter.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') await this.context.resume();
    } catch {
      // Gameplay remains available if the browser cannot start audio.
    }
  }

  configure(enabled: boolean, volume: number) {
    this.enabled = enabled;
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.context && this.output) this.output.gain.setTargetAtTime(enabled ? this.volume : 0, this.context.currentTime, 0.02);
    if (!enabled) this.pending.clear();
  }

  queue = (kind: SoundKind, strength: number) => {
    if (this.enabled && strength > 0.06) this.pending.set(kind, Math.max(strength, this.pending.get(kind) ?? 0));
  };

  flush() {
    const context = this.context;
    if (!context || !this.output || context.state !== 'running' || document.hidden || !this.enabled) {
      this.pending.clear();
      return;
    }
    this.output.gain.setTargetAtTime(this.volume, context.currentTime, 0.02);
    for (const [kind, strength] of this.pending) {
      const now = context.currentTime;
      if (now - (this.lastPlayed.get(kind) ?? -1) < 0.035) continue;
      this.lastPlayed.set(kind, now);
      const duration = kind === 'ball' ? 0.055 : 0.23;
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const time = i / context.sampleRate;
        const envelope = Math.exp(-time * (kind === 'ball' ? 95 : 22));
        const frequency = kind === 'ball' ? 1700 : 155;
        data[i] = (Math.sin(time * Math.PI * 2 * frequency) * 0.65 + (Math.random() * 2 - 1) * 0.35) * envelope;
      }
      const source = context.createBufferSource();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = kind === 'ball' ? 3800 : 650;
      gain.gain.value = Math.min(0.5, 0.08 + strength * 0.11);
      source.buffer = buffer;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.output);
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
      source.start();
    }
    this.pending.clear();
  }
}

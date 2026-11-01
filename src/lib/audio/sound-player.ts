import {
  createSoundSamples,
  type SoundCue,
  type SoundStyle,
} from "./sound-design";

/** Created only in response to user interaction; never on page load. */
export class SoundPlayer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Set<AudioBufferSourceNode>();
  private enabled = false;
  private disposed = false;

  get isReady() {
    return this.enabled && this.context?.state === "running";
  }

  async enable(volume: number) {
    if (this.disposed) return false;
    if (!this.context) {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.connect(this.context.destination);
    }
    this.setVolume(volume);
    await this.context.resume();
    if (this.disposed) return false;
    this.enabled = this.context.state === "running";
    return this.enabled;
  }

  setVolume(volume: number) {
    if (!this.context || !this.gain) return;
    this.gain.gain.setTargetAtTime(
      Math.max(0, Math.min(1, volume)),
      this.context.currentTime,
      0.006,
    );
  }

  play(style: SoundStyle, cue: SoundCue) {
    return this.playGenerated(`${style}:${cue}`, (sampleRate) =>
      createSoundSamples(style, cue, sampleRate),
    );
  }

  playGenerated(
    key: string,
    render: (sampleRate: number) => Float32Array<ArrayBuffer>,
  ) {
    const context = this.context;
    if (!this.enabled || !context || !this.gain || context.state !== "running")
      return false;
    let buffer = this.buffers.get(key);
    if (!buffer) {
      const samples = render(context.sampleRate);
      buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.copyToChannel(samples, 0);
      this.buffers.set(key, buffer);
    }
    if (this.voices.size >= 6) {
      const oldest = this.voices.values().next().value;
      oldest?.stop();
      if (oldest) this.voices.delete(oldest);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
    };
    source.start();
    return true;
  }

  stop() {
    for (const source of this.voices) {
      source.stop();
      source.disconnect();
    }
    this.voices.clear();
  }

  mute() {
    this.enabled = false;
    this.stop();
    if (this.context && this.gain)
      this.gain.gain.setValueAtTime(0, this.context.currentTime);
  }

  dispose() {
    this.disposed = true;
    this.mute();
    void this.context?.close().catch(() => {});
    this.buffers.clear();
  }
}

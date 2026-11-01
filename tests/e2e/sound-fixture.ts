import type { Page } from "@playwright/test";

declare global {
  interface Window {
    __soundProbe: {
      contexts: number;
      starts: {
        frames: number;
        sampleRate: number;
        checksum: number;
        peak: number;
        running: boolean;
      }[];
      volumes: number[];
    };
  }
}

/** Observe actual Web Audio playback without replacing the audio implementation. */
export async function observeAudio(page: Page) {
  await page.addInitScript(() => {
    const probe: Window["__soundProbe"] = {
      contexts: 0,
      starts: [],
      volumes: [],
    };
    window.__soundProbe = probe;
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        probe.contexts++;
      }
      createGain() {
        const gain = super.createGain();
        const setTarget = gain.gain.setTargetAtTime.bind(gain.gain);
        gain.gain.setTargetAtTime = (value, startTime, timeConstant) => {
          probe.volumes.push(value);
          return setTarget(value, startTime, timeConstant);
        };
        return gain;
      }
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source);
        source.start = (when, offset, duration) => {
          const samples = source.buffer?.getChannelData(0);
          let peak = 0;
          let checksum = 0;
          samples?.forEach((sample, index) => {
            peak = Math.max(peak, Math.abs(sample));
            checksum += sample * ((index % 17) + 1);
          });
          probe.starts.push({
            frames: samples?.length ?? 0,
            sampleRate: this.sampleRate,
            checksum,
            peak,
            running: this.state === "running",
          });
          start(when, offset, duration);
        };
        return source;
      }
    };
  });
}

export const audioStartCount = (page: Page) =>
  page.evaluate(() => window.__soundProbe.starts.length);

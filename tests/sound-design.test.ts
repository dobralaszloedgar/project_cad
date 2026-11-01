import { describe, expect, it } from "vitest";
import {
  createSoundSamples,
  soundCues,
  soundStyles,
} from "../src/lib/audio/sound-design";

describe("sandbox sound design", () => {
  for (const sampleRate of [44100, 48000]) {
    it(`renders every cue as a short, audible, bounded signal at ${sampleRate} Hz`, () => {
      for (const style of soundStyles) {
        for (const cue of soundCues) {
          const samples = createSoundSamples(style.id, cue.id, sampleRate);
          const duration = samples.length / sampleRate;
          let energy = 0;
          let peak = 0;
          for (const sample of samples) {
            expect(Number.isFinite(sample)).toBe(true);
            peak = Math.max(peak, Math.abs(sample));
            energy += sample * sample;
          }
          expect(duration).toBeGreaterThan(0.03);
          expect(duration).toBeLessThan(0.25);
          expect(peak).toBeGreaterThan(0.05);
          expect(peak).toBeLessThan(0.73);
          expect(Math.sqrt(energy / samples.length)).toBeGreaterThan(0.015);
          // No discontinuity when the one-shot starts or ends.
          expect(samples[0]).toBe(0);
          expect(Math.abs(samples.at(-1)!)).toBe(0);
          expect(Math.abs(samples.at(-2)!)).toBeLessThan(0.001);
        }
      }
    });
  }

  it("offers distinct styles and keeps wire pickup quieter than placement", () => {
    const signals = soundStyles.map((style) =>
      createSoundSamples(style.id, "place", 48000),
    );
    for (let i = 1; i < signals.length; i++) {
      const difference = signals[i].reduce(
        (sum, sample, index) => sum + Math.abs(sample - signals[0][index]),
        0,
      );
      expect(difference / signals[i].length).toBeGreaterThan(0.02);
    }
    for (const style of soundStyles) {
      const energy = (samples: Float32Array) =>
        samples.reduce((sum, sample) => sum + sample * sample, 0);
      expect(energy(createSoundSamples(style.id, "wire", 48000))).toBeLessThan(
        energy(createSoundSamples(style.id, "place", 48000)) * 0.3,
      );
    }
  });
});

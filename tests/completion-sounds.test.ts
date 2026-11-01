import { describe, expect, it } from "vitest";
import {
  completionSounds,
  createCompletionSamples,
  soundDetails,
  soundFamilies,
} from "../src/lib/audio/completion-sounds";

describe("simulation completion sound candidates", () => {
  it("offers ten music boxes alongside the nineteen other sound pairs", () => {
    expect(completionSounds).toHaveLength(29);
    expect(new Set(completionSounds.map((sound) => sound.id)).size).toBe(29);
    for (const family of soundFamilies) {
      expect(
        completionSounds.filter((sound) => sound.family === family),
      ).toHaveLength(
        family === "Music box" ? 10 : family === "Musical" ? 4 : 5,
      );
    }
  });
  it.each([44100, 48000])(
    "renders distinct, balanced, click-free short cues at %i Hz",
    (rate) => {
      const signatures = new Set<number>();
      for (const outcome of ["complete", "attention"] as const) {
        for (const sound of completionSounds) {
          const samples = createCompletionSamples(sound.id, rate, outcome);
          expect(samples.length).toBe(
            Math.ceil(soundDetails(sound.id, outcome).duration * rate),
          );
          expect(samples.length / rate).toBeLessThan(1);
          expect(samples[0]).toBe(0);
          expect(Math.abs(samples.at(-1)!)).toBe(0);
          let peak = 0;
          let energy = 0;
          let mean = 0;
          let checksum = 0;
          let largestStep = 0;
          samples.forEach((sample, index) => {
            expect(Number.isFinite(sample)).toBe(true);
            peak = Math.max(peak, Math.abs(sample));
            energy += sample ** 2 / rate;
            mean += sample / samples.length;
            checksum += sample * ((index % 17) + 1);
            if (index)
              largestStep = Math.max(
                largestStep,
                Math.abs(sample - samples[index - 1]),
              );
          });
          expect(peak).toBeGreaterThan(0.05);
          expect(peak).toBeLessThanOrEqual(0.601);
          expect(energy).toBeCloseTo(0.0045, 5);
          expect(Math.abs(mean)).toBeLessThan(0.0001);
          expect(largestStep).toBeLessThan(0.12);
          signatures.add(checksum);
        }
      }
      expect(signatures.size).toBe(58);
    },
  );
});

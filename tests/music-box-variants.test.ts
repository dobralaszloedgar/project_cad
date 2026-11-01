import { describe, expect, it } from "vitest";
import { createCompletionSamples } from "../src/lib/audio/completion-sounds";
import { musicBoxVariants } from "../src/lib/audio/music-box-variants";

/** Detect audible key attacks from the rendered signal, not just its score. */
function keyAttacks(samples: Float32Array, rate: number) {
  const windowSize = Math.round(rate * 0.01);
  const envelope: number[] = [];
  for (let from = 0; from < samples.length; from += windowSize) {
    const to = Math.min(from + windowSize, samples.length);
    let energy = 0;
    for (let i = from; i < to; i++) energy += samples[i] ** 2;
    envelope.push(Math.sqrt(energy / (to - from)));
  }
  const flux = envelope.map((value, i) =>
    Math.max(0, value - (envelope[i - 1] ?? 0)),
  );
  const threshold = Math.max(...flux) * 0.2;
  const attacks: number[] = [];
  flux.forEach((value, i) => {
    const time = (i * windowSize) / rate;
    if (value > threshold && (!attacks.length || time - attacks.at(-1)! > 0.04))
      attacks.push(time);
  });
  return attacks;
}

describe("music-box simulation sounds", () => {
  it("offers ten numbered variations with a two-note failure score", () => {
    expect(musicBoxVariants).toHaveLength(10);
    expect(musicBoxVariants.map((variant) => variant.variant)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    for (const variant of musicBoxVariants) {
      expect(variant.successNotes.length).toBeGreaterThanOrEqual(3);
      expect(variant.failureNotes).toHaveLength(2);
      expect(variant.failureNotes[0].start).toBe(0);
      expect(variant.failureNotes[1].start).toBeGreaterThanOrEqual(0.14);
      expect(variant.failureNotes[1].frequency).toBeLessThan(
        variant.failureNotes[0].frequency,
      );
    }
  });

  it.each([44100, 48000])(
    "renders exactly two distinct failure-note attacks at %i Hz",
    (rate) => {
      for (const variant of musicBoxVariants) {
        const attacks = keyAttacks(
          createCompletionSamples(variant.id, rate, "attention"),
          rate,
        );
        expect(attacks, variant.name).toHaveLength(2);
        expect(attacks[0], variant.name).toBeLessThan(0.02);
        expect(
          Math.abs(attacks[1] - variant.failureNotes[1].start),
          variant.name,
        ).toBeLessThan(0.02);
      }
    },
  );
});

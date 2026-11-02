import { describe, expect, it } from "vitest";
import { benchmarkCases } from "./helpers/numerical-benchmarks";

describe("external numerical references (no external runtime required)", () => {
  it.each(benchmarkCases)("$id: $group", (benchmark) => {
    const comparisons = benchmark.run();
    expect(comparisons.length).toBeGreaterThan(0);
    for (const result of comparisons) {
      expect(result.passed, JSON.stringify(result)).toBe(true);
    }
  });
});

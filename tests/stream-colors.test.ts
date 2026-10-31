import { describe, expect, it } from "vitest";
import {
  distillationExample,
  heatingExample,
  reactorExample,
} from "../src/domain/examples";
import { newUnit, type Project } from "../src/domain/schema";
import { simulate } from "../src/domain/solver";
import {
  projectStreamColors,
  streamColorIndices,
  STREAM_COLOR_COUNT,
} from "../src/components/stream-colors";

function feeds(fractions: number[]): Project {
  const units = fractions.flatMap((fraction, i) => {
    const feed = newUnit("Feed", `F${i}`, 0, i * 200);
    feed.params.fractionA = fraction;
    feed.params.flow = i + 1;
    feed.params.temperature = 300 + i * 10;
    return [feed, newUnit("Product", `P${i}`, 300, i * 200)];
  });
  return {
    version: 1,
    name: "Color groups",
    units,
    edges: fractions.map((_, i) => ({
      id: `s${i}`,
      source: `F${i}`,
      target: `P${i}`,
      sourcePort: "out",
      targetPort: "in",
      color: "teal",
    })),
  };
}

describe("stream palette colors", () => {
  it("groups equal mole compositions regardless of flow, conditions, or solver noise", () => {
    const project = feeds([0.25, 0.25, 0.250000001, 0.75]);
    const colors = streamColorIndices(project);
    expect(colors.get("s0")).toBe(colors.get("s1"));
    expect(colors.get("s0")).toBe(colors.get("s2"));
    expect(colors.get("s0")).not.toBe(colors.get("s3"));
  });
  it("uses all eight colors before reusing them for different compositions", () => {
    const colors = [
      ...streamColorIndices(
        feeds(Array.from({ length: 17 }, (_, i) => i / 16)),
      ).values(),
    ];
    expect(new Set(colors.slice(0, 8)).size).toBe(STREAM_COLOR_COUNT);
    for (let index = 0; index < STREAM_COLOR_COUNT; index++)
      expect(
        colors.filter((color) => color === index).length,
      ).toBeGreaterThanOrEqual(2);
  });
  it("changes at reaction and mixing, but not heating or splitting", () => {
    const project = reactorExample();
    const colors = projectStreamColors(project, simulate(project));
    expect(colors.s1).not.toBe(colors.s2);
    expect(colors.s2).toBe(colors.s3);
    expect(colors.s3).not.toBe(colors.s4);
    expect(colors.s4).toBe(colors.s5);
    expect(colors.s5).toBe(colors.recycle);
    expect(projectStreamColors(project, null)).toEqual(colors);
  });
  it("distinguishes feed, distillate and bottoms", () => {
    expect(
      new Set(Object.values(projectStreamColors(distillationExample(), null)))
        .size,
    ).toBe(3);
  });
  it("keeps connected composition-preserving groups together before a flowsheet can solve", () => {
    const project = reactorExample();
    project.units.push(newUnit("Cooler", "unconnected", 0, 300));
    const colors = streamColorIndices(project);
    expect(colors.get("s2")).toBe(colors.get("s3"));
    expect(colors.get("s4")).toBe(colors.get("s5"));
    expect(colors.get("s4")).toBe(colors.get("recycle"));
    expect(
      new Set([colors.get("s1"), colors.get("s2"), colors.get("s4")]).size,
    ).toBe(3);
  });
  it("overrides only the chosen stream and restores its automatic group", () => {
    const project = heatingExample();
    const initial = streamColorIndices(project);
    const chosen = (initial.get("s1")! + 1) % STREAM_COLOR_COUNT;
    const original = simulate(project);
    project.edges[0].colorIndex = chosen;
    expect(streamColorIndices(project).get("s1")).toBe(chosen);
    expect(streamColorIndices(project).get("s2")).toBe(initial.get("s2"));
    expect(simulate(project).streams).toEqual(original.streams);
    delete project.edges[0].colorIndex;
    expect(streamColorIndices(project)).toEqual(initial);
  });
});

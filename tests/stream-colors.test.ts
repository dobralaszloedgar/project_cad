import { describe, expect, it } from "vitest";
import {
  distillationExample,
  heatingExample,
  reactorExample,
} from "../src/domain/examples";
import { newUnit } from "../src/domain/schema";
import { simulate } from "../src/domain/solver";
import {
  compositionColor,
  projectStreamColors,
  streamColors,
} from "../src/components/stream-colors";

describe("stream composition colors", () => {
  it("uses composition rather than flow rate, including numerical solver noise", () => {
    expect(compositionColor({ a: 1, b: 3 })).toBe(
      compositionColor({ a: 10, b: 30 }),
    );
    expect(compositionColor({ a: 1, b: 3 })).toBe(
      compositionColor({ a: 1.00000001, b: 3 }),
    );
    expect(
      new Set(
        [0, 0.25, 0.5, 0.75, 1].map((a) => compositionColor({ a, b: 1 - a })),
      ).size,
    ).toBe(5);
    expect(compositionColor({ a: 1, b: 0 })).not.toBe(
      compositionColor({ a: 0, b: 1 }),
    );
  });

  it("keeps undefined and zero-flow compositions neutral", () => {
    for (const value of [
      undefined,
      { a: 0, b: 0 },
      { a: NaN, b: 1 },
      { a: -1, b: 2 },
    ])
      expect(compositionColor(value)).toBe(streamColors.teal);
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
    const colors = projectStreamColors(distillationExample(), null);
    expect(new Set(Object.values(colors)).size).toBe(3);
  });

  it("updates colors after edits and retains only known compositions in unfinished flowsheets", () => {
    const project = heatingExample();
    const initial = projectStreamColors(project, null);
    project.units[0].params.fractionA = 0.4;
    expect(projectStreamColors(project, null).s1).not.toBe(initial.s1);
    project.units.push(newUnit("Cooler", "unconnected", 0, 300));
    const unfinished = projectStreamColors(project, null);
    expect(unfinished.s1).toBe(compositionColor({ a: 0.4, b: 0.6 }));
    expect(unfinished.s2).toBe(unfinished.s1);
    const reactor = reactorExample();
    reactor.units.push(newUnit("Cooler", "unconnected", 0, 300));
    expect(projectStreamColors(reactor, null).s4).toBe(streamColors.teal);
  });
});

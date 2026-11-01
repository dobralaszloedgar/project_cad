import { describe, expect, it } from "vitest";
import {
  feedComposition,
  normalizeComposition,
} from "../src/domain/stream-composition";
import { newUnit, projectSchema, type Project } from "../src/domain/schema";
import {
  equipmentSetupIssues,
  equipmentStatuses,
  simulationKey,
} from "../src/domain/equipment-status";
import { operate, simulate } from "../src/domain/solver";
import { settingsFor } from "./helpers/catalog";
import { applyActions } from "../src/domain/actions";

describe("feed ratios and missing inputs", () => {
  it.each([
    [
      { A: 2, B: 3 },
      { A: 0.4, B: 0.6 },
    ],
    [
      { A: 20, B: 30, C: 50 },
      { A: 0.2, B: 0.3, C: 0.5 },
    ],
    [
      { A: 0.2, B: 0.3 },
      { A: 0.4, B: 0.6 },
    ],
    [
      { A: 1e308, B: 1e308, C: 0 },
      { A: 0.5, B: 0.5, C: 0 },
    ],
    [
      { A: 1e-300, B: 1e-300 },
      { A: 0.5, B: 0.5 },
    ],
  ])(
    "normalizes nonnegative values without changing the supplied ratios",
    (input, expected) => {
      const original = { ...input };
      const fractions = normalizeComposition(input);
      for (const [id, fraction] of Object.entries(expected))
        expect(fractions[id]).toBeCloseTo(fraction, 12);
      expect(input).toEqual(original);
    },
  );

  it.each<Record<string, number>>([
    {},
    { A: 0, B: 0 },
    { A: -1, B: 2 },
    { A: NaN, B: 1 },
    { A: Infinity, B: 1 },
  ])("rejects empty, zero-total and invalid compositions", (input) => {
    expect(() => normalizeComposition(input)).toThrow(/composition/i);
  });

  it("keeps old binary projects compatible and rejects removed component identities", () => {
    const unit = newUnit("Feed", "F1", 0, 0);
    unit.params.fractionA = 0.3;
    expect(feedComposition(unit.params, ["A", "B", "C"])).toEqual({
      A: 0.3,
      B: 0.7,
      C: 0,
    });
    unit.params.composition = { removed: 1 };
    expect(() => feedComposition(unit.params, ["A", "B"])).toThrow(
      /removed component/,
    );
  });

  it("accepts ratios through project validation and conserves every component in simulation", () => {
    const ids = ["71-43-2", "108-88-3", "110-54-3"];
    const feed = newUnit("Feed", "F1", 0, 0);
    feed.params.composition = Object.fromEntries(
      ids.map((id, i) => [id, [2, 3, 5][i]]),
    );
    const project = projectSchema.parse({
      version: 1,
      name: "Three component ratios",
      thermo: settingsFor(ids),
      units: [feed, newUnit("Product", "P1", 200, 0)],
      edges: [
        {
          id: "s1",
          source: "F1",
          target: "P1",
          sourcePort: "out",
          targetPort: "in",
        },
      ],
    });
    const result = simulate(project);
    expect(result.converged).toBe(true);
    expect(result.streams.s1.components).toEqual({
      [ids[0]]: 2,
      [ids[1]]: 3,
      [ids[2]]: 5,
    });
    expect(equipmentSetupIssues(project, feed)).toEqual([]);
  });

  it("classifies all four empty feed inputs as missing and points to their fields", () => {
    const feed = newUnit("Feed", "F1", 0, 0);
    Object.assign(feed.params, {
      temperature: NaN,
      pressure: NaN,
      flow: NaN,
      composition: { A: NaN, B: NaN },
    });
    const project: Project = {
      version: 1,
      name: "Incomplete feed",
      units: [feed],
      edges: [],
    };
    const issues = equipmentSetupIssues(project, feed);
    expect(issues).toHaveLength(4);
    expect(issues.every((issue) => issue.kind === "missing")).toBe(true);
    expect(issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Specify flow.",
        "Specify temperature.",
        "Specify pressure.",
        "Specify composition.",
      ]),
    );
    expect(
      issues.find((issue) => issue.target.field === "temperature")?.target
        .section,
    ).toBe("settings");
    expect(
      issues.find((issue) => issue.message === "Specify composition.")?.target
        .section,
    ).toBe("composition");
  });

  it("persists incomplete setup without allowing default values to be simulated", () => {
    const feed = newUnit("Feed", "F1", 0, 0);
    feed.missingInputs = ["flow", "temperature", "pressure", "composition"];
    const project = projectSchema.parse({
      version: 1,
      name: "New feed",
      units: [feed],
      edges: [],
    });
    expect(equipmentSetupIssues(project, project.units[0])).toHaveLength(4);
    expect(() => operate(project.units[0], [])).toThrow(/Specify flow/);
    expect(
      equipmentStatuses(project, null, {
        unitId: "F1",
        message: "Specify flow before calculating.",
      }).F1.state,
    ).toBe("unresolved");
    const previous = simulationKey(project);
    const partial = applyActions(project, {
      summary: "Set flow",
      actions: [{ type: "update", id: "F1", params: { flow: 20 } }],
    });
    expect(partial.units[0].missingInputs).toEqual([
      "temperature",
      "pressure",
      "composition",
    ]);
    const complete = applyActions(partial, {
      summary: "Complete feed",
      actions: [
        {
          type: "update",
          id: "F1",
          params: {
            temperature: 300,
            pressure: 101325,
            composition: { A: 2, B: 3 },
          },
        },
      ],
    });
    expect(complete.units[0].missingInputs).toBeUndefined();
    expect(operate(complete.units[0], []).outputs[0]).toMatchObject({
      a: 8,
      b: 12,
    });
    project.units[0].missingInputs = undefined;
    expect(simulationKey(project)).not.toBe(previous);
  });
});

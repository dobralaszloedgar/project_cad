// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { describe, expect, it } from "vitest";
import { newUnit, projectSchema, validateGraph } from "../src/domain/schema";
import { mixerInlets, separateMixerInlets } from "../src/domain/material-ports";
import { arrangeFlowsheet } from "../src/domain/flowsheet-layout";
import { flow, operate, simulate } from "../src/domain/solver";
import { fourBranchProject } from "./helpers/four-branch-project";

describe("four-branch connections", () => {
  it("separates legacy shared mixer inlets on load and arrange without changing streams", () => {
    const original = fourBranchProject(true);
    const before = structuredClone(original);
    for (const project of [
      projectSchema.parse(original),
      arrangeFlowsheet(original),
    ]) {
      expect(
        project.edges
          .filter((edge) => edge.target === "M")
          .map((edge) => edge.targetPort),
      ).toEqual(mixerInlets);
      expect(
        project.edges.map(({ id, source, target }) => ({ id, source, target })),
      ).toEqual(
        original.edges.map(({ id, source, target }) => ({
          id,
          source,
          target,
        })),
      );
      expect(separateMixerInlets(project)).toBe(project);
      expect(validateGraph(project, true)).toEqual([]);
    }
    expect(original).toEqual(before);
  });

  it("preserves distinct requested inlet ports while moving only duplicates", () => {
    const project = fourBranchProject();
    project.edges[0].targetPort = "in2";
    project.edges[1].targetPort = "in2";
    expect(
      separateMixerInlets(project)
        .edges.slice(0, 4)
        .map((edge) => edge.targetPort),
    ).toEqual(["in2", "in", "in3", "in4"]);
  });

  it("conserves every component and energy through four separately specified outlets", () => {
    const project = projectSchema.parse(
      JSON.parse(JSON.stringify(fourBranchProject(true))),
    );
    const result = simulate(project);
    expect(result.converged).toBe(true);
    for (let index = 1; index <= 4; index++) {
      const stream = result.streams[`product-${index}`];
      expect(flow(stream)).toBeCloseTo(index, 10);
      expect(stream.a).toBeCloseTo(0.6 * index, 10);
      expect(stream.b).toBeCloseTo(0.4 * index, 10);
    }
    expect(Math.abs(result.massResidual)).toBeLessThan(1e-10);
    expect(Math.abs(result.energyResidual)).toBeLessThan(1e-8);
  });

  it("rejects a fifth mixer stream and ports beyond the fourth branch", () => {
    const project = fourBranchProject();
    project.units.push(newUnit("Feed", "F-5", 0, 720));
    project.edges.push({ ...project.edges[0], id: "fifth", source: "F-5" });
    expect(validateGraph(project)).toContain(
      "Mixer: connect at most four inlet streams.",
    );
    expect(() => simulate(project)).toThrow(/at most four/);
    const stream = operate(project.units[0], []).outputs[0];
    expect(() =>
      operate(newUnit("Mixer", "M", 0, 0), Array(5).fill(stream)),
    ).toThrow(/too many material inlets/);
    expect(
      projectSchema.safeParse({
        ...project,
        edges: [{ ...project.edges[0], targetPort: "in5" }],
      }).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({
        ...project,
        edges: [{ ...project.edges[0], sourcePort: "out5" }],
      }).success,
    ).toBe(false);
  });

  it("conserves flow with three outlets and the legacy fraction default", () => {
    const project = fourBranchProject();
    project.units = project.units.filter((unit) => unit.id !== "P-4");
    project.edges = project.edges.filter((edge) => edge.id !== "product-4");
    const splitter = project.units.find((unit) => unit.id === "S")!;
    splitter.params.splitFractions = undefined;
    const result = simulate(project);
    expect(
      [1, 2, 3].map((index) => flow(result.streams[`product-${index}`])),
    ).toEqual([2.5, 5, 2.5]);
    expect(Math.abs(result.massResidual)).toBeLessThan(1e-10);
    splitter.params.splitFractions = [0.2, 0.3, 0.5];
    const specified = simulate(project);
    expect(
      [1, 2, 3].map((index) => flow(specified.streams[`product-${index}`])),
    ).toEqual([2, 3, 5]);
  });

  it("requires valid fractions and connections for every positive outlet", () => {
    const project = fourBranchProject();
    project.units.find((unit) => unit.id === "S")!.params.splitFractions = [
      0.1, 0.2, 0.3, 0.5,
    ];
    expect(() => simulate(project)).toThrow(/fractions must sum to 1/);
    project.units.find((unit) => unit.id === "S")!.params.splitFractions = [
      0.1, 0.2, 0.3, 0.4,
    ];
    project.edges = project.edges.filter((edge) => edge.id !== "product-4");
    expect(validateGraph(project, true)).toContain("Splitter: connect out4.");
  });
});

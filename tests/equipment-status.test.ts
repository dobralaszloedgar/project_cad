import { describe, expect, it } from "vitest";
import {
  equipmentStatuses,
  simulationKey,
} from "../src/domain/equipment-status";
import {
  graphDiagnostics,
  newUnit,
  validateGraph,
  type Project,
} from "../src/domain/schema";
import { EquipmentSimulationError, simulate } from "../src/domain/solver";
import { defaultPackedBed } from "../src/domain/reactions/schema";
import { defaultDistillation } from "../src/domain/equipment/distillation-schema";

function fixture(): Project {
  return {
    version: 1,
    name: "Status checks",
    units: [
      newUnit("Feed", "F1", 80, 200),
      newUnit("Heater", "H1", 360, 200),
      newUnit("Product", "P1", 640, 200),
    ],
    edges: [
      {
        id: "s1",
        source: "F1",
        target: "H1",
        sourcePort: "out",
        targetPort: "in",
        color: "teal",
      },
      {
        id: "s2",
        source: "H1",
        target: "P1",
        sourcePort: "out",
        targetPort: "in",
        color: "teal",
      },
    ],
  };
}
describe("flowsheet equipment status", () => {
  it("preserves equipment identity when names match and keeps graph validation compatible", () => {
    const project = fixture();
    project.units.forEach((unit) => {
      unit.name = "Equipment";
    });
    project.edges.pop();
    const status = equipmentStatuses(project, null);
    expect(status.H1.state).toBe("unresolved");
    expect(status.H1.issues.some((issue) => issue.target.port === "out")).toBe(
      true,
    );
    expect(status.P1.issues.some((issue) => issue.target.port === "in")).toBe(
      true,
    );
    expect(status.F1.issues.some((issue) => issue.target.port)).toBe(false);
    expect(validateGraph(project, true)).toEqual([
      ...new Set(graphDiagnostics(project, true).map((issue) => issue.message)),
    ]);
  });
  it("accepts a mixer with one inlet and marks a complete unit ready", () => {
    const project = fixture();
    project.units[1].kind = "Mixer";
    expect(equipmentStatuses(project, null).H1).toEqual({
      state: "ready",
      issues: [],
    });
  });
  it("finds missing reactions and invalid feed compositions before running", () => {
    const project = fixture();
    project.units[1].kind = "PBR";
    project.units[1].params.packedBed = defaultPackedBed(["A", "B"]);
    project.units[0].params.composition = { A: 0.2, B: 0.3 };
    const status = equipmentStatuses(project, null);
    expect(status.H1.state).toBe("unresolved");
    expect(status.H1.issues).toContainEqual(
      expect.objectContaining({
        message: "Add a reaction before calculating.",
        target: { section: "reactions" },
      }),
    );
    expect(status.F1.state).toBe("invalid");
    expect(status.F1.issues[0].target.section).toBe("composition");
  });
  it("targets missing column inputs without requiring zero-flow components", () => {
    const project = fixture();
    project.units[1].kind = "Distillation";
    project.units[1].params.distillation = {
      ...defaultDistillation(["A", "B"]),
      lightKey: undefined,
      relativeVolatilities: {},
    };
    const issues = equipmentStatuses(project, null).H1.issues;
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "missing",
        target: { section: "settings", field: "distillation.lightKey" },
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        target: {
          section: "settings",
          field: "distillation.relativeVolatilities.A",
        },
      }),
    );
    expect(
      issues.some(
        (issue) => issue.target.field === "distillation.relativeVolatilities.B",
      ),
    ).toBe(false);
  });
  it("prioritizes an error over missing inputs for the red dot's destination", () => {
    const project = fixture();
    project.units[1].kind = "PBR";
    project.units[1].params.packedBed = defaultPackedBed(["A", "B"]);
    project.thermo = {
      modelId: "ideal-solution",
      mixture: "demo",
      extrapolate: false,
    };
    const status = equipmentStatuses(project, null).H1;
    expect(status.state).toBe("invalid");
    expect(status.issues[0].kind).toBe("error");
    expect(status.issues[0].target.section).toBe("thermodynamics");
    expect(status.issues.some((issue) => issue.kind === "missing")).toBe(true);
  });
  it("records the failed unit and never marks other equipment failed", () => {
    const project = fixture();
    project.units[1].params.temperature = 280;
    let failure: EquipmentSimulationError | undefined;
    try {
      simulate(project);
    } catch (error) {
      if (error instanceof EquipmentSimulationError) failure = error;
      else throw error;
    }
    expect(failure?.unitId).toBe("H1");
    expect(failure?.message).toMatch(/below inlet temperature/);
    const status = equipmentStatuses(project, null, failure);
    expect(status.H1.state).toBe("failed");
    expect(status.H1.issues[0].target).toEqual({
      section: "settings",
      field: "temperature",
    });
    expect(status.F1.state).toBe("ready");
    expect(status.P1.state).toBe("ready");
  });
  it("distinguishes up-to-date, stale and provisional calculations", () => {
    const project = fixture();
    const result = simulate(project);
    expect(equipmentStatuses(project, result).H1.state).toBe("warning");
    const withoutWarnings = {
      ...result,
      properties: Object.fromEntries(
        Object.entries(result.properties).map(([id, properties]) => [
          id,
          { ...properties, warnings: [] },
        ]),
      ),
    };
    expect(equipmentStatuses(project, withoutWarnings).H1.state).toBe(
      "calculated",
    );
    expect(equipmentStatuses(project, null, undefined, result).H1.state).toBe(
      "stale",
    );
    const provisional = equipmentStatuses(project, {
      ...result,
      converged: false,
    }).H1;
    expect(provisional.state).toBe("warning");
    expect(provisional.issues[0].message).toContain("provisional");
  });
  it("keeps calculation identity for layout and labels, but invalidates engineering changes", () => {
    const project = fixture();
    const original = simulationKey(project);
    project.units[1].position.x += 20;
    project.units[1].name = "Renamed heater";
    project.edges[0].name = "Feed line";
    project.edges[0].colorIndex = 2;
    project.units.reverse();
    project.edges.reverse();
    expect(simulationKey(project)).toBe(original);
    project.units[1].params.temperature += 20;
    expect(simulationKey(project)).not.toBe(original);
  });
});

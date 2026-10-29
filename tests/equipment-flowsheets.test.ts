import { describe, expect, it } from "vitest";
import {
  catalystExample,
  distillationExample,
  mixingExample,
  reactorExample,
  solutionExample,
  thermalCycleExample,
} from "../src/domain/examples";
import { applyActions } from "../src/domain/actions";
import { projectSchema, validateGraph } from "../src/domain/schema";
import { MODEL, simulate } from "../src/domain/solver";
import { parseImport } from "../src/lib/storage";
import { checkpoint, restore } from "../src/lib/revisions";

describe("equipment flowsheets", () => {
  it("heats by duty, cools by temperature, and closes the external energy balance", () => {
    const result = simulate(thermalCycleExample());
    expect(result.streams.heated.temperature).toBeCloseTo(400, 9);
    expect(result.streams.cooled.temperature).toBe(300);
    expect(result.equipment["H-401"].duty).toBeCloseTo(30000, 8);
    expect(result.equipment["C-401"].duty).toBeCloseTo(-30000, 8);
    expect(result.heatDuty).toBeCloseTo(0, 8);
    expect(result.massResidual).toBeCloseTo(0, 10);
    expect(result.energyResidual).toBeCloseTo(0, 8);
  });

  it("mixes and divides each species without creating material or energy", () => {
    const result = simulate(mixingExample());
    expect(result.streams.mixed.temperature).toBeCloseTo(350, 9);
    expect(result.streams.primary.a).toBeCloseTo(7.5, 10);
    expect(result.streams.primary.b).toBeCloseTo(3.75, 10);
    expect(result.streams.secondary.a).toBeCloseTo(2.5, 10);
    expect(result.streams.secondary.b).toBeCloseTo(1.25, 10);
    expect(result.massResidual).toBeCloseTo(0, 10);
    expect(result.energyResidual).toBeCloseTo(0, 8);
  });

  it("integrates two reactor feeds against an independent first-order solution", () => {
    const project = catalystExample();
    expect(validateGraph(project, true)).toEqual([]);
    const result = simulate(project);
    // Constant total molar flow: dFA/dW = -k P FA / (Ftotal R T).
    const exponent = (0.01 * 101325 * 10) / (15 * MODEL.R * 450);
    const converted = 10 * (1 - Math.exp(-exponent));
    expect(result.streams.reacted.a).toBeCloseTo(10 - converted, 6);
    expect(result.streams.reacted.b).toBeCloseTo(5 + converted, 6);
    // Second feed enters at 350 K: 5 mol/s * 30 J/mol/K * 100 K.
    expect(result.equipment["R-601"].duty).toBeCloseTo(
      15000 + converted * MODEL.reactionEnthalpy,
      2,
    );
    expect(result.massResidual).toBeCloseTo(0, 10);
    expect(result.energyResidual).toBeCloseTo(0, 6);
    expect(result.equipment["R-601"].profile?.at(-1)?.conversion).toBeCloseTo(
      converted / 10,
      6,
    );
  });

  it("conserves balances with a flow-dependent catalyst reactor inside a recycle", () => {
    const project = reactorExample();
    project.units.find((unit) => unit.kind === "PBR")!.params.reactorMode =
      "catalyst-weight";
    const result = simulate(project);
    expect(result.converged).toBe(true);
    expect(result.conversion).toBeGreaterThan(0);
    expect(result.conversion).toBeLessThan(1);
    expect(Math.abs(result.massResidual)).toBeLessThan(1e-8);
    expect(Math.abs(result.energyResidual)).toBeLessThan(0.001);
  });

  it("retains old project meaning when new mode fields are absent", () => {
    const legacy = JSON.parse(JSON.stringify(reactorExample()));
    for (const unit of legacy.units) {
      delete unit.params.reactorMode;
      delete unit.params.catalystMass;
      delete unit.params.catalystRateConstant;
      delete unit.params.thermalMode;
      delete unit.params.heatDuty;
    }
    const imported = parseImport(JSON.stringify(legacy));
    expect(simulate(imported.project).conversion).toBeCloseTo(0.7746003264, 8);
    expect(imported.project.units[3].params.reactorMode).toBe("residence-time");
  });

  it("preserves equipment modes and results across actions, export and restore", () => {
    const original = thermalCycleExample();
    const first = checkpoint(original, "Duty specification");
    const updated = applyActions(original, {
      summary: "Increase heater duty",
      actions: [{ type: "update", id: "H-401", params: { heatDuty: 45000 } }],
    });
    const imported = parseImport(JSON.stringify(updated)).project;
    expect(simulate(imported).streams.heated.temperature).toBeCloseTo(450, 9);
    const restored = restore(
      { version: 1, project: imported, revisions: [first] },
      first,
    );
    expect(simulate(restored.project).streams.heated.temperature).toBeCloseTo(
      400,
      9,
    );
    expect(original.units[1].params.heatDuty).toBe(30000);
  });

  it("all planned example topologies parse and close component and energy balances", () => {
    for (const create of [
      reactorExample,
      catalystExample,
      thermalCycleExample,
      mixingExample,
      distillationExample,
      solutionExample,
    ]) {
      const project = projectSchema.parse(create());
      const result = simulate(project);
      expect(result.converged, project.name).toBe(true);
      expect(Math.abs(result.massResidual), project.name).toBeLessThan(1e-8);
      expect(Math.abs(result.energyResidual), project.name).toBeLessThan(0.001);
    }
  });
});

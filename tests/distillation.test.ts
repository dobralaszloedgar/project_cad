import { describe, expect, it } from "vitest";
import { newUnit, projectSchema } from "../src/domain/schema";
import { applyActions } from "../src/domain/actions";
import {
  defaultDistillation,
  distillationSchema,
} from "../src/domain/equipment/distillation-schema";
import {
  solveFug,
  type MeshResult,
} from "../src/domain/equipment/distillation";
import { operate, simulate, enthalpy } from "../src/domain/solver";
import {
  defaultThermo,
  type ThermoSettings,
} from "../src/domain/thermo/registry";
import { aromaticColumnTemplate } from "../src/domain/real-chemical-templates";
import { evaluateProperties } from "../src/domain/thermo";
import { settingsFor } from "./helpers/catalog";

const feed = { a: 5, b: 5, temperature: 350, pressure: 101325 };
function fug() {
  const unit = newUnit("Distillation", "column", 0, 0);
  unit.params.distillation = defaultDistillation(["A", "B"], 2);
  return unit;
}

describe("FUG shortcut port", () => {
  it("counts the equilibrium condenser and requires vapor distillate at the specified temperature", () => {
    const project = aromaticColumnTemplate("fug");
    const config = project.units[1].params.distillation!;
    config.condenserType = "partial";
    config.distillateTemperature = 350;
    const result = simulate(project);
    expect(result.converged).toBe(true);
    expect(result.streams.distillate.vaporFraction).toBe(1);
    expect(result.equipment["D-201"].distillation!.condenserType).toBe(
      "partial",
    );
    expect(Math.abs(result.energyResidual)).toBeLessThan(0.01);
    config.distillateTemperature = 310;
    expect(() => simulate(project)).toThrow(/distillate temperature/);
  });
  it("matches the independent equimolar alpha=2 analytical reference", () => {
    const { result, outputs } = solveFug(fug(), feed, defaultThermo);
    expect(result.minimumStages).toBeCloseTo(8.49585502688717, 10);
    expect(result.underwoodRoot).toBeCloseTo(4 / 3, 12);
    expect(result.minimumRefluxRatio).toBeCloseTo(1.7, 12);
    expect(result.refluxRatio).toBeCloseTo(2.55, 12);
    expect(result.theoreticalStages).toBe(16);
    expect(outputs[0].a).toBeCloseTo(4.75, 12);
    expect(outputs[1].b).toBeCloseTo(4.75, 12);
    expect(outputs[0].a + outputs[1].a).toBe(5);
    expect(outputs[0].b + outputs[1].b).toBe(5);
  });
  it("matches the ternary reference case and closes nonkey balances", () => {
    const settings = settingsFor(["67-56-1", "64-17-5", "7732-18-5"]);
    const unit = fug();
    unit.params.distillation = {
      ...unit.params.distillation!,
      lightKey: "67-56-1",
      heavyKey: "64-17-5",
      relativeVolatilities: { "67-56-1": 2.5, "64-17-5": 1, "7732-18-5": 0.4 },
      lightRecovery: 0.96,
      heavyRecovery: 0.94,
      feedLiquidFraction: 0.65,
      refluxMultiplier: 1.6,
    };
    const inlet = {
      ...feed,
      a: 4,
      b: 4,
      components: { "67-56-1": 4, "64-17-5": 4, "7732-18-5": 2 },
    };
    const solved = solveFug(unit, inlet, settings);
    expect(solved.result.minimumStages).toBeCloseTo(6.47129665, 8);
    expect(solved.result.minimumRefluxRatio).toBeCloseTo(1.481097228, 8);
    expect(solved.result.theoreticalStages).toBe(12);
    for (const [id, n] of Object.entries(inlet.components))
      expect(
        solved.outputs[0].components![id] + solved.outputs[1].components![id],
      ).toBeCloseTo(n, 12);
    unit.params.distillation.relativeVolatilities["7732-18-5"] = 1.5;
    expect(() => solveFug(unit, inlet, settings)).toThrow(/adjacent/);
    delete unit.params.distillation.relativeVolatilities["7732-18-5"];
    expect(() => solveFug(unit, inlet, settings)).toThrow(/every active/);
  });
  it("rejects impossible keys, nonseparating recoveries, and reflux at minimum", () => {
    const unit = fug();
    unit.params.distillation!.refluxMode = "ratio";
    unit.params.distillation!.refluxRatio = 1.7;
    expect(() => solveFug(unit, feed, defaultThermo)).toThrow(/minimum reflux/);
    unit.params.distillation!.refluxRatio = 4;
    expect(
      solveFug(unit, feed, defaultThermo).result.theoreticalStages,
    ).toBeLessThan(16);
    unit.params.distillation!.lightRecovery = 0.1;
    unit.params.distillation!.heavyRecovery = 0.1;
    expect(() => solveFug(unit, feed, defaultThermo)).toThrow(/enrich/);
    unit.params.distillation!.heavyKey = "A";
    expect(() => solveFug(unit, feed, defaultThermo)).toThrow(/distinct/);
  });
});

function verifyStages(column: MeshResult, settings: ThermoSettings) {
  const F = column.feedMolS;
  for (const [j, s] of column.stages.entries()) {
    const above = column.stages[j - 1],
      below = column.stages[j + 1];
    expect(s.liquidComposition.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(s.vaporComposition.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    for (let i = 0; i < column.componentIds.length; i++) {
      const incoming =
        (above ? above.liquidMolS * above.liquidComposition[i] : 0) +
        (below ? below.vaporMolS * below.vaporComposition[i] : 0) +
        (j === column.feedTray ? F * column.feedComposition[i] : 0);
      const outgoing =
        s.liquidMolS * s.liquidComposition[i] +
        s.vaporMolS * s.vaporComposition[i] +
        (j === 0 && column.condenserType !== "partial"
          ? column.distillateMolS * s.liquidComposition[i]
          : 0);
      expect(
        Math.abs(incoming - outgoing) / (F * column.feedComposition[i]),
      ).toBeLessThan(1e-7);
    }
    const q =
      j === 0
        ? column.condenserDutyW
        : j === column.stages.length - 1
          ? column.reboilerDutyW
          : 0;
    const incomingH =
      (above ? above.liquidMolS * above.liquidEnthalpy : 0) +
      (below ? below.vaporMolS * below.vaporEnthalpy : 0) +
      (j === column.feedTray ? F * column.feedEnthalpy : 0) +
      q;
    const outgoingH =
      s.liquidMolS * s.liquidEnthalpy +
      s.vaporMolS * s.vaporEnthalpy +
      (j === 0 && column.condenserType !== "partial"
        ? column.distillateMolS * s.liquidEnthalpy
        : 0);
    expect(Math.abs(incomingH - outgoingH) / (40000 * F)).toBeLessThan(1e-7);
    // Independent property flash; no reliance on the solver-reported residuals.
    const blend = s.liquidComposition.map(
      (x, i) => (x + s.vaporComposition[i]) / 2,
    );
    const state = evaluateProperties(
      s.temperatureK,
      s.pressurePa,
      blend,
      settings,
      undefined,
      column.componentIds,
    );
    s.liquidComposition.forEach((x, i) =>
      expect(state.liquidComposition![i]).toBeCloseTo(x, 6),
    );
    s.vaporComposition.forEach((y, i) =>
      expect(state.vaporComposition![i]).toBeCloseTo(y, 6),
    );
  }
}

describe("simultaneous MESH with caloric VLE", () => {
  it.each(["ideal-solution", "modified-unifac-2.0"] as const)(
    "solves an equilibrium partial condenser with vapor distillate using %s",
    (modelId) => {
      const project = aromaticColumnTemplate("mesh");
      project.thermo!.modelId = modelId;
      const total = simulate(project).equipment["D-201"]
        .distillation as MeshResult;
      project.units[1].params.distillation!.condenserType = "partial";
      const solved = simulate(project);
      expect(solved.converged).toBe(true);
      const column = solved.equipment["D-201"].distillation as MeshResult;
      const condenser = column.stages[0];
      expect(column.condenserType).toBe("partial");
      expect(condenser.vaporMolS).toBe(column.distillateMolS);
      expect(condenser.liquidMolS / column.distillateMolS).toBeCloseTo(2.5, 10);
      expect(condenser.vaporComposition[0]).toBeGreaterThan(
        condenser.liquidComposition[0],
      );
      expect(condenser.vaporComposition[0]).toBeGreaterThan(
        total.stages[0].liquidComposition[0],
      );
      expect(solved.streams.distillate.vaporFraction).toBe(1);
      expect(solved.streams.bottoms.vaporFraction).toBe(0);
      expect(solved.streams.distillate.a / column.distillateMolS).toBeCloseTo(
        condenser.vaporComposition[0],
        10,
      );
      expect(Math.abs(solved.massResidual)).toBeLessThan(1e-8);
      expect(Math.abs(solved.energyResidual)).toBeLessThan(0.01);
      expect(Math.abs(column.condenserDutyW)).toBeLessThan(
        Math.abs(total.condenserDutyW),
      );
      verifyStages(column, project.thermo!);
    },
  );
  it("defaults older files to total and preserves a partial condenser through sparse actions and JSON", () => {
    expect(distillationSchema.parse({}).condenserType).toBe("total");
    expect(() =>
      distillationSchema.parse({ condenserType: "invalid" }),
    ).toThrow();
    const original = aromaticColumnTemplate("mesh");
    const partial = applyActions(original, {
      summary: "Use equilibrium condenser",
      actions: [
        {
          type: "update",
          id: "D-201",
          params: { distillation: { condenserType: "partial" } },
        },
      ],
    });
    expect(partial.units[1].params.distillation).toEqual({
      ...original.units[1].params.distillation,
      condenserType: "partial",
    });
    const updated = applyActions(partial, {
      summary: "Change reflux",
      actions: [
        {
          type: "update",
          id: "D-201",
          params: { distillation: { refluxRatio: 3 } },
        },
      ],
    });
    expect(
      projectSchema.parse(JSON.parse(JSON.stringify(updated))).units[1].params
        .distillation!.condenserType,
    ).toBe("partial");
  });
  it.each([
    ["total", 0.2],
    ["total", 1e-8],
    ["partial", 0.2],
    ["partial", 1e-8],
  ] as const)(
    "preserves active catalog components and exact absent species with a %s condenser and %s trace fraction",
    (condenserType, hexaneFraction) => {
      const project = aromaticColumnTemplate("mesh");
      project.units[1].params.distillation!.condenserType = condenserType;
      project.thermo = settingsFor(
        ["71-43-2", "108-88-3", "110-54-3", "7727-37-9"],
        "ideal-solution",
      );
      project.units[0].params.composition = {
        "71-43-2": 0.4,
        "108-88-3": 0.6 - hexaneFraction,
        "110-54-3": hexaneFraction,
        "7727-37-9": 0,
      };
      const result = simulate(project);
      const column = result.equipment["D-201"].distillation as MeshResult;
      expect(column.componentIds).toEqual(["71-43-2", "108-88-3", "110-54-3"]);
      for (const [id, fraction] of Object.entries(
        project.units[0].params.composition,
      )) {
        const recovered =
          result.streams.distillate.components![id] +
          result.streams.bottoms.components![id];
        if (fraction === 0) expect(recovered).toBe(0);
        else
          expect(Math.abs(recovered / (10 * fraction) - 1)).toBeLessThan(1e-7);
      }
      verifyStages(column, project.thermo);
    },
  );
  it.each(["ideal-solution", "modified-unifac-2.0"] as const)(
    "closes each tray and flowsheet with %s",
    (modelId) => {
      const project = aromaticColumnTemplate("mesh");
      project.thermo!.modelId = modelId;
      const result = simulate(project);
      expect(result.converged).toBe(true);
      expect(Math.abs(result.massResidual)).toBeLessThan(1e-8);
      expect(Math.abs(result.energyResidual)).toBeLessThan(0.01);
      const column = result.equipment["D-201"].distillation as MeshResult;
      expect(column.stages).toHaveLength(10);
      expect(column.stages[0].liquidComposition[0]).toBeGreaterThan(0.9);
      expect(column.stages.at(-1)!.liquidComposition[1]).toBeGreaterThan(0.9);
      expect(column.condenserDutyW).toBeLessThan(0);
      expect(column.reboilerDutyW).toBeGreaterThan(0);
      verifyStages(column, project.thermo!);
    },
  );
  it("responds to tray count and reflux and derives feed enthalpy from feed conditions", () => {
    const project = aromaticColumnTemplate("mesh");
    const base = simulate(project).equipment["D-201"]
      .distillation as MeshResult;
    const column = project.units[1];
    column.params.trayCount = 4;
    column.params.distillation!.feedTray = 2;
    const shorter = simulate(project).equipment[column.id]
      .distillation as MeshResult;
    expect(shorter.stages[0].liquidComposition[0]).toBeLessThan(
      base.stages[0].liquidComposition[0],
    );
    column.params.distillation!.refluxRatio = 4;
    column.params.distillation!.pressureDrop = 5000;
    project.units[0].params.temperature = 345;
    const hotter = simulate(project).equipment[column.id]
      .distillation as MeshResult;
    expect(hotter.stages[0].liquidComposition[0]).toBeGreaterThan(
      shorter.stages[0].liquidComposition[0],
    );
    expect(hotter.feedEnthalpy).not.toBeCloseTo(shorter.feedEnthalpy, 1);
    expect(hotter.stages.at(-1)!.pressurePa).toBe(60000);
    verifyStages(hotter, project.thermo!);
  });
  it("rejects unavailable thermodynamics, infeasible flows, pressure and iteration failure", () => {
    const project = aromaticColumnTemplate("mesh");
    const unit = project.units[1];
    const inlet = operate(project.units[0], [], project.thermo).outputs[0];
    expect(() =>
      operate(unit, [inlet], { ...project.thermo!, modelId: "ideal-gas" }),
    ).toThrow(/requires Raoult/);
    unit.params.distillation!.distillateFlow = 10;
    expect(() => operate(unit, [inlet], project.thermo)).toThrow(
      /less than feed/,
    );
    unit.params.distillation!.distillateFlow = 5;
    unit.params.distillation!.feedTray = 9;
    expect(() => operate(unit, [inlet], project.thermo)).toThrow(/Feed tray/);
    unit.params.distillation!.feedTray = 4;
    unit.params.distillation!.maxIterations = 1;
    expect(() => operate(unit, [inlet], project.thermo)).toThrow(/CONVERGENCE/);
    unit.params.distillation!.maxIterations = 200;
    unit.params.pressure = 80000;
    expect(() => operate(unit, [inlet], project.thermo)).toThrow(
      /Feed pressure/,
    );
    unit.params.pressure = 200000;
    unit.params.distillation!.pressureDrop = 1;
    expect(() =>
      operate(unit, [{ ...inlet, pressure: 200000 }], project.thermo),
    ).toThrow(/1–200 kPa/);
  });
  it("persists modes through actions/JSON and retains legacy behavior", () => {
    const project = aromaticColumnTemplate("fug");
    const mesh = applyActions(project, {
      summary: "Use MESH",
      actions: [
        {
          type: "update",
          id: "D-201",
          params: {
            distillation: {
              ...project.units[1].params.distillation!,
              method: "mesh",
            },
          },
        },
      ],
    });
    const restored = projectSchema.parse(JSON.parse(JSON.stringify(mesh)));
    expect(restored.units[1].params.distillation).toEqual(
      mesh.units[1].params.distillation,
    );
    const legacy = fug();
    delete legacy.params.distillation;
    expect(operate(legacy, [feed]).result.distillation).toBeUndefined();
    const specified = operate(fug(), [feed]);
    expect(specified.result.duty).toBeCloseTo(
      specified.outputs.reduce((s, v) => s + enthalpy(v), 0) - enthalpy(feed),
      7,
    );
  });
});

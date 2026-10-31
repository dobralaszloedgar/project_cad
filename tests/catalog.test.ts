import { describe, expect, it } from "vitest";
import fixture from "./fixtures/catalog-reference.json";
import { selectParameters } from "../src/domain/thermo/data";
import {
  referenceChemicals,
  referenceParameters,
  settingsFor,
} from "./helpers/catalog";
import {
  evaluateProperties,
  flashPressureEnthalpy,
  provenance,
} from "../src/domain/thermo";
import { defaultThermo, thermoSchema } from "../src/domain/thermo/registry";
import { enthalpy, operate, simulate } from "../src/domain/solver";
import { newUnit, projectSchema } from "../src/domain/schema";
import { applyActions } from "../src/domain/actions";
import { solutionExample } from "../src/domain/examples";
import { availableModels } from "../src/domain/thermo/availability";

describe("published catalog correlations", () => {
  it.each(fixture.gas)(
    "matches independent gas enthalpy for $id at $temperature K",
    (row) => {
      const chemical = referenceChemicals.find((c) => c.id === row.id)!;
      const provider = {
        version: "reference",
        get: () => chemical,
        search: () => [chemical],
      };
      const state = evaluateProperties(
        row.temperature,
        101325,
        [1],
        defaultThermo,
        provider,
        [row.id],
      );
      expect(state.molarEnthalpy).toBeCloseTo(row.enthalpy, 6);
      const inverse = flashPressureEnthalpy(
        101325,
        row.enthalpy,
        [1],
        defaultThermo,
        provider,
        [row.id],
      );
      expect(inverse.temperature).toBeCloseTo(row.temperature, 6);
      expect(Math.abs(inverse.enthalpyResidual!)).toBeLessThan(1e-4);
    },
  );
  it.each(fixture.liquid)(
    "matches independent liquid properties for $ids at $temperature K ($composition)",
    (row) => {
      for (const model of ["ideal-solution", "modified-unifac-2.0"] as const) {
        const settings = settingsFor(row.ids, model);
        const state = evaluateProperties(
          row.temperature,
          200000,
          row.composition,
          settings,
        );
        expect(state.phase).toBe("liquid");
        expect(state.molarEnthalpy).toBeCloseTo(
          model === "ideal-solution" ? row.idealEnthalpy : row.modifiedEnthalpy,
          5,
        );
        row.psat.forEach((p, i) =>
          expect(state.saturationPressures![i]).toBeCloseTo(p, 5),
        );
        row.gamma.forEach((g, i) =>
          expect(state.activityCoefficients[i]).toBeCloseTo(
            model === "ideal-solution" ? 1 : g,
            9,
          ),
        );
      }
    },
  );
  it("uses real Cp for mixing and specified duty, and closes energy", () => {
    const settings = settingsFor(["64-17-5", "7727-37-9"]);
    const inputs = [
      { a: 2, b: 0, temperature: 300, pressure: 101325 },
      { a: 0, b: 3, temperature: 750, pressure: 101325 },
    ];
    const mixed = operate(newUnit("Mixer", "m", 0, 0), inputs, settings)
      .outputs[0];
    expect(enthalpy(mixed, settings)).toBeCloseTo(
      inputs.reduce((sum, s) => sum + enthalpy(s, settings), 0),
      5,
    );
    expect(Math.abs(mixed.temperature - 570)).toBeGreaterThan(1);
    const heater = newUnit("Heater", "h", 0, 0);
    heater.params.thermalMode = "duty";
    heater.params.heatDuty = 5000;
    const heated = operate(heater, [mixed], settings);
    expect(heated.result.duty).toBeCloseTo(5000, 5);
  });
  it("saves catalog records through actions, JSON export and recalculation", () => {
    const settings = settingsFor(
      ["71-43-2", "108-88-3"],
      "modified-unifac-2.0",
    );
    const project = applyActions(solutionExample(), {
      summary: "Use database records",
      actions: [{ type: "set_thermo_model", ...settings }],
    });
    const restored = projectSchema.parse(JSON.parse(JSON.stringify(project)));
    expect(restored.thermo?.catalog).toEqual(settings.catalog);
    const result = simulate(restored);
    expect(result.converged).toBe(true);
    expect(Math.abs(result.massResidual)).toBeLessThan(1e-8);
    expect(Math.abs(result.energyResidual)).toBeLessThan(1e-5);
    expect(result.provenance.dataVersion).toBe(settings.catalog!.release);
    expect(result.provenance.parameterHash).toBe(
      settings.catalog!.parameters!.hash,
    );
    expect(result.provenance.chemicalIds).toEqual(["71-43-2", "108-88-3"]);
  });
  it("does not substitute samples for missing, corrupt or unsupported catalog data", () => {
    const settings = settingsFor(
      ["67-56-1", "7732-18-5"],
      "modified-unifac-2.0",
    );
    const interactions = settings.catalog!.parameters!.dataset.interactions;
    delete interactions[Object.keys(interactions)[0]];
    expect(() => evaluateProperties(330, 101325, [0.5, 0.5], settings)).toThrow(
      /integrity/,
    );
    expect(() =>
      evaluateProperties(330, 101325, [0.5, 0.5], {
        ...settings,
        catalog: undefined,
      }),
    ).toThrow(/Select/);
    const missing = settingsFor(["67-56-1", "7732-18-5"]);
    expect(() =>
      evaluateProperties(330, 101325, [0.5, 0.5], {
        ...missing,
        modelId: "modified-unifac-2.0",
      }),
    ).toThrow(/Reload/);
    const oxygen = referenceChemicals.find((c) => c.id === "7782-44-7")!;
    expect(availableModels(oxygen, referenceParameters)).toEqual(["ideal-gas"]);
  });
  it("rejects duplicate components, missing directed pairs and invalid temperature ranges", () => {
    const duplicate = settingsFor(["64-17-5", "64-17-5"]);
    expect(() => provenance(duplicate)).toThrow(/different/);
    const data = structuredClone(referenceParameters);
    const pair = [
      referenceChemicals.find((c) => c.id === "64-17-5")!,
      referenceChemicals.find((c) => c.id === "7732-18-5")!,
    ];
    delete data.interactions["5"]["7"];
    expect(() => selectParameters(pair, data)).toThrow(/5 → 7/);
    const settings = settingsFor(["67-56-1", "7732-18-5"], "ideal-solution");
    expect(() =>
      evaluateProperties(700, 101325, [0.5, 0.5], {
        ...settings,
        extrapolate: true,
      }),
    ).toThrow(/critical/);
    expect(
      thermoSchema.safeParse({
        ...settings,
        catalog: { ...settings.catalog, release: "latest" },
      }).success,
    ).toBe(false);
  });
  it("rechecks an edited selection instead of reusing stale cached data", () => {
    const settings = settingsFor(["64-17-5", "7732-18-5"]);
    evaluateProperties(330, 101325, [0.5, 0.5], settings);
    settings.modelId = "modified-unifac-2.0";
    expect(() => evaluateProperties(330, 101325, [0.5, 0.5], settings)).toThrow(
      /Reload/,
    );
    settings.modelId = "ideal-gas";
    settings.catalog!.chemicals[0].molecularWeight *= 2;
    expect(() => evaluateProperties(330, 101325, [0.5, 0.5], settings)).toThrow(
      /integrity/,
    );
  });
});

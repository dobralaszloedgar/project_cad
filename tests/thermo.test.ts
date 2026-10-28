import { describe, expect, it } from "vitest";
import { evaluateProperties } from "../src/domain/thermo";
import {
  models,
  defaultThermo,
  type ThermoSettings,
} from "../src/domain/thermo/registry";
import { sampleCatalog } from "../src/domain/thermo/catalog";
import {
  solutionExample,
  reactorExample,
  heatingExample,
} from "../src/domain/examples";
import { simulate, streamProperties, volume } from "../src/domain/solver";
import { applyActions } from "../src/domain/actions";
import { diff } from "../src/lib/revisions";
import { parseImport } from "../src/lib/storage";
import reference from "./fixtures/modified-unifac-reference.json";

const raoult: ThermoSettings = {
  modelId: "ideal-solution",
  mixture: "aromatics",
  extrapolate: false,
};
const modified: ThermoSettings = { ...raoult, modelId: "modified-unifac-2.0" };

describe("three-model Rust thermodynamics kernel", () => {
  it("matches 18 independent activity and excess-enthalpy reference states", () => {
    for (const row of reference.rows) {
      const settings: ThermoSettings = {
        ...modified,
        mixture: row.mixture as ThermoSettings["mixture"],
      };
      const actual = evaluateProperties(
        row.temperature,
        200000,
        row.composition,
        settings,
      );
      const ideal = evaluateProperties(
        row.temperature,
        200000,
        row.composition,
        { ...settings, modelId: "ideal-solution" },
      );
      expect(actual.phase).toBe("liquid");
      for (let i = 0; i < 2; i++)
        expect(actual.activityCoefficients[i]).toBeCloseTo(row.gamma[i], 10);
      expect(actual.molarEnthalpy! - ideal.molarEnthalpy!).toBeCloseTo(
        row.excessEnthalpy,
        7,
      );
    }
  });
  it("exposes exactly the requested methods", () => {
    expect(models.map((m) => m.id)).toEqual([
      "ideal-gas",
      "ideal-solution",
      "modified-unifac-2.0",
    ]);
  });
  it("matches ideal-gas volume, Dalton pressures and referenced enthalpy", () => {
    const p = evaluateProperties(400, 100000, [0.25, 0.75]);
    expect(p.phase).toBe("vapor");
    expect(p.gasMolarVolume).toBeCloseTo(0.0332578504726, 12);
    expect(p.partialPressures).toEqual([25000, 75000]);
    expect(p.molarEnthalpy).toBeCloseTo(30 * (400 - 298.15) - 0.75 * 20000, 8);
  });
  it("checks NIST pressures and binary flash against the analytic RR solution", () => {
    // Outside the benzene overlap: compare directly to the unblended source fit.
    const p = evaluateProperties(330, 25000, [0.5, 0.5], raoult);
    const pa = 1e5 * 10 ** (4.01814 - 1203.835 / (330 - 53.226));
    const pb = 1e5 * 10 ** (4.07827 - 1343.943 / (330 - 53.773));
    expect(p.saturationPressures![0]).toBeCloseTo(pa, 7);
    expect(p.saturationPressures![1]).toBeCloseTo(pb, 7);
    const ka = pa / 25000,
      kb = pb / 25000;
    const beta = -(0.5 * (ka - 1) + 0.5 * (kb - 1)) / ((ka - 1) * (kb - 1));
    expect(p.vaporFraction).toBeCloseTo(beta, 11);
    expect(p.phase).toBe("two-phase");
    expect(p.gasMolarVolume).toBeNull();
    expect(
      volume({ a: 5, b: 5, temperature: 350, pressure: 55000 }, raoult),
    ).toBeNull();
    for (let i = 0; i < 2; i++) {
      expect(
        (1 - beta) * p.liquidComposition![i] + beta * p.vaporComposition![i],
      ).toBeCloseTo(0.5, 11);
      expect(p.vaporComposition![i] * 25000).toBeCloseTo(
        p.liquidComposition![i] * p.saturationPressures![i],
        6,
      );
    }
  });
  it("handles single phases, pure feeds and undefined zero-flow composition", () => {
    expect(evaluateProperties(350, 150000, [0.5, 0.5], raoult).phase).toBe(
      "liquid",
    );
    expect(evaluateProperties(350, 10000, [0.5, 0.5], raoult).phase).toBe(
      "vapor",
    );
    for (const settings of [raoult, modified]) {
      for (const z of [
        [1, 0],
        [0, 1],
      ]) {
        const p = evaluateProperties(350, 55000, z, settings);
        expect(p.componentResidual).toBeLessThan(1e-10);
        expect(p.activityCoefficients).toEqual([1, 1]);
      }
    }
    const empty = streamProperties(
      { a: 0, b: 0, temperature: 350, pressure: 55000 },
      raoult,
    );
    expect(empty.phase).toBe("empty");
    expect(empty.vaporFraction).toBeNull();
    expect(empty.molarEnthalpy).toBeNull();
  });
  it("rejects invalid states, missing data and implicit extrapolation", () => {
    for (const z of [
      [-0.1, 1.1],
      [0.4, 0.4],
      [NaN, 1],
    ])
      expect(() => evaluateProperties(350, 55000, z, raoult)).toThrow();
    expect(() => evaluateProperties(0, 55000, [0.5, 0.5])).toThrow();
    expect(() => evaluateProperties(350, 0, [0.5, 0.5])).toThrow();
    expect(() => evaluateProperties(350, 500000, [0.5, 0.5], raoult)).toThrow(
      /1–200/,
    );
    expect(() => evaluateProperties(390, 55000, [0.5, 0.5], raoult)).toThrow(
      /vapor-pressure/,
    );
    const p = evaluateProperties(390, 55000, [0.5, 0.5], {
      ...raoult,
      extrapolate: true,
    });
    expect(p.warnings.some((w) => w.includes("extrapolated"))).toBe(true);
    expect(() =>
      evaluateProperties(350, 55000, [0.5, 0.5], {
        ...modified,
        mixture: "demo",
      }),
    ).toThrow();
  });
  it("reports saturation without inventing a phase amount", () => {
    const pressure = 1e5 * 10 ** (4.01814 - 1203.835 / (330 - 53.226));
    const p = evaluateProperties(330, pressure, [1, 0], raoult);
    expect(p.phase).toBe("saturation");
    expect(p.vaporFraction).toBeNull();
    expect(p.molarEnthalpy).toBeNull();
  });
  it("warns for ideal ethanol/water and returns genuinely nonideal predictions", () => {
    const ideal = evaluateProperties(350, 100000, [0.5, 0.5], {
      ...raoult,
      mixture: "aqueous",
    });
    const nonideal = evaluateProperties(350, 100000, [0.5, 0.5], {
      ...modified,
      mixture: "aqueous",
    });
    expect(ideal.warnings.join(" ")).toContain("azeotrope");
    expect(
      nonideal.activityCoefficients.some((g) => Math.abs(g - 1) > 0.1),
    ).toBe(true);
    expect(nonideal.componentResidual).toBeLessThan(1e-8);
    expect(nonideal.equilibriumResidual).toBeLessThan(1e-9);
  });
  it("uses a provider independently of catalog size and rejects missing group coverage", () => {
    const provider = {
      ...sampleCatalog,
      get: (id: string) => ({ ...sampleCatalog.get(id), groups: undefined }),
    };
    expect(() =>
      evaluateProperties(350, 55000, [0.5, 0.5], modified, provider),
    ).toThrow(/group assignment/);
    const unknownGroup = {
      ...sampleCatalog,
      get: (id: string) => ({ ...sampleCatalog.get(id), groups: { "999": 1 } }),
    };
    expect(() =>
      evaluateProperties(350, 55000, [0.5, 0.5], modified, unknownGroup),
    ).toThrow(/subgroup/);
    expect(sampleCatalog.search("toluene").map((c) => c.id)).toEqual([
      "toluene",
    ]);
  });
});

describe("flowsheet model integration", () => {
  it.each([raoult, modified])(
    "includes phase-change enthalpy in heating with $modelId",
    (settings) => {
      const project = heatingExample();
      project.thermo = settings;
      project.units[0].params.temperature = 330;
      project.units[0].params.pressure = 55000;
      project.units[0].params.fractionA = 0.5;
      project.units[1].params.temperature = 365;
      const result = simulate(project);
      expect(result.properties.s1.phase).toBe("liquid");
      expect(result.properties.s2.phase).toBe("vapor");
      expect(result.heatDuty).toBeGreaterThan(200000);
      expect(Math.abs(result.energyResidual)).toBeLessThan(1e-6);
    },
  );
  it.each([raoult, modified])(
    "closes the sample separation with $modelId",
    (settings) => {
      const project = solutionExample();
      project.thermo = settings;
      const r = simulate(project);
      expect(r.converged).toBe(true);
      expect(r.provenance.modelId).toBe(settings.modelId);
      expect(r.streams.distillate.a + r.streams.bottoms.a).toBeCloseTo(5, 8);
      expect(r.streams.distillate.b + r.streams.bottoms.b).toBeCloseTo(5, 8);
      expect(Math.abs(r.massResidual)).toBeLessThan(1e-8);
      expect(Math.abs(r.energyResidual)).toBeLessThan(1e-5);
      expect(r.properties.s1.phase).toBe("two-phase");
      expect(r.properties.distillate.phase).toBe("vapor");
      expect(r.properties.bottoms.phase).toBe("liquid");
    },
  );
  it("persists explicit actions and exposes model changes in comparisons", () => {
    const original = solutionExample();
    const changed = applyActions(original, {
      summary: "Change model",
      actions: [{ type: "set_thermo_model", ...modified }],
    });
    expect(original.thermo?.modelId).toBe("ideal-solution");
    expect(diff(original, changed).modelChanged).toBe(true);
    expect(parseImport(JSON.stringify(changed)).project).toEqual(changed);
    expect(() =>
      applyActions(original, {
        summary: "Invalid",
        actions: [
          {
            type: "set_thermo_model",
            ...modified,
            modelId: "unknown" as never,
          },
        ],
      }),
    ).toThrow();
  });
  it("preserves legacy ideal-gas projects and rejects unsupported reactions", () => {
    const project = reactorExample();
    expect(simulate(project).provenance.modelId).toBe(defaultThermo.modelId);
    project.thermo = modified;
    expect(() => simulate(project)).toThrow();
  });
});

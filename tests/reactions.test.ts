import { describe, expect, it } from "vitest";
import { newUnit, projectSchema, validateGraph } from "../src/domain/schema";
import { applyActions } from "../src/domain/actions";
import { enthalpy, flow, operate, simulate } from "../src/domain/solver";
import { solvePackedBed } from "../src/domain/reactions/packed-bed";
import {
  defaultPackedBed,
  reactionSchema,
} from "../src/domain/reactions/schema";
import { compileRateExpression } from "../src/domain/reactions/rateExpression";
import {
  compileRateLaw,
  defaultRateLaw,
} from "../src/domain/reactions/rateLaw";
import {
  formulaElements,
  packedBedIssues,
} from "../src/domain/reactions/validation";
import { sampleChemicals } from "../src/domain/thermo/catalog";
import { componentFlows } from "../src/domain/stream-composition";
import { reactionProject } from "./helpers/reactions";
import { settingsFor } from "./helpers/catalog";

const chemicals = sampleChemicals.slice(0, 2).map((c) => ({ ...c }));
const initial = { A: 5, B: 0 };
function config() {
  const result = defaultPackedBed(["A", "B"]);
  result.flowModel = "constant-flow";
  result.volumetricFlow = 1;
  result.reactions = [
    reactionSchema.parse({
      id: "reaction-1",
      name: "First-order conversion",
      basisComponentId: "A",
      stoichiometry: [
        { componentId: "A", coefficient: -1 },
        { componentId: "B", coefficient: 1 },
      ],
      rateConstant: 0.1,
    }),
  ];
  return result;
}

describe("coupled packed-bed reactions", () => {
  it.each([0, 0.5, 1, 2, 3])(
    "matches an independent power-law balance for order %s",
    (order) => {
      const spec = config();
      spec.reactions[0].order = order;
      spec.catalystMass = 0.5;
      const expected =
        order === 1
          ? 5 * Math.exp(-0.1 * 0.5)
          : (5 ** (1 - order) - (1 - order) * 0.1 * 0.5) ** (1 / (1 - order));
      const bed = solvePackedBed(spec, chemicals, initial, 450, 101325);
      expect(bed.flows.A).toBeCloseTo(expected, 8);
      expect(bed.flows.A + bed.flows.B).toBeCloseTo(5, 12);
    },
  );
  it("matches ideal-gas expansion for non-equimolar stoichiometry", () => {
    const spec = config();
    spec.flowModel = "ideal-gas";
    spec.reactions[0].stoichiometry[1].coefficient = 2;
    const species = [
      { ...chemicals[0], molecularWeight: 0.028 },
      { ...chemicals[1], molecularWeight: 0.014 },
    ];
    const bed = solvePackedBed(spec, species, initial, 450, 101325);
    // For A -> 2B: k P W/(F_A0 RT) = -2 ln(1-X) - X.
    const exposure =
      (0.1 * 101325 * spec.catalystMass) / (5 * 8.31446261815324 * 450);
    expect(-2 * Math.log1p(-bed.conversion) - bed.conversion).toBeCloseTo(
      exposure,
      8,
    );
  });
  it("sizes the bed analytically and honors the prescribed outlet pressure", () => {
    const spec = config();
    spec.sizingMode = "target-conversion";
    spec.targetConversion = 0.7;
    expect(
      solvePackedBed(spec, chemicals, initial, 450, 101325).catalystMass,
    ).toBeCloseTo(-Math.log(0.3) / 0.1, 7);
    spec.flowModel = "ideal-gas";
    spec.pressureDrop = 20000;
    const bed = solvePackedBed(spec, chemicals, initial, 450, 101325);
    const expected =
      (-Math.log(0.3) * 5 * 8.31446261815324 * 450) / (0.1 * (101325 - 10000));
    expect(bed.catalystMass).toBeCloseTo(expected, 7);
    expect(bed.pressure).toBe(81325);
    expect(bed.conversion).toBeCloseTo(0.7, 8);
  });
  it("solves competing reactions together and retains disabled reactions", () => {
    const spec = config();
    spec.reactions.push({
      ...structuredClone(spec.reactions[0]),
      id: "second",
      name: "Second reaction",
      rateConstant: 0.2,
    });
    let bed = solvePackedBed(spec, chemicals, initial, 450, 101325);
    expect(bed.flows.A).toBeCloseTo(5 * Math.exp(-3), 8);
    expect(bed.extents.second / bed.extents[spec.reactions[0].id]).toBeCloseTo(
      2,
      10,
    );
    spec.reactions[1].enabled = false;
    bed = solvePackedBed(spec, chemicals, initial, 450, 101325);
    expect(bed.flows.A).toBeCloseTo(5 * Math.exp(-1), 8);
    expect(bed.extents.second).toBe(0);
  });
  it("resolves consecutive reactions when the intermediate is absent at the inlet", () => {
    const species = ["a", "b", "c", "inert"].map((id) => ({
      id,
      name: id,
      formula: "C2H6O",
      molecularWeight: 0.046,
      cp: 30,
      formationEnthalpy: 0,
      antoine: [],
    }));
    const spec = config();
    spec.conversionComponentId = "a";
    spec.reactions = [
      ["a", "b", 0.1],
      ["b", "c", 0.2],
    ].map(([from, to, k], i) =>
      reactionSchema.parse({
        id: `r${i}`,
        name: `Reaction ${i}`,
        basisComponentId: from,
        rateConstant: k,
        stoichiometry: [
          { componentId: from, coefficient: -1 },
          { componentId: to, coefficient: 1 },
        ],
      }),
    );
    const bed = solvePackedBed(
      spec,
      species,
      { a: 5e-8, b: 0, c: 0, inert: 100 },
      450,
      101325,
    );
    expect(bed.flows.a / (5e-8 * Math.exp(-1))).toBeCloseTo(1, 8);
    expect(bed.flows.b / (5e-8 * (Math.exp(-1) - Math.exp(-2)))).toBeCloseTo(
      1,
      8,
    );
    expect(bed.flows.inert).toBe(100);
  });
  it("approaches reversible equilibrium from either direction", () => {
    const spec = config();
    const law = defaultRateLaw("A", true, 0.2);
    law.variables.push({
      symbol: "b",
      componentId: "B",
      basis: "concentration",
      unit: "mol/m3",
    });
    law.reversible = true;
    law.reverse = [{ variable: "b", order: 1 }];
    law.parameters[1].value = 0.1;
    spec.reactions[0].rateLaw = law;
    for (const a of [0, 5]) {
      const bed = solvePackedBed(
        spec,
        chemicals,
        { A: a, B: 5 - a },
        450,
        101325,
      );
      expect(bed.flows.A).toBeCloseTo(5 / 3 + (a - 5 / 3) * Math.exp(-3), 8);
    }
    spec.sizingMode = "target-conversion";
    spec.targetConversion = 0.9;
    expect(() => solvePackedBed(spec, chemicals, initial, 450, 101325)).toThrow(
      /unreachable|integration|step limit/i,
    );
  });
  it("rejects invalid stoichiometry, missing thermochemistry and infeasible depletion", () => {
    const project = reactionProject();
    const spec = project.units[1].params.packedBed!;
    const species = project.thermo!.catalog!.chemicals;
    spec.reactions[0].stoichiometry[0].coefficient = -1;
    expect(packedBedIssues(spec, species).join(" ")).toMatch(
      /atoms do not balance/,
    );
    spec.reactions[0].stoichiometry[0].coefficient = -2;
    expect(
      packedBedIssues(
        spec,
        species.map((c) => ({ ...c, formationEnthalpy: undefined })),
      ).join(" "),
    ).toMatch(/formation enthalpy/);
    const depleted = config();
    depleted.reactions[0].order = 0;
    depleted.reactions[0].rateConstant = 10;
    expect(() =>
      solvePackedBed(depleted, chemicals, initial, 450, 101325),
    ).toThrow(/depletion|integration/i);
  });
  it("keeps zero rate and zero inventory unchanged", () => {
    const spec = config();
    spec.reactions[0].rateConstant = 0;
    expect(solvePackedBed(spec, chemicals, initial, 450, 101325).flows).toEqual(
      initial,
    );
    expect(
      solvePackedBed(spec, chemicals, { A: 0, B: 0 }, 450, 101325).flows,
    ).toEqual({ A: 0, B: 0 });
  });
});

describe("multicomponent flowsheet integration", () => {
  it("couples multiple reactants using an independently integrated second-order law", () => {
    const project = reactionProject();
    const config = project.units[1].params.packedBed!;
    const reaction = config.reactions[0];
    reaction.basisComponentId = "64-17-5";
    reaction.stoichiometry = reaction.stoichiometry.map((row) => ({
      ...row,
      coefficient: -row.coefficient,
    }));
    const law = defaultRateLaw("64-17-5", true, 0.1);
    law.variables.push({
      symbol: "water",
      componentId: "7732-18-5",
      basis: "concentration",
      unit: "mol/m3",
    });
    law.forward.push({ variable: "water", order: 1 });
    reaction.rateLaw = law;
    config.conversionComponentId = "64-17-5";
    const bed = solvePackedBed(
      config,
      project.thermo!.catalog!.chemicals,
      { "67-56-1": 0, "64-17-5": 1, "7732-18-5": 0.2, "7727-37-9": 4 },
      450,
      101325,
    );
    const ratio = 0.2 * Math.exp(-0.8 * 0.1 * 10);
    const remainingWater = (0.8 * ratio) / (1 - ratio);
    expect(bed.flows["7732-18-5"]).toBeCloseTo(remainingWater, 8);
    expect(bed.flows["64-17-5"]).toBeCloseTo(remainingWater + 0.8, 8);
    expect(bed.flows["67-56-1"]).toBeCloseTo(2 * (0.2 - remainingWater), 8);
  });
  it("persists reactions and computes every product, inert, reaction duty and balance", () => {
    const project = reactionProject();
    const updated = applyActions(project, {
      summary: "Size catalyst",
      actions: [
        {
          type: "update",
          id: "R-101",
          params: {
            packedBed: {
              ...project.units[1].params.packedBed!,
              sizingMode: "target-conversion",
              targetConversion: 0.5,
            },
          },
        },
      ],
    });
    const result = simulate(
      projectSchema.parse(JSON.parse(JSON.stringify(updated))),
    );
    const values = result.streams.product.components!;
    expect(values["67-56-1"]).toBeCloseTo(3, 8);
    expect(values["64-17-5"]).toBeCloseTo(1.5, 8);
    expect(values["7732-18-5"]).toBeCloseTo(1.5, 8);
    expect(values["7727-37-9"]).toBe(4);
    expect(flow(result.streams.product)).toBeCloseTo(10, 10);
    expect(Math.abs(result.energyResidual)).toBeLessThan(1e-6);
    expect(Math.abs(result.massResidual)).toBeLessThan(1e-6);
    expect(result.equipment["R-101"].packedBed!.catalystMass).toBeCloseTo(
      Math.log(2) / 0.1,
      7,
    );
  });
  it("mixes, heats, splits and separates every component without dropping inventory", () => {
    const project = reactionProject();
    const settings = project.thermo!;
    const inlet = simulate(project).streams.product;
    const mixer = operate(
      newUnit("Mixer", "m", 0, 0),
      [inlet, { ...inlet, temperature: 500 }],
      settings,
    );
    expect(flow(mixer.outputs[0])).toBeCloseTo(20, 10);
    expect(enthalpy(mixer.outputs[0], settings)).toBeCloseTo(
      enthalpy(inlet, settings) +
        enthalpy({ ...inlet, temperature: 500 }, settings),
      5,
    );
    for (const kind of ["Heater", "Splitter", "Distillation"] as const) {
      const unit = newUnit(kind, "unit", 0, 0);
      unit.params.temperature = 550;
      const op = operate(unit, mixer.outputs, settings);
      for (const [id, amount] of Object.entries(mixer.outputs[0].components!))
        expect(
          op.outputs.reduce((sum, s) => sum + s.components![id], 0),
        ).toBeCloseTo(amount, 8);
    }
  });
  it("resolves a multicomponent recycle and balances the external streams", () => {
    const project = reactionProject();
    project.units.push(
      newUnit("Mixer", "mix", 0, 0),
      newUnit("Splitter", "split", 0, 0),
      newUnit("Product", "purge", 0, 0),
    );
    project.edges[0].target = "mix";
    project.edges[1].target = "split";
    project.edges.push(
      ...([
        {
          id: "mixed",
          source: "mix",
          target: "R-101",
          sourcePort: "out",
          targetPort: "in",
        },
        {
          id: "recycle",
          source: "split",
          target: "mix",
          sourcePort: "out2",
          targetPort: "in2",
        },
        {
          id: "final",
          source: "split",
          target: "P-101",
          sourcePort: "out",
          targetPort: "in",
        },
      ].map((edge) => ({
        ...edge,
        color: "teal" as const,
      })) as typeof project.edges),
    );
    project.units = project.units.filter((unit) => unit.id !== "purge");
    const result = simulate(project);
    expect(result.converged).toBe(true);
    expect(result.streams.final.components!["7727-37-9"]).toBeCloseTo(4, 7);
    expect(Math.abs(result.massResidual)).toBeLessThan(1e-6);
    expect(Math.abs(result.energyResidual)).toBeLessThan(0.01);
  });
  it("normalizes feed ratios and rejects references to removed components", () => {
    const project = reactionProject();
    project.units[0].params.composition!["67-56-1"] = 0.1;
    expect(simulate(project).converged).toBe(true);
    project.units[0].params.composition = { removed: 1 };
    expect(() => simulate(project)).toThrow(/removed component/);
  });
  it("supports three-component liquid flashes with species conservation", () => {
    const settings = settingsFor(
      ["71-43-2", "108-88-3", "110-54-3"],
      "ideal-solution",
    );
    const stream = {
      a: 3,
      b: 3,
      components: { "71-43-2": 3, "108-88-3": 3, "110-54-3": 4 },
      temperature: 350,
      pressure: 101325,
    };
    const output = operate(
      newUnit("Distillation", "d", 0, 0),
      [stream],
      settings,
    ).outputs;
    for (const [id, n] of Object.entries(stream.components))
      expect(
        output.reduce(
          (sum, s) =>
            sum + componentFlows(s, Object.keys(stream.components))[id],
          0,
        ),
      ).toBeCloseTo(n, 10);
  });
  it("accepts independent feeds directly into a configured reactor", () => {
    const project = reactionProject();
    const second = newUnit("Feed", "second", 0, 0);
    second.params.composition = {
      "67-56-1": 0,
      "64-17-5": 0,
      "7732-18-5": 0,
      "7727-37-9": 1,
    };
    project.units.push(second);
    project.edges.push({
      id: "second-feed",
      source: "second",
      sourcePort: "out",
      target: "R-101",
      targetPort: "in",
      color: "teal",
    });
    expect(validateGraph(project, true)).toEqual([]);
    expect(simulate(project).streams.product.components!["7727-37-9"]).toBe(14);
  });
});

describe("rate laws and validation", () => {
  it("converts concentration, rate and mass units consistently", () => {
    const law = defaultRateLaw("A", true, 0.1);
    const state = {
      flows: initial,
      volumetricFlow: 1,
      temperature: 450,
      pressure: 101325,
    };
    expect(compileRateLaw(law, chemicals, true)(state)).toBeCloseTo(0.5, 12);
    law.variables[0].unit = "mol/L";
    law.rateUnit = "kmol/(kg*s)";
    expect(compileRateLaw(law, chemicals, true)(state)).toBeCloseTo(0.5, 12);
    law.variables[0].basis = "mass-concentration";
    law.variables[0].unit = "kg/m3";
    law.rateUnit = "mol/(kg*s)";
    expect(compileRateLaw(law, chemicals, true)(state)).toBeCloseTo(0.014, 12);
  });
  it("evaluates inhibition expressions and rejects executable input", () => {
    expect(
      compileRateExpression("kf*a/(1+K*a)^2", ["kf", "a", "K"])({
        kf: 2,
        a: 3,
        K: 0.5,
      }),
    ).toBeCloseTo(0.96, 12);
    for (const text of [
      "globalThis.process.exit()",
      "a.constructor",
      "a; alert(1)",
      "a['x']",
    ])
      expect(() => compileRateExpression(text, ["a"])).toThrow();
  });
  it("checks grouped molecular formulas", () => {
    expect(formulaElements("Ca(OH)2")).toEqual({ Ca: 1, O: 2, H: 2 });
    expect(formulaElements("CuSO4·5H2O")).toEqual({ Cu: 1, S: 1, O: 9, H: 10 });
    expect(() => formulaElements("Fe3+")).toThrow();
  });
});

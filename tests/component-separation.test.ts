// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { describe, expect, it } from "vitest";
import { methanolRecycleTemplate } from "../src/domain/process-templates";
import { aromaticColumnTemplate } from "../src/domain/real-chemical-templates";
import {
  enthalpy,
  flow,
  operate,
  simulate,
  streamProperties,
  type Stream,
} from "../src/domain/solver";
import { newUnit, projectSchema } from "../src/domain/schema";
import { equipmentSetupIssues } from "../src/domain/equipment-status";
import { unitThermoSettings } from "../src/domain/thermo/flowsheet-models";

const inlet: Stream = {
  a: 8,
  b: 72,
  temperature: 430,
  pressure: 1500000,
  components: {
    "124-38-9": 8,
    "1333-74-0": 72,
    "630-08-0": 15,
    "7440-37-1": 5,
    "67-56-1": 4,
    "7732-18-5": 1,
  },
};
const setup = () => {
  const project = methanolRecycleTemplate();
  return {
    project,
    settings: project.thermo!,
    unit: project.units.find((unit) => unit.id === "S-703")!,
  };
};

describe("specified component recovery and branch thermodynamics", () => {
  it("conserves each species and includes cooling and latent heat across gas/liquid branches", () => {
    const { unit, settings } = setup();
    const {
      outputs: [gas, liquid],
      result,
    } = operate(unit, [inlet], settings);
    expect(flow(gas)).toBeCloseTo(100.05, 10);
    expect(flow(liquid)).toBeCloseTo(4.95, 10);
    for (const [id, amount] of Object.entries(inlet.components!))
      expect(gas.components![id] + liquid.components![id]).toBeCloseTo(
        amount,
        12,
      );
    expect(streamProperties(gas, settings).phase).toBe("vapor");
    expect(streamProperties(liquid, settings).phase).toBe("liquid");
    expect(result.duty).toBeCloseTo(
      enthalpy(gas, settings) +
        enthalpy(liquid, settings) -
        enthalpy(inlet, settings),
      8,
    );
    const gasOnlyLiquidEnthalpy = enthalpy(
      { ...liquid, propertyModel: "ideal-gas" },
      settings,
    );
    // ~35–44 kJ/mol latent heats must not disappear into ideal-gas calorics.
    expect(gasOnlyLiquidEnthalpy - enthalpy(liquid, settings)).toBeGreaterThan(
      150000,
    );
    expect(result.duty).toBeLessThan(-400000);
  });

  it("retains the liquid model through cooling, splitting, mixing and a second column", () => {
    const { unit, settings } = setup();
    const liquid = operate(unit, [inlet], settings).outputs[1];
    const cooler = newUnit("Cooler", "C", 0, 0);
    cooler.params.temperature = 320;
    const cooled = operate(cooler, [liquid], settings).outputs[0];
    const branches = operate(
      newUnit("Splitter", "S", 0, 0),
      [cooled],
      settings,
    ).outputs;
    const mixed = operate(newUnit("Mixer", "M", 0, 0), branches, settings)
      .outputs[0];
    expect(mixed.propertyModel).toBe("ideal-solution");
    expect(streamProperties(mixed, settings).phase).toBe("liquid");
    expect(enthalpy(mixed, settings)).toBeCloseTo(
      enthalpy(cooled, settings),
      4,
    );
    const column = setup().project.units.find((item) => item.id === "D-702")!;
    const solved = operate(column, [mixed], settings);
    expect(solved.result.distillation?.method).toBe("mesh");
    expect(
      solved.outputs.every(
        (stream) => stream.propertyModel === "ideal-solution",
      ),
    ).toBe(true);
  });

  it("rejects silent model mixing, missing recoveries, pressure increases and unsupported liquid components", () => {
    const { unit, settings } = setup();
    const outputs = operate(unit, [inlet], settings).outputs;
    expect(() =>
      operate(newUnit("Mixer", "M", 0, 0), outputs, settings),
    ).toThrow(/property models differ/);
    delete unit.params.componentSplit!.recoveries["67-56-1"];
    expect(() => operate(unit, [inlet], settings)).toThrow(
      /Specify outlet 1 recovery/,
    );
    unit.params.componentSplit = setup().unit.params.componentSplit;
    unit.params.componentSplit!.outlets[0].pressure = 1600000;
    expect(() => operate(unit, [inlet], settings)).toThrow(
      /cannot raise outlet pressure/,
    );
    unit.params.componentSplit = setup().unit.params.componentSplit;
    unit.params.componentSplit!.recoveries["1333-74-0"] = 0.99;
    expect(() => operate(unit, [inlet], settings)).toThrow(/vapor-pressure/);
  });

  it("resolves both property models before calculation, including the gas recycle", () => {
    const { project } = setup();
    for (const unit of project.units)
      expect(equipmentSetupIssues(project, unit), unit.id).toEqual([]);
    expect(unitThermoSettings(project, "R-701").modelId).toBe("ideal-gas");
    expect(unitThermoSettings(project, "D-701").modelId).toBe("ideal-solution");
    expect(unitThermoSettings(project, "D-702").modelId).toBe("ideal-solution");
    expect(unitThermoSettings(project, "P-702").modelId).toBe("ideal-solution");
  });
});

it("closes a recycle before evaluating a downstream MESH draw that exceeds the startup flow", () => {
  const project = aromaticColumnTemplate("mesh");
  const feed = project.units.find((unit) => unit.kind === "Feed")!;
  const column = project.units.find((unit) => unit.kind === "Distillation")!;
  column.params.distillation!.distillateFlow = 7.5;
  const mixer = newUnit("Mixer", "M", 200, 0);
  const splitter = newUnit("Splitter", "S", 400, 0);
  splitter.params.splitFractions = [0.5, 0.5];
  project.units.push(mixer, splitter);
  const original = project.edges.find((edge) => edge.source === feed.id)!;
  original.target = mixer.id;
  project.edges.push(
    {
      id: "mixed",
      source: "M",
      target: "S",
      sourcePort: "out",
      targetPort: "in",
      color: "teal",
    },
    {
      id: "column-feed",
      source: "S",
      target: column.id,
      sourcePort: "out",
      targetPort: "in",
      color: "teal",
    },
    {
      id: "recycle",
      source: "S",
      target: "M",
      sourcePort: "out2",
      targetPort: "in2",
      color: "teal",
    },
  );
  expect(feed.params.flow / 2).toBeLessThan(7.5);
  const result = simulate(projectSchema.parse(project));
  expect(result.converged).toBe(true);
  expect(flow(result.streams["column-feed"])).toBeCloseTo(10, 7);
  expect(result.equipment[column.id].distillation?.method).toBe("mesh");
  expect(Math.abs(result.massResidual)).toBeLessThan(1e-8);
  expect(Math.abs(result.energyResidual)).toBeLessThan(0.01);
});

import { describe, expect, it } from "vitest";
import { newUnit, type Project } from "../src/domain/schema";
import {
  enthalpy,
  flow,
  MODEL,
  operate,
  rate,
  simulate,
  streamProperties,
  volume,
  type Stream,
} from "../src/domain/solver";
import {
  defaultThermo,
  type ThermoSettings,
} from "../src/domain/thermo/registry";
import { solutionExample } from "../src/domain/examples";

const gas = { ...defaultThermo, mixture: "aromatics" } satisfies ThermoSettings;
const inlet: Stream = { a: 2, b: 3, temperature: 350, pressure: 100000 };

describe("specified heating and cooling duty", () => {
  it.each([
    ["Heater", 23800, 400],
    ["Cooler", -11900, 325],
  ] as const)(
    "uses the selected component heat capacities for %s",
    (kind, duty, temperature) => {
      const unit = newUnit(kind, "thermal", 0, 0);
      unit.params.thermalMode = "duty";
      unit.params.heatDuty = duty;
      unit.params.temperature = 700; // Inactive in specified-duty mode.
      const result = operate(unit, [inlet], gas);
      expect(result.outputs[0]).toEqual({ ...inlet, temperature });
      expect(result.result.duty).toBeCloseTo(duty, 8);
      expect(
        enthalpy(result.outputs[0], gas) - enthalpy(inlet, gas),
      ).toBeCloseTo(duty, 8);
    },
  );

  it("only uses the selected temperature specification", () => {
    const heater = newUnit("Heater", "heater", 0, 0);
    heater.params.temperature = 400;
    heater.params.heatDuty = -1e8;
    const result = operate(heater, [inlet], gas);
    expect(result.outputs[0].temperature).toBe(400);
    expect(result.result.duty).toBeCloseTo(23800, 8);
  });

  it("rejects incompatible signs, unsupported liquid duty and out-of-range solutions", () => {
    for (const kind of ["Heater", "Cooler"] as const) {
      const unit = newUnit(kind, kind, 0, 0);
      unit.params.thermalMode = "duty";
      unit.params.heatDuty = kind === "Heater" ? -100 : 100;
      expect(() => operate(unit, [inlet])).toThrow(/duty/);
      unit.params.heatDuty *= -1;
      expect(() =>
        operate(unit, [inlet], { ...gas, modelId: "ideal-solution" }),
      ).toThrow(/outlet temperature/);
      unit.params.heatDuty = kind === "Heater" ? 1e8 : -1e8;
      expect(() => operate(unit, [inlet])).toThrow(/250–800/);
    }
  });

  it("does not invent a temperature for nonzero duty with no flow", () => {
    const heater = newUnit("Heater", "heater", 0, 0);
    heater.params.thermalMode = "duty";
    const empty = { ...inlet, a: 0, b: 0 };
    expect(operate(heater, [empty]).outputs[0]).toEqual(empty);
    heater.params.heatDuty = 1;
    expect(() => operate(heater, [empty])).toThrow(/requires material flow/);
  });
});

describe("catalyst-weight packed-bed equation", () => {
  it("retains relative accuracy for very small positive conversions", () => {
    const unit = newUnit("PBR", "reactor", 0, 0);
    unit.params.reactorMode = "catalyst-weight";
    unit.params.catalystRateConstant = 1e-10;
    unit.params.catalystMass = 1e-4;
    const feed = { a: 1000, b: 0, temperature: 450, pressure: 10000 };
    const result = operate(unit, [feed]);
    const expected = -Math.expm1(
      -(1e-10 * 1e4 * 1e-4) / (1000 * MODEL.R * 450),
    );
    expect(result.result.conversion).toBeGreaterThan(0);
    expect(result.result.conversion! / expected).toBeCloseTo(1, 12);
    expect(result.result.extent / (1000 * expected)).toBeCloseTo(1, 12);
  });
  it.each([
    [1, 450, 101325, 10],
    [20, 450, 101325, 10],
    [5, 600, 200000, 50],
    [1000, 250, 10000, 0],
    [0.001, 800, 2000000, 10000],
  ])(
    "matches the independent analytic first-order solution at F=%s, T=%s, P=%s, W=%s",
    (total, temperature, pressure, mass) => {
      const reactor = newUnit("PBR", "reactor", 0, 0);
      reactor.params.reactorMode = "catalyst-weight";
      reactor.params.temperature = temperature;
      reactor.params.catalystMass = mass;
      const feed = { a: 0.7 * total, b: 0.3 * total, temperature, pressure };
      const result = operate(reactor, [feed]);
      const k =
        0.01 * Math.exp((-40000 / MODEL.R) * (1 / temperature - 1 / 450));
      const coefficient = (k * pressure) / (total * MODEL.R * temperature);
      const expected = -Math.expm1(-coefficient * mass);
      expect(result.result.conversion).toBeCloseTo(expected, 8);
      expect(flow(result.outputs[0])).toBeCloseTo(total, 10);
      expect(result.result.extent).toBeCloseTo(feed.a * expected, 7);
      expect(result.result.duty).toBeCloseTo(-20000 * result.result.extent, 6);
      const profile = result.result.profile!;
      expect(profile).toHaveLength(41);
      expect(profile[0]).toEqual({ catalystMass: 0, conversion: 0 });
      expect(profile.at(-1)!.catalystMass).toBe(mass);
      for (let i = 0; i < profile.length; i++) {
        expect(profile[i].conversion).toBeCloseTo(
          -Math.expm1(-coefficient * profile[i].catalystMass),
          8,
        );
        expect(profile[i].conversion).toBeGreaterThanOrEqual(
          i ? profile[i - 1].conversion : 0,
        );
        expect(profile[i].conversion).toBeLessThanOrEqual(1);
      }
    },
  );

  it("responds to catalyst mass, concentration, flow and temperature", () => {
    const unit = newUnit("PBR", "reactor", 0, 0);
    unit.params.reactorMode = "catalyst-weight";
    const feed = { ...inlet, a: 5, b: 0, temperature: 450 };
    const baseline = operate(unit, [feed]).result.conversion!;
    expect(operate(unit, [{ ...feed, a: 10 }]).result.conversion).toBeLessThan(
      baseline,
    );
    expect(
      operate(unit, [{ ...feed, pressure: 200000 }]).result.conversion,
    ).toBeGreaterThan(baseline);
    unit.params.catalystMass = 20;
    expect(operate(unit, [feed]).result.conversion).toBeGreaterThan(baseline);
    unit.params.catalystMass = 10;
    unit.params.temperature = 500;
    expect(operate(unit, [feed]).result.conversion).toBeGreaterThan(baseline);
  });

  it("has no reaction for empty streams or no reactant", () => {
    const unit = newUnit("PBR", "reactor", 0, 0);
    unit.params.reactorMode = "catalyst-weight";
    for (const b of [0, 3]) {
      const result = operate(unit, [
        { a: 0, b, temperature: 450, pressure: 101325 },
      ]);
      expect(result.result.extent).toBe(0);
      expect(result.result.conversion).toBe(0);
      expect(result.result.duty).toBe(0);
      expect(result.result.profile!.every((p) => p.conversion === 0)).toBe(
        true,
      );
      expect(flow(result.outputs[0])).toBe(b);
    }
  });

  it("preserves the residence-time surrogate as a separately named model", () => {
    const unit = newUnit("PBR", "reactor", 0, 0);
    unit.params.reactorMode = "residence-time";
    const result = operate(unit, [{ ...inlet, temperature: 450 }]);
    expect(result.result.conversion).toBeCloseTo(
      1 - Math.exp(-rate(450) * 10),
      12,
    );
    expect(result.result.profile).toBeUndefined();
  });

  it("mixes two physical inlets and closes the complete reactor energy balance", () => {
    const unit = newUnit("PBR", "reactor", 0, 0);
    const feeds = [
      { a: 3, b: 0, temperature: 300, pressure: 200000 },
      { a: 0, b: 2, temperature: 600, pressure: 100000 },
    ];
    const result = operate(unit, feeds);
    const output = result.outputs[0];
    expect(flow(output)).toBeCloseTo(5, 12);
    expect(output.pressure).toBe(100000);
    expect(output.a).toBeCloseTo(3 - result.result.extent, 12);
    expect(output.b).toBeCloseTo(2 + result.result.extent, 12);
    expect(
      enthalpy(output) - feeds.reduce((sum, s) => sum + enthalpy(s), 0),
    ).toBeCloseTo(result.result.duty, 8);
  });
});

describe("equipment boundaries and flowsheet conservation", () => {
  it("ignores zero-flow recycle guesses in mixer pressure and enthalpy", () => {
    const mixer = newUnit("Mixer", "mixer", 0, 0);
    const real = { ...inlet, pressure: 200000 };
    const zero = { a: 0, b: 0, temperature: 300, pressure: 10000 };
    expect(operate(mixer, [real, zero], gas).outputs[0]).toEqual(real);
  });

  it("uses enthalpy instead of arithmetic temperature when component heat capacities differ", () => {
    const mixer = newUnit("Mixer", "mixer", 0, 0);
    const inputs = [
      { a: 2, b: 0, temperature: 300, pressure: 200000 },
      { a: 0, b: 3, temperature: 500, pressure: 100000 },
    ];
    const result = operate(mixer, inputs, gas);
    expect(result.outputs[0].temperature).toBeCloseTo(
      (2 * 82 * 300 + 3 * 104 * 500) / (2 * 82 + 3 * 104),
      10,
    );
    expect(enthalpy(result.outputs[0], gas)).toBeCloseTo(
      inputs.reduce((sum, s) => sum + enthalpy(s, gas), 0),
      8,
    );
  });

  it("rejects wrong inlet counts and nonphysical standalone inputs", () => {
    expect(() => operate(newUnit("Feed", "feed", 0, 0), [inlet])).toThrow(
      /inlets/,
    );
    expect(() =>
      operate(newUnit("Heater", "heater", 0, 0), [inlet, inlet]),
    ).toThrow(/inlets/);
    expect(() =>
      operate(newUnit("PBR", "reactor", 0, 0), [inlet, inlet, inlet]),
    ).toThrow(/inlets/);
    expect(() => operate(newUnit("Product", "product", 0, 0), [])).toThrow(
      /missing inlet/,
    );
    for (const bad of [
      { ...inlet, a: -1 },
      { ...inlet, b: NaN },
      { ...inlet, pressure: 0 },
      { ...inlet, temperature: 900 },
    ])
      expect(() =>
        operate(newUnit("Splitter", "splitter", 0, 0), [bad]),
      ).toThrow(/Nonphysical stream/);
  });

  it("enforces selected thermodynamic ranges at pass-through unit boundaries", () => {
    const settings: ThermoSettings = { ...gas, modelId: "ideal-solution" };
    for (const kind of [
      "Product",
      "Mixer",
      "Splitter",
      "Distillation",
    ] as const) {
      const unit = newUnit(kind, kind, 0, 0);
      expect(() =>
        operate(unit, [{ ...inlet, pressure: 500000 }], settings),
      ).toThrow(/1–200/);
      expect(() =>
        operate(unit, [{ ...inlet, temperature: 400 }], settings),
      ).toThrow(/vapor-pressure/);
    }
  });

  it("does not treat cancelling negative components as an empty physical stream", () => {
    const invalid = { ...inlet, a: -1, b: 1 };
    for (const evaluate of [enthalpy, volume, streamProperties])
      expect(() => evaluate(invalid)).toThrow(/Nonphysical stream/);
    expect(() => enthalpy({ ...inlet, a: 0, b: 0, temperature: NaN })).toThrow(
      /Nonphysical stream/,
    );
  });

  it.each(["ideal-solution", "modified-unifac-2.0"] as const)(
    "separates equilibrium phases without inventing heat for %s",
    (modelId) => {
      const project = solutionExample();
      project.thermo!.modelId = modelId;
      const result = simulate(project);
      expect(result.equipment["D-201"].duty).toBe(0);
      expect(result.properties.distillate.phase).toBe("vapor");
      expect(result.properties.bottoms.phase).toBe("liquid");
      expect(Math.abs(result.energyResidual)).toBeLessThan(1e-5);
    },
  );

  it("preserves component and energy balances in a two-feed catalyst reactor flowsheet", () => {
    const first = newUnit("Feed", "first", 0, 0);
    const second = newUnit("Feed", "second", 0, 150);
    second.params.fractionA = 0;
    second.params.temperature = 600;
    const project: Project = {
      version: 1,
      name: "Two-feed reactor",
      units: [
        first,
        second,
        newUnit("PBR", "reactor", 200, 0),
        newUnit("Product", "product", 400, 0),
      ],
      edges: [
        {
          id: "a",
          source: "first",
          target: "reactor",
          sourcePort: "out",
          targetPort: "in",
          color: "teal",
        },
        {
          id: "b",
          source: "second",
          target: "reactor",
          sourcePort: "out",
          targetPort: "in2",
          color: "blue",
        },
        {
          id: "out",
          source: "reactor",
          target: "product",
          sourcePort: "out",
          targetPort: "in",
          color: "teal",
        },
      ],
    };
    const result = simulate(project);
    expect(result.converged).toBe(true);
    expect(flow(result.streams.out)).toBeCloseTo(20, 10);
    expect(result.massResidual).toBeCloseTo(0, 10);
    expect(result.energyResidual).toBeCloseTo(0, 7);
    expect(streamProperties(result.streams.out).phase).toBe("vapor");
  });
});

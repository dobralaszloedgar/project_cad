import { describe, expect, it } from "vitest";
import {
  evaluateProperties,
  flashPressureEnthalpy,
} from "../src/domain/thermo";
import { sampleCatalog } from "../src/domain/thermo/catalog";
import { type ThermoSettings } from "../src/domain/thermo/registry";
import { enthalpy, operate, streamProperties } from "../src/domain/solver";
import { newUnit } from "../src/domain/schema";

const ideal: ThermoSettings = {
  modelId: "ideal-solution",
  mixture: "aromatics",
  extrapolate: false,
};
const modified: ThermoSettings = { ...ideal, modelId: "modified-unifac-2.0" };
const aqueous: ThermoSettings = { ...modified, mixture: "aqueous" };

describe("continuous vapor-pressure and caloric curves", () => {
  it("keeps the sample liquid enthalpy increasing through the benzene overlap", () => {
    let previous = -Infinity;
    for (let t = 333; t <= 355; t += 0.25) {
      const h = evaluateProperties(t, 200000, [1, 0], ideal).molarEnthalpy!;
      expect(h).toBeGreaterThan(previous);
      previous = h;
    }
  });
  it.each([333.4, 354.07])(
    "is continuous in pressure, enthalpy and heat capacity at %s K",
    (t) => {
      const step = 1e-4;
      const states = [-2, -1, 0, 1, 2].map((i) =>
        evaluateProperties(t + i * step, 200000, [1, 0], ideal),
      );
      const h = states.map((s) => s.molarEnthalpy!);
      expect(Math.abs(h[3] - h[1])).toBeLessThan(0.1);
      expect(
        Math.abs(
          states[3].saturationPressures![0] - states[1].saturationPressures![0],
        ),
      ).toBeLessThan(1);
      const cpLeft = (h[1] - h[0]) / step;
      const cpRight = (h[4] - h[3]) / step;
      expect(cpLeft).toBeGreaterThan(0);
      expect(Math.abs(cpLeft - cpRight)).toBeLessThan(0.1);
    },
  );

  it.each([334, 340, 350, 354, 360])(
    "uses the same pressure curve derivative for latent heat at %s K",
    (t) => {
      const h = 1e-3;
      const lo = evaluateProperties(t - h, 200000, [1, 0], ideal);
      const hi = evaluateProperties(t + h, 200000, [1, 0], ideal);
      const liquid = evaluateProperties(t, 200000, [1, 0], ideal);
      const gas = evaluateProperties(t, 1000, [1, 0], ideal);
      const derivative =
        (Math.log(hi.saturationPressures![0]) -
          Math.log(lo.saturationPressures![0])) /
        (2 * h);
      expect(gas.molarEnthalpy! - liquid.molarEnthalpy!).toBeCloseTo(
        8.31446261815324 * t * t * derivative,
        3,
      );
    },
  );

  it.each([303.5, 333.5])(
    "covers the former water gap at %s K without extrapolation",
    (t) => {
      const state = evaluateProperties(t, 100000, [0.5, 0.5], aqueous);
      expect(state.phase).toBe("liquid");
      expect(state.warnings.join(" ")).not.toContain("extrapolated");
      expect(state.molarEnthalpy).toBeTypeOf("number");
    },
  );

  it("matches water saturation reference pressures and enforces physical limits", () => {
    // IAPWS SR1-86(1992) saturation-pressure values, rounded to millipascals.
    for (const [t, p] of [
      [273.16, 611.657],
      [300, 3536.718],
      [373.15, 101417.994],
    ]) {
      const state = evaluateProperties(t, 200000, [0, 1], aqueous);
      expect(state.saturationPressures![1]).toBeCloseTo(p, 2);
    }
    for (const t of [270, 650])
      expect(() =>
        evaluateProperties(t, 100000, [0, 1], {
          ...aqueous,
          extrapolate: true,
        }),
      ).toThrow(/IAPWS/);
  });

  it("rejects a true data gap in a custom provider", () => {
    const provider = {
      ...sampleCatalog,
      get: (id: string) => ({
        ...sampleCatalog.get(id),
        antoine: sampleCatalog
          .get(id)
          .antoine.slice(0, 1)
          .flatMap((a) => [
            { ...a, min: 310, max: 320 },
            { ...a, min: 340, max: 350 },
          ]),
      }),
    };
    const target = evaluateProperties(
      330,
      200000,
      [0.5, 0.5],
      ideal,
    ).molarEnthalpy!;
    expect(() =>
      flashPressureEnthalpy(200000, target, [0.5, 0.5], ideal, provider),
    ).toThrow(/outside.*ranges/);
  });
});

describe("pressure–enthalpy flash and mixer conservation", () => {
  it("inverts ideal-gas enthalpy and keeps extrapolation explicit for liquids", () => {
    const h = evaluateProperties(400, 100000, [0.25, 0.75]).molarEnthalpy!;
    expect(
      flashPressureEnthalpy(100000, h, [0.25, 0.75]).temperature,
    ).toBeCloseTo(400, 10);
    const extrapolated = { ...ideal, extrapolate: true };
    const outsideH = evaluateProperties(
      390,
      55000,
      [0.5, 0.5],
      extrapolated,
    ).molarEnthalpy!;
    expect(() =>
      flashPressureEnthalpy(55000, outsideH, [0.5, 0.5], ideal),
    ).toThrow(/outside/);
    const ph = flashPressureEnthalpy(55000, outsideH, [0.5, 0.5], extrapolated);
    expect(ph.temperature).toBeCloseTo(390, 7);
    expect(ph.warnings.join(" ")).toContain("extrapolated");
  });

  it("rejects invalid or inconsistent retained vapor fractions", () => {
    for (const vaporFraction of [-0.1, 1.1, NaN, 0.5])
      expect(() =>
        streamProperties(
          { a: 1, b: 1, temperature: 330, pressure: 200000, vaporFraction },
          ideal,
        ),
      ).toThrow(/vapor fraction/);
  });
  it.each([ideal, modified])(
    "round trips liquid, two-phase and vapor states with $modelId",
    (settings) => {
      for (const [t, p] of [
        [330, 55000],
        [350, 55000],
        [365, 55000],
      ]) {
        const tp = evaluateProperties(t, p, [0.5, 0.5], settings);
        const ph = flashPressureEnthalpy(
          p,
          tp.molarEnthalpy!,
          [0.5, 0.5],
          settings,
        );
        expect(ph.temperature).toBeCloseTo(t, 7);
        expect(ph.phase).toBe(tp.phase);
        expect(ph.vaporFraction).toBeCloseTo(tp.vaporFraction!, 7);
        expect(Math.abs(ph.enthalpyResidual!)).toBeLessThan(1e-6);
      }
    },
  );

  it("mixes equal-temperature ethanol and water with the predicted temperature change", () => {
    const inputs = [
      { a: 1, b: 0, temperature: 350, pressure: 200000 },
      { a: 0, b: 1, temperature: 350, pressure: 200000 },
    ];
    const {
      outputs: [out],
      result,
    } = operate(newUnit("Mixer", "m", 0, 0), inputs, aqueous);
    expect(out.temperature).toBeLessThan(350);
    expect(out.temperature).toBeGreaterThan(340);
    expect(out.a).toBe(1);
    expect(out.b).toBe(1);
    expect(result.duty).toBe(0);
    expect(
      Math.abs(
        enthalpy(out, aqueous) -
          inputs.reduce((s, x) => s + enthalpy(x, aqueous), 0),
      ),
    ).toBeLessThan(2e-6);
  });

  it.each([ideal, modified])(
    "preserves a saturated mixer stream through splitting, heating and phase separation with $modelId",
    (settings) => {
      const pressure = 1e5 * 10 ** (4.01814 - 1203.835 / (330 - 53.226));
      const inputs = [
        { a: 1, b: 0, temperature: 320, pressure },
        { a: 1, b: 0, temperature: 340, pressure },
      ];
      const {
        outputs: [out],
      } = operate(newUnit("Mixer", "m", 0, 0), inputs, settings);
      expect(out.temperature).toBeCloseTo(330, 6);
      expect(streamProperties(out, settings).phase).toBe("two-phase");
      expect(out.vaporFraction).toBeGreaterThan(0.4);
      expect(out.vaporFraction).toBeLessThan(0.6);
      const target = inputs.reduce((sum, s) => sum + enthalpy(s, settings), 0);
      expect(Math.abs(enthalpy(out, settings) - target)).toBeLessThan(2e-6);
      for (const kind of ["Splitter", "Distillation"] as const) {
        const op = operate(newUnit(kind, kind, 0, 0), [out], settings);
        expect(
          Math.abs(
            op.outputs.reduce((sum, s) => sum + enthalpy(s, settings), 0) -
              target,
          ),
        ).toBeLessThan(2e-6);
        if (kind === "Distillation") {
          expect(streamProperties(op.outputs[0], settings).phase).toBe("vapor");
          expect(streamProperties(op.outputs[1], settings).phase).toBe(
            "liquid",
          );
        }
      }
      const heater = newUnit("Heater", "h", 0, 0);
      heater.params.temperature = 360;
      const heated = operate(heater, [out], settings);
      expect(streamProperties(heated.outputs[0], settings).phase).toBe("vapor");
      expect(heated.result.duty).toBeGreaterThan(0);
      expect(
        Math.abs(
          enthalpy(heated.outputs[0], settings) - target - heated.result.duty,
        ),
      ).toBeLessThan(2e-6);
    },
  );

  it("ignores inactive component ranges and rejects unreachable or invalid targets", () => {
    const h = evaluateProperties(300, 200000, [1, 0], ideal).molarEnthalpy!;
    expect(
      flashPressureEnthalpy(200000, h, [1, 0], ideal).temperature,
    ).toBeCloseTo(300, 7);
    expect(() =>
      flashPressureEnthalpy(200000, -1e9, [0.5, 0.5], ideal),
    ).toThrow(/outside/);
    expect(() => flashPressureEnthalpy(200000, NaN, [0.5, 0.5], ideal)).toThrow(
      /enthalpy/,
    );
    expect(() => flashPressureEnthalpy(0, h, [1, 0], ideal)).toThrow(
      /pressure/,
    );
    expect(() => flashPressureEnthalpy(200000, h, [-1, 2], ideal)).toThrow(
      /fractions/,
    );
  });
});

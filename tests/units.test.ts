import { describe, expect, it } from "vitest";
import { UNIT_SYSTEMS } from "../src/domain/unit-definitions";
import {
  matchingPreset,
  parseUnitPreferences,
  presetPreferences,
  unitsFor,
} from "../src/domain/unit-preferences";
import { fromSI, toSI } from "../src/domain/units";

describe("engineering unit conversions", () => {
  it("converts absolute temperatures separately from temperature differences", () => {
    expect(fromSI(273.15, "degC")).toBeCloseTo(0, 10);
    expect(fromSI(273.15, "degF")).toBeCloseTo(32, 10);
    expect(toSI(212, "degF")).toBeCloseTo(373.15, 10);
    expect(toSI(491.67, "degR")).toBeCloseTo(273.15, 10);
    expect(fromSI(10, "deltaF")).toBeCloseTo(18, 10);
    expect(toSI(10, "deltaC")).toBe(10);
  });

  it("uses the site reference only for gauge pressures", () => {
    expect(fromSI(101325, "barg")).toBe(0);
    expect(toSI(-0.5, "barg")).toBe(51325);
    expect(fromSI(200000, "barg", 80000)).toBeCloseTo(1.2);
    expect(toSI(0, "psig", 80000)).toBe(80000);
    expect(fromSI(100000, "bar", 80000)).toBe(1);
    expect(fromSI(101325, "psi")).toBeCloseTo(14.6959488, 6);
    expect(unitsFor("pressureDifference")).not.toContain("psig");
    expect(unitsFor("pressureDifference")).toContain("psi");
  });

  it("converts engineering flow, energy, mass and time quantities", () => {
    expect(toSI(36, "kmol/h")).toBeCloseTo(10, 12);
    expect(toSI(1, "lbmol/h")).toBeCloseTo(453.59237 / 3600, 12);
    expect(toSI(3600, "lb/h")).toBeCloseTo(0.45359237, 12);
    expect(fromSI(1000, "Btu/h")).toBeCloseTo(3412.141633, 5);
    expect(toSI(-45, "kW")).toBe(-45000);
    expect(toSI(60, "L/min")).toBeCloseTo(0.001, 12);
    expect(toSI(1, "ft3/min")).toBeCloseTo(0.0004719474432, 12);
    expect(toSI(1, "lb")).toBe(0.45359237);
    expect(toSI(2, "min")).toBe(120);
    expect(toSI(50, "kJ/mol")).toBe(50000);
  });
});

describe("unit preferences", () => {
  it("starts with Metric engineering and valid units for every preset", () => {
    expect(parseUnitPreferences(undefined)).toEqual(
      presetPreferences("metric"),
    );
    for (const system of Object.keys(
      UNIT_SYSTEMS,
    ) as (keyof typeof UNIT_SYSTEMS)[]) {
      const preferences = presetPreferences(system);
      expect(matchingPreset(preferences.units)).toBe(system);
      for (const dimension of Object.keys(
        preferences.units,
      ) as (keyof typeof preferences.units)[])
        expect(unitsFor(dimension)).toContain(preferences.units[dimension]);
    }
  });

  it("retains compatible custom settings and discards invalid stored values", () => {
    const preferences = parseUnitPreferences({
      system: "us",
      units: {
        temperature: "K",
        pressure: "barg",
        pressureDifference: "barg",
        molarFlow: "kg/h",
        mass: "unknown",
      },
      atmosphere: 85000,
    });
    expect(preferences.units.temperature).toBe("K");
    expect(preferences.units.pressure).toBe("barg");
    expect(preferences.units.pressureDifference).toBe("psi");
    expect(preferences.units.molarFlow).toBe("lbmol/h");
    expect(preferences.units.mass).toBe("lb");
    expect(preferences.atmosphere).toBe(85000);
    expect(matchingPreset(preferences.units)).toBeUndefined();
    for (const value of [
      null,
      [],
      "invalid",
      { system: "unknown", atmosphere: -1 },
      { atmosphere: Infinity },
    ])
      expect(parseUnitPreferences(value)).toEqual(presetPreferences("metric"));
    preferences.units.temperature = "degC";
    expect(presetPreferences("us").units.temperature).toBe("degF");
  });
});

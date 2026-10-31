import { unitSchema, type Kind, type Unit } from "./schema";
import type { ThermoSettings } from "./thermo/registry";

/** Template recipes are pinned independently of the editor's new-unit defaults. */
const recipe: Readonly<Unit["params"]> = {
  temperature: 450,
  pressure: 101325,
  flow: 10,
  fractionA: 1,
  residenceTime: 10,
  reactorMode: "catalyst-weight",
  catalystMass: 10,
  catalystRateConstant: 0.01,
  thermalMode: "temperature",
  heatDuty: 0,
  recycleFraction: 0.5,
  relativeVolatility: 3,
  distillateFraction: 0.5,
  trayCount: 8,
};

export function templateParams(
  kind: Kind,
  overrides: Partial<Unit["params"]> = {},
): Unit["params"] {
  return {
    ...recipe,
    temperature: kind === "Feed" || kind === "Cooler" ? 300 : 450,
    ...overrides,
  };
}

export function templateUnit(
  kind: Kind,
  id: string,
  x: number,
  y: number,
  overrides: Partial<Unit["params"]> = {},
): Unit {
  return unitSchema.parse({
    id,
    kind,
    name: kind === "PBR" ? "Packed-bed reactor" : kind,
    position: { x, y },
    params: templateParams(kind, overrides),
  });
}

// This pair selects the implemented first-order A → B reaction and its
// built-in property data. It must never be substituted with real chemicals.
export function syntheticThermo(): ThermoSettings {
  return { modelId: "ideal-gas", mixture: "demo", extrapolate: false };
}

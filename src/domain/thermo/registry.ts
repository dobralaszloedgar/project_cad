import { z } from "zod";
export const modelIds = [
  "ideal-gas",
  "ideal-solution",
  "modified-unifac-2.0",
] as const;
export type ModelId = (typeof modelIds)[number];
export const thermoSchema = z
  .object({
    modelId: z.enum(modelIds),
    mixture: z.enum(["demo", "aromatics", "aqueous"]),
    extrapolate: z.boolean().default(false),
  })
  .strict();
export type ThermoSettings = z.infer<typeof thermoSchema>;
export const defaultThermo: ThermoSettings = {
  modelId: "ideal-gas",
  mixture: "demo",
  extrapolate: false,
};
export const models = [
  {
    id: "ideal-gas",
    name: "Ideal gas",
    description: "PV = nRT; partial pressures and constant-Cp enthalpy.",
    version: "1.0.0",
    pressureRange: [1, 1e8],
    source: "Ideal-gas equation of state",
    limitations: "Vapor only; does not predict condensation.",
  },
  {
    id: "ideal-solution",
    name: "Ideal solution · Raoult’s law",
    description: "Antoine vapor pressures and a bracketed TP flash.",
    version: "1.0.0",
    pressureRange: [1000, 200000],
    source: "NIST Chemistry WebBook Antoine records",
    limitations:
      "Ideal liquid and vapor; no azeotropes or liquid–liquid equilibrium.",
  },
  {
    id: "modified-unifac-2.0",
    name: "Modified UNIFAC 2.0",
    description:
      "Group activity coefficients and low-pressure vapor–liquid equilibrium.",
    version: "1.0.0",
    pressureRange: [1000, 200000],
    source: "https://doi.org/10.1021/acs.iecr.5c00077",
    limitations:
      "Sample group coverage; published parameters are CC BY-NC 4.0. No liquid–liquid stability search.",
  },
] as const;
export const modelInfo = (id: ModelId) => models.find((m) => m.id === id)!;

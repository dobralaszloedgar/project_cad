import { z } from "zod";
import { catalogSnapshotSchema } from "./data";
export const modelIds = [
  "ideal-gas",
  "ideal-solution",
  "modified-unifac-2.0",
] as const;
export type ModelId = (typeof modelIds)[number];
export const thermoSchema = z
  .object({
    modelId: z.enum(modelIds),
    mixture: z.enum(["demo", "aromatics", "aqueous", "catalog"]),
    catalog: catalogSnapshotSchema.optional(),
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
    label: "Ideal gas",
    description:
      "Low-pressure gases, away from condensation. Vapor only.",
    version: "2.0.0",
    pressureRange: [1, 1e8],
    source: "Ideal-gas equation of state",
    limitations: "Vapor only; does not predict condensation.",
  },
  {
    id: "ideal-solution",
    name: "Ideal solution · Raoult’s law",
    label: "Raoult’s law",
    description:
      "Ideal mixtures of similar molecules. 1–200 kPa; no azeotropes.",
    version: "2.0.0",
    pressureRange: [1000, 200000],
    source: "Published vapor-pressure and caloric correlations",
    limitations:
      "Ideal liquid and vapor; no azeotropes or liquid–liquid equilibrium.",
  },
  {
    id: "modified-unifac-2.0",
    name: "Modified UNIFAC 2.0",
    label: "Modified UNIFAC 2.0",
    description:
      "Nonideal liquids with supported molecular groups. 1–200 kPa; vapor–liquid equilibrium only.",
    version: "2.0.0",
    pressureRange: [1000, 200000],
    source: "https://doi.org/10.1021/acs.iecr.5c00077",
    limitations:
      "Dortmund group assignments; published parameters are CC BY-NC 4.0. No liquid–liquid stability search.",
  },
] as const;
export const modelInfo = (id: ModelId) => models.find((m) => m.id === id)!;

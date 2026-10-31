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
      "Equation of state (PV = nRT) for dilute gases at low pressure and temperatures well above condensation. Vapor only; does not predict condensation or liquid properties.",
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
      "Ideal liquid-mixture model with ideal vapor. Best for similar molecules, such as benzene/toluene. In this app: 1–200 kPa within component property-data ranges; cannot predict azeotropes.",
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
      "Group-contribution activity-coefficient model for nonideal liquids with ideal vapor. In this app: vapor–liquid equilibrium at 1–200 kPa with supported molecular groups and component property-data ranges. No liquid–liquid phase-split prediction.",
    version: "2.0.0",
    pressureRange: [1000, 200000],
    source: "https://doi.org/10.1021/acs.iecr.5c00077",
    limitations:
      "Dortmund group assignments; published parameters are CC BY-NC 4.0. No liquid–liquid stability search.",
  },
] as const;
export const modelInfo = (id: ModelId) => models.find((m) => m.id === id)!;

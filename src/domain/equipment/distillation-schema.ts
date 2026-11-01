import { z } from "zod";
import { trayHydraulicsSchema } from "./tray-hydraulics-schema";

export type CondenserType = "total" | "partial";

/** Omitted configuration retains the original single-contact/TP-flash behavior. */
export const distillationSchema = z
  .object({
    method: z.enum(["fug", "mesh"]).default("fug"),
    condenserType: z.enum(["total", "partial"]).default("total"),
    lightKey: z.string().min(1).max(100).optional(),
    heavyKey: z.string().min(1).max(100).optional(),
    relativeVolatilities: z
      .record(z.string(), z.number().positive().max(1e6))
      .default({}),
    lightRecovery: z.number().min(0.000001).max(0.999999).default(0.95),
    heavyRecovery: z.number().min(0.000001).max(0.999999).default(0.95),
    feedLiquidFraction: z.number().min(0).max(1).default(1),
    refluxMode: z.enum(["multiplier", "ratio"]).default("multiplier"),
    refluxMultiplier: z.number().gt(1).max(100).default(1.5),
    refluxRatio: z.number().positive().max(1000).default(2.5),
    distillateTemperature: z.number().min(250).max(800).default(350),
    bottomsTemperature: z.number().min(250).max(800).default(370),
    distillateFlow: z.number().positive().max(1000).default(5),
    feedTray: z.number().int().min(1).max(80).default(4),
    pressureDrop: z.number().min(0).max(199000).default(0),
    maxIterations: z.number().int().min(1).max(2000).default(200),
    tolerance: z.number().min(1e-12).max(1e-5).default(1e-8),
    hydraulics: trayHydraulicsSchema.optional(),
  })
  .strict();

export type DistillationConfig = z.infer<typeof distillationSchema>;
export const defaultDistillation = (
  ids: readonly string[],
  alpha = 3,
): DistillationConfig =>
  distillationSchema.parse({
    lightKey: ids[0],
    heavyKey: ids[1],
    relativeVolatilities:
      ids.length === 2 ? { [ids[0]]: alpha, [ids[1]]: 1 } : {},
  });

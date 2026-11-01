import { z } from "zod";

/** A single-pass sieve-tray preset. Fluid properties must be supplied explicitly. */
export const trayHydraulicsSchema = z
  .object({
    enabled: z.boolean().default(true),
    trayType: z.literal("sieve").default("sieve"),
    diameter: z.number().min(0.15).max(12).default(1.2),
    traySpacing: z.number().min(0.3).max(0.9).default(0.46),
    downcomerFraction: z.number().min(0.05).max(0.25).default(0.12),
    holeAreaFraction: z.number().min(0.1).max(0.15).default(0.1),
    holeDiameter: z.number().min(0.003).max(0.0127).default(0.005),
    weirHeight: z.number().min(0.015).max(0.1).default(0.05),
    downcomerClearance: z.number().min(0.005).max(0.1).default(0.04),
    dischargeCoefficient: z.number().min(0.6).max(0.9).default(0.75),
    liquidDensity: z.number().min(100).max(2500).optional(),
    surfaceTension: z.number().min(0.001).max(0.1).optional(),
  })
  .strict()
  .refine((h) => h.downcomerClearance <= h.weirHeight, {
    path: ["downcomerClearance"],
    message: "Downcomer clearance must not exceed weir height (liquid seal).",
  });

export type TrayHydraulicsConfig = z.infer<typeof trayHydraulicsSchema>;
export const defaultTrayHydraulics = (): TrayHydraulicsConfig =>
  trayHydraulicsSchema.parse({});

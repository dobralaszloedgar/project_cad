import { z } from "zod";
import { distillationSchema } from "./distillation-schema";
import { trayHydraulicsSchema } from "./tray-hydraulics-schema";

// Zod defaults also run inside partial objects. Remove them explicitly so a
// diameter-only edit cannot reset the method, operating point or other geometry.
const h = trayHydraulicsSchema.shape;
export const trayHydraulicsPatchSchema = z
  .object({
    enabled: h.enabled.removeDefault().optional(),
    trayType: h.trayType.removeDefault().optional(),
    diameter: h.diameter.removeDefault().optional(),
    traySpacing: h.traySpacing.removeDefault().optional(),
    downcomerFraction: h.downcomerFraction.removeDefault().optional(),
    holeAreaFraction: h.holeAreaFraction.removeDefault().optional(),
    holeDiameter: h.holeDiameter.removeDefault().optional(),
    weirHeight: h.weirHeight.removeDefault().optional(),
    downcomerClearance: h.downcomerClearance.removeDefault().optional(),
    dischargeCoefficient: h.dischargeCoefficient.removeDefault().optional(),
    liquidDensity: h.liquidDensity,
    surfaceTension: h.surfaceTension,
  })
  .strict();

const d = distillationSchema.shape;
export const distillationPatchSchema = z
  .object({
    method: d.method.removeDefault().optional(),
    condenserType: d.condenserType.removeDefault().optional(),
    lightKey: d.lightKey,
    heavyKey: d.heavyKey,
    relativeVolatilities: d.relativeVolatilities.removeDefault().optional(),
    lightRecovery: d.lightRecovery.removeDefault().optional(),
    heavyRecovery: d.heavyRecovery.removeDefault().optional(),
    feedLiquidFraction: d.feedLiquidFraction.removeDefault().optional(),
    refluxMode: d.refluxMode.removeDefault().optional(),
    refluxMultiplier: d.refluxMultiplier.removeDefault().optional(),
    refluxRatio: d.refluxRatio.removeDefault().optional(),
    distillateTemperature: d.distillateTemperature.removeDefault().optional(),
    bottomsTemperature: d.bottomsTemperature.removeDefault().optional(),
    distillateFlow: d.distillateFlow.removeDefault().optional(),
    feedTray: d.feedTray.removeDefault().optional(),
    pressureDrop: d.pressureDrop.removeDefault().optional(),
    maxIterations: d.maxIterations.removeDefault().optional(),
    tolerance: d.tolerance.removeDefault().optional(),
    hydraulics: trayHydraulicsPatchSchema.nullable().optional(),
  })
  .strict();

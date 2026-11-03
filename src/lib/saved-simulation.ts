// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { z } from "zod";
import type { Result } from "../domain/solver";
import { modelIds } from "../domain/thermo/registry";
import { trayHydraulicsSchema } from "../domain/equipment/tray-hydraulics-schema";

const numbers = z.array(z.number());
const warnings = z.array(z.string());
const flows = z.record(z.string(), z.number());
// Solvers also supply JSON diagnostics beyond their public Result interfaces.
// Keep those fields when validating so a saved run retains its full output.
const resultObject = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).catchall(z.json());
const stageResiduals = resultObject({
  material: z.number(),
  equilibrium: z.number(),
  energy: z.number(),
  summation: z.number(),
});
const distillation = z.discriminatedUnion("method", [
  resultObject({
    method: z.literal("fug"),
    condenserType: z.enum(["total", "partial"]),
    solverVersion: z.literal("project-column-fug-v1"),
    minimumStages: z.number(),
    theoreticalStages: z.number(),
    minimumRefluxRatio: z.number(),
    refluxRatio: z.number(),
    underwoodRoot: z.number(),
    distillateMolS: z.number(),
    bottomsMolS: z.number(),
    rectifyingVaporMolS: z.number(),
    strippingVaporMolS: z.number(),
    warnings,
  }),
  resultObject({
    method: z.literal("mesh"),
    condenserType: z.enum(["total", "partial"]),
    solverVersion: z.string(),
    componentIds: z.array(z.string()),
    iterations: z.number(),
    feedTray: z.number(),
    feedMolS: z.number(),
    feedComposition: numbers,
    feedEnthalpy: z.number(),
    distillateMolS: z.number(),
    bottomsMolS: z.number(),
    condenserDutyW: z.number(),
    reboilerDutyW: z.number(),
    stages: z.array(
      resultObject({
        stage: z.number(),
        kind: z.enum(["condenser", "tray", "reboiler"]),
        temperatureK: z.number(),
        pressurePa: z.number(),
        liquidMolS: z.number(),
        vaporMolS: z.number(),
        liquidComposition: numbers,
        vaporComposition: numbers,
        liquidEnthalpy: z.number(),
        vaporEnthalpy: z.number(),
        residuals: stageResiduals,
      }),
    ),
    residuals: stageResiduals.extend({
      component: z.number(),
      overallEnergyW: z.number(),
    }),
    warnings,
    hydraulics: resultObject({
      version: z.literal("sieve-rating-v1"),
      status: z.enum(["rated", "partial", "unavailable"]),
      config: trayHydraulicsSchema,
      stages: z.array(
        resultObject({
          stage: z.number(),
          state: z.enum([
            "normal",
            "near-flooding",
            "weeping",
            "flooding",
            "flooding-and-weeping",
            "unrated",
          ]),
          vaporDensity: z.number(),
          vaporVelocity: z.number(),
          holeVelocity: z.number(),
          liquidVolumeFlow: z.number(),
          flowParameter: z.number(),
          floodVelocity: z.number().nullable(),
          jetFloodFraction: z.number().nullable(),
          downcomerFloodFraction: z.number(),
          weepVelocity: z.number().nullable(),
          weepRatio: z.number().nullable(),
          clearLiquidHeight: z.number(),
          frothHeight: z.number(),
          downcomerBackup: z.number(),
          pressureDropPa: z.number(),
          notes: warnings,
        }),
      ),
      limitingTray: z.number().nullable(),
      maxFloodFraction: z.number().nullable(),
      minimumWeepRatio: z.number().nullable(),
      warnings,
    }).optional(),
  }),
]);

/** Validate stored results before the editor uses their nested numerical data. */
const resultSchema: z.ZodType<Result> = resultObject({
  properties: z.record(
    z.string(),
    resultObject({
      temperature: z.number(),
      phase: z.enum(["vapor", "liquid", "two-phase", "saturation", "empty"]),
      vaporFraction: z.number().nullable(),
      liquidComposition: numbers.nullable(),
      vaporComposition: numbers.nullable(),
      kValues: numbers.nullable(),
      activityCoefficients: numbers,
      saturationPressures: numbers.nullable(),
      partialPressures: numbers.nullable(),
      molarEnthalpy: z.number().nullable(),
      gasMolarVolume: z.number().nullable(),
      molecularWeight: z.number(),
      iterations: z.number(),
      equilibriumResidual: z.number(),
      componentResidual: z.number(),
      enthalpyResidual: z.number().nullable(),
      warnings,
    }),
  ),
  provenance: resultObject({
    modelId: z.enum(modelIds),
    modelVersion: z.string(),
    dataVersion: z.string(),
    kernelHash: z.string(),
    parameterHash: z.string().nullable(),
    chemicalIds: z.array(z.string()),
    extrapolate: z.boolean(),
  }),
  streams: z.record(
    z.string(),
    resultObject({
      a: z.number(),
      b: z.number(),
      components: flows.optional(),
      temperature: z.number(),
      pressure: z.number(),
      vaporFraction: z.number().optional(),
    }),
  ),
  equipment: z.record(
    z.string(),
    resultObject({
      duty: z.number(),
      conversion: z.number().optional(),
      extent: z.number(),
      profile: z
        .array(
          resultObject({ catalystMass: z.number(), conversion: z.number() }),
        )
        .optional(),
      packedBed: resultObject({
        flows,
        catalystMass: z.number(),
        conversion: z.number(),
        pressure: z.number(),
        extents: flows,
        profile: z.array(
          resultObject({
            catalystMass: z.number(),
            conversion: z.number(),
            pressure: z.number(),
            flows,
          }),
        ),
        warnings: warnings.optional(),
      }).optional(),
      distillation: distillation.optional(),
    }),
  ),
  converged: z.boolean(),
  iterations: z.number(),
  residual: z.number(),
  history: numbers,
  massResidual: z.number(),
  energyResidual: z.number(),
  conversion: z.number(),
  heatDuty: z.number(),
  warnings,
  tearId: z.string().optional(),
});

export const savedSimulationSchema = z
  .object({
    key: z.string(),
    completedAt: z.string().datetime({ offset: true }),
    result: resultSchema.nullable(),
    failure: z
      .object({ message: z.string(), unitId: z.string().optional() })
      .optional(),
  })
  .strict()
  .refine((value) => (value.result ? !value.failure : Boolean(value.failure)), {
    message: "A saved simulation must contain either results or a failure.",
  });

export type SavedSimulation = z.infer<typeof savedSimulationSchema>;

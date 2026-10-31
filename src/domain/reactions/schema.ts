import { z } from "zod";
import { rateLawSchema } from "./rateLawSchema";

export const componentIdSchema = z
  .string()
  .min(1)
  .max(80)
  .refine(
    (id) => !["__proto__", "constructor", "prototype"].includes(id),
    "Reserved component identifier",
  );
export const compositionSchema = z
  .record(componentIdSchema, z.number().finite().min(0).max(1))
  .refine(
    (values) => Object.keys(values).length <= 40,
    "At most 40 components",
  );

const sourceRange = z
  .tuple([z.number().finite().positive(), z.number().finite().positive()])
  .refine(([min, max]) => min <= max, "Source range must be ordered");

/** Provenance for the original template; users can still edit its rate law. */
export const kineticsSourceSchema = z
  .object({
    citation: z.string().min(1).max(500),
    url: z.string().url().max(1000).startsWith("https://"),
    locator: z.string().min(1).max(200),
    catalyst: z.string().min(1).max(200),
    temperatureRange: sourceRange,
    pressureRange: sourceRange,
    rateBasis: z.string().min(1).max(500),
    notes: z.string().min(1).max(2000),
  })
  .strict();

export const reactionSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().trim().min(1).max(100),
    enabled: z.boolean().default(true),
    basisComponentId: componentIdSchema,
    stoichiometry: z
      .array(
        z
          .object({
            componentId: componentIdSchema,
            coefficient: z.number().finite().min(-1000).max(1000),
          })
          .strict(),
      )
      .max(40),
    order: z.number().finite().min(0).max(20).default(1),
    rateConstant: z.number().finite().nonnegative().max(1e20).default(0),
    activationEnergy: z.number().finite().min(-1e6).max(1e6).default(0),
    referenceTemperature: z.number().min(250).max(800).default(450),
    rateLaw: rateLawSchema.optional(),
    kineticsSource: kineticsSourceSchema.optional(),
  })
  .strict();

export const packedBedSchema = z
  .object({
    reactions: z.array(reactionSchema).max(20),
    sizingMode: z
      .enum(["catalyst-mass", "target-conversion"])
      .default("catalyst-mass"),
    catalystMass: z.number().finite().min(0).max(1e9).default(10),
    targetConversion: z.number().finite().min(0).max(0.999999).default(0.8),
    conversionComponentId: componentIdSchema,
    flowModel: z.enum(["ideal-gas", "constant-flow"]).default("ideal-gas"),
    volumetricFlow: z.number().finite().positive().max(1e6).default(1),
    pressureDrop: z.number().finite().min(0).max(2e6).default(0),
  })
  .strict();
export type Reaction = z.infer<typeof reactionSchema>;
export type PackedBedConfig = z.infer<typeof packedBedSchema>;

export function defaultPackedBed(ids: readonly string[]): PackedBedConfig {
  return packedBedSchema.parse({
    conversionComponentId: ids[0] ?? "A",
    reactions: [],
  });
}

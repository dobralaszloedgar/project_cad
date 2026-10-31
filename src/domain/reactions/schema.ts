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

export function defaultPackedBed(
  ids: readonly string[],
  synthetic = false,
): PackedBedConfig {
  const basis = ids[0] ?? "A";
  return packedBedSchema.parse({
    conversionComponentId: basis,
    reactions: synthetic
      ? [
          {
            id: "reaction-1",
            name: "A to B",
            basisComponentId: basis,
            stoichiometry: [
              { componentId: basis, coefficient: -1 },
              { componentId: ids[1] ?? "B", coefficient: 1 },
            ],
            rateConstant: 0.01,
            activationEnergy: 40000,
          },
        ]
      : [],
  });
}

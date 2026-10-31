import { z } from "zod";

const symbol = z
  .string()
  .regex(
    /^[A-Za-z][A-Za-z0-9_]*$/,
    "Use a letter followed by letters, digits or underscores",
  )
  .max(40);
const factor = z
  .object({ variable: symbol, order: z.number().finite() })
  .strict();
export const rateLawSchema = z
  .object({
    mode: z.enum(["table", "custom"]),
    phase: z.enum(["gas", "liquid"]),
    rateUnit: z.enum([
      "mol/(m3*s)",
      "mol/(L*s)",
      "kmol/(m3*s)",
      "mol/(kg*s)",
      "kmol/(kg*s)",
    ]),
    variables: z
      .array(
        z
          .object({
            symbol,
            componentId: z.string().min(1),
            basis: z.enum([
              "concentration",
              "partial-pressure",
              "mole-fraction",
              "mass-concentration",
              "mass-fraction",
            ]),
            unit: z.enum([
              "mol/m3",
              "mol/L",
              "kmol/m3",
              "Pa",
              "kPa",
              "bar",
              "atm",
              "1",
              "kg/m3",
              "g/L",
            ]),
          })
          .strict(),
      )
      .max(40),
    parameters: z
      .array(
        z
          .object({
            symbol,
            value: z.number().finite(),
            // k(T) = k(Tref) exp[-E/R (1/T - 1/Tref)]. E is J/mol.
            activationEnergy: z.number().finite().optional(),
            referenceTemperature: z.number().finite().positive().optional(),
          })
          .strict(),
      )
      .max(40),
    forward: z.array(factor).max(40),
    reversible: z.boolean(),
    reverse: z.array(factor).max(40),
    adsorption: z
      .array(
        z
          .object({
            parameter: symbol,
            variable: symbol,
            order: z.number().finite(),
          })
          .strict(),
      )
      .max(40),
    denominatorPower: z.number().finite().positive(),
    expression: z.string().max(4000),
  })
  .strict();
export type RateLaw = z.infer<typeof rateLawSchema>;
export type RateVariable = RateLaw["variables"][number];

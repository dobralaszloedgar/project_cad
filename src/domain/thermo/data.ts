import { z } from "zod";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const finite = z.number().finite();
const range = { min: finite.positive(), max: finite.positive() };
export const gasCpSchema = z
  .object({
    model: z.enum(["shomate", "trc", "chemsep-16", "polynomial"]),
    ranges: z
      .array(
        z
          .object({ ...range, coefficients: z.array(finite).min(5).max(8) })
          .strict(),
      )
      .min(1)
      .max(12),
    source: z.string().min(1).max(1000),
  })
  .strict();
export const chemicalSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(200),
    formula: z.string().max(120).optional(),
    molecularWeight: finite.positive().max(10),
    cp: finite.positive().optional(),
    gasCp: gasCpSchema.optional(),
    formationEnthalpy: finite.optional(),
    formationSource: z.string().max(1000).optional(),
    antoine: z
      .array(
        z
          .object({
            a: finite,
            b: finite.positive(),
            c: finite,
            ...range,
            source: z.string().min(1).max(1000),
          })
          .strict(),
      )
      .max(20),
    vaporPressure: z
      .discriminatedUnion("model", [
        z
          .object({
            model: z.literal("iapws-1992"),
            source: z.string().max(1000),
          })
          .strict(),
        z
          .object({
            model: z.literal("dippr-101"),
            coefficients: z.tuple([finite, finite, finite, finite, finite]),
            ...range,
            criticalTemperature: finite.positive(),
            source: z.string().max(1000),
          })
          .strict(),
      ])
      .optional(),
    latentHeat: z
      .object({
        model: z.literal("dippr-106"),
        coefficients: z.tuple([finite, finite, finite, finite, finite]),
        ...range,
        criticalTemperature: finite.positive(),
        source: z.string().max(1000),
      })
      .strict()
      .optional(),
    groups: z
      .record(z.string().regex(/^\d+$/), finite.int().positive().max(100))
      .optional(),
    groupSource: z.string().max(1000).optional(),
  })
  .strict()
  .refine((c) => c.gasCp || c.cp, "Heat-capacity data is required");
export type Chemical = z.infer<typeof chemicalSchema>;
export type GasCp = z.infer<typeof gasCpSchema>;

export const activityDatasetSchema = z
  .object({
    version: z.literal(1),
    definitions: z.record(
      z.string().regex(/^\d+$/),
      z
        .object({
          main: finite.int().positive(),
          R: finite.positive(),
          Q: finite.nonnegative(),
        })
        .strict(),
    ),
    interactions: z.record(
      z.string().regex(/^\d+$/),
      z.record(z.string().regex(/^\d+$/), z.tuple([finite, finite, finite])),
    ),
    source: z
      .object({
        citation: z.string().min(1).max(1000),
        doi: z.string().min(1).max(200),
        license: z.literal("CC-BY-NC-4.0"),
        useRestriction: z.literal("non-commercial-only"),
        notice: z.string().min(1).max(4000),
        url: z.string().url().max(1000),
        sha256: hashSchema,
      })
      .strict(),
  })
  .strict()
  .refine(
    (d) =>
      Object.keys(d.definitions).length <= 256 &&
      Object.keys(d.interactions).length <= 128 &&
      Object.values(d.interactions).every(
        (row) => Object.keys(row).length <= 128,
      ),
    "Parameter dataset is too large",
  );
export type ActivityDataset = z.infer<typeof activityDatasetSchema>;
export const catalogSnapshotSchema = z
  .object({
    release: hashSchema,
    chemicals: z.tuple([chemicalSchema, chemicalSchema]),
    recordHashes: z.tuple([hashSchema, hashSchema]),
    parameters: z
      .object({
        hash: hashSchema,
        sourceHash: hashSchema,
        dataset: activityDatasetSchema,
      })
      .strict()
      .optional(),
  })
  .strict();
export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;

// A single canonical encoding is used by the importer, server and offline client.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
export const contentHash = (value: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(canonicalJson(value))));

export function validateSnapshot(snapshot: CatalogSnapshot) {
  if (snapshot.chemicals[0].id === snapshot.chemicals[1].id)
    throw new Error("Select two different chemicals for components A and B.");
  snapshot.chemicals.forEach((c, i) => {
    if (contentHash(c) !== snapshot.recordHashes[i])
      throw new Error(
        "Saved chemical data failed its integrity check. Select the chemicals again.",
      );
  });
  if (
    snapshot.parameters &&
    contentHash(snapshot.parameters.dataset) !== snapshot.parameters.hash
  )
    throw new Error("Saved activity parameters failed their integrity check.");
}

// Missing definitions or directed interaction pairs are errors, never zero-filled.
export function selectParameters(
  chemicals: readonly Chemical[],
  data: ActivityDataset,
): ActivityDataset {
  const groups = new Set<string>();
  for (const c of chemicals) {
    if (!c.groups || !Object.keys(c.groups).length)
      throw new Error(`${c.name}: no Dortmund group assignment.`);
    Object.keys(c.groups).forEach((g) => groups.add(g));
  }
  const definitions: ActivityDataset["definitions"] = {};
  for (const group of groups) {
    const definition = data.definitions[group];
    if (!definition)
      throw new Error(`Missing subgroup ${group} in Modified UNIFAC 2.0.`);
    definitions[group] = definition;
  }
  const mains = new Set(Object.values(definitions).map((d) => String(d.main)));
  const interactions: ActivityDataset["interactions"] = {};
  for (const a of mains) {
    interactions[a] = {};
    for (const b of mains) {
      if (a === b) continue;
      const pair = data.interactions[a]?.[b];
      if (!pair)
        throw new Error(
          `Missing directed interaction ${a} → ${b} in Modified UNIFAC 2.0.`,
        );
      interactions[a][b] = pair;
    }
  }
  return { version: 1, definitions, interactions, source: data.source };
}

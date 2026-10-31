import "server-only";
import { z } from "zod";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import {
  activityDatasetSchema,
  chemicalSchema,
  contentHash,
  hashSchema,
  selectParameters,
  type CatalogSnapshot,
} from "@/domain/thermo/data";
import { availableModels, propertyRange } from "@/domain/thermo/availability";
import { modelIds, type ModelId } from "@/domain/thermo/registry";

export class CatalogError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
const releaseSchema = z.object({
  hash: hashSchema,
  parameterHash: hashSchema,
  manifest: z.record(z.string(), z.unknown()),
});
const searchSchema = z.object({
  total: z.number().int().nonnegative(),
  results: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        formula: z.string(),
        models: z.array(z.enum(modelIds)),
      }),
    )
    .max(50),
});
const recordsSchema = z
  .array(z.object({ hash: hashSchema, chemical: chemicalSchema }))
  .max(64);
type Release = z.infer<typeof releaseSchema>;
let pool: Pool | undefined;
const releases = new Map<string, Release>();
const parameterCache = new Map<string, z.infer<typeof activityDatasetSchema>>();
// RPC names are an allowlist, never user-provided SQL identifiers.
const queries = {
  release: {
    name: "chemical_catalog_release",
    sql: "select public.chemical_catalog_release($1) as data",
    args: ["p_release"],
  },
  search: {
    name: "chemical_catalog_search",
    sql: "select public.chemical_catalog_search($1,$2,$3,$4) as data",
    args: ["p_release", "p_query", "p_model", "p_limit"],
  },
  compounds: {
    name: "chemical_catalog_compounds",
    sql: "select public.chemical_catalog_compounds($1,$2) as data",
    args: ["p_release", "p_ids"],
  },
  parameters: {
    name: "chemical_catalog_parameters",
    sql: "select public.chemical_catalog_parameters($1) as data",
    args: ["p_hash"],
  },
} as const;

async function read(
  kind: keyof typeof queries,
  args: unknown[],
): Promise<unknown> {
  const query = queries[kind];
  const mode = process.env.CHEMICAL_DATABASE_MODE ?? "local";
  try {
    if (mode === "cloud") {
      const url = process.env.SUPABASE_URL,
        key = process.env.SUPABASE_SECRET_KEY;
      if (!url || !key)
        throw new CatalogError(
          "Set SUPABASE_URL and SUPABASE_SECRET_KEY on the server to connect the chemical catalog.",
        );
      const base = new URL(url);
      if (base.protocol !== "https:")
        throw new CatalogError("The hosted chemical catalog requires HTTPS.");
      const response = await fetch(
        new URL(`/rest/v1/rpc/${query.name}`, base),
        {
          method: "POST",
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
          headers: {
            "Content-Type": "application/json",
            apikey: key,
            ...(!key.startsWith("sb_secret_")
              ? { Authorization: `Bearer ${key}` }
              : {}),
          },
          body: JSON.stringify(
            Object.fromEntries(query.args.map((name, i) => [name, args[i]])),
          ),
        },
      );
      if (!response.ok) {
        if (response.status === 404)
          throw new CatalogError(
            "The chemical catalog has not been installed. Run the catalog import on the server.",
          );
        throw new CatalogError(
          "The chemical catalog is unavailable. Check its server connection and permissions.",
        );
      }
      return await response.json();
    }
    if (mode !== "local")
      throw new CatalogError("CHEMICAL_DATABASE_MODE must be local or cloud.");
    const connectionString = process.env.CHEMICAL_DATABASE_URL;
    if (!connectionString)
      throw new CatalogError(
        "Configure the chemical database on the server. Bundled sample mixtures remain available.",
      );
    if (!pool) {
      const url = new URL(connectionString);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      const caFile =
        process.env.CHEMICAL_DATABASE_SSL_CA_FILE ??
        url.searchParams.get("sslrootcert");
      const ca = caFile ? await readFile(caFile, "utf8") : undefined;
      for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
        url.searchParams.delete(key);
      pool = new Pool({
        connectionString: url.toString(),
        max: 4,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        statement_timeout: 10000,
        ssl: local ? false : { rejectUnauthorized: true, ca },
      });
      pool.on("error", () => {
        /* Request errors are reported without credentials. */
      });
    }
    return (await pool.query(query.sql, args)).rows[0]?.data;
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    // Upstream errors can contain connection strings, headers or SQL. Do not expose them.
    throw new CatalogError(
      "Could not read the chemical catalog. Check the server database configuration.",
    );
  }
}
export async function catalogRelease(hash?: string): Promise<Release> {
  if (hash) {
    hashSchema.parse(hash);
    const cached = releases.get(hash);
    if (cached) return cached;
  }
  const value = await read("release", [hash ?? null]);
  if (!value)
    throw new CatalogError(
      hash
        ? "The saved catalog release is unavailable."
        : "The chemical catalog is empty. Import a data release first.",
      hash ? 404 : 503,
    );
  const release = releaseSchema.parse(value);
  if (
    contentHash(release.manifest) !== release.hash ||
    release.manifest.parameterHash !== release.parameterHash
  )
    throw new CatalogError("Catalog release failed its integrity check.");
  if (hash && release.hash !== hash)
    throw new CatalogError("Catalog release identity mismatch.");
  if (releases.size >= 16) releases.delete(releases.keys().next().value!);
  releases.set(release.hash, release);
  return release;
}
export async function searchChemicals(
  query: string,
  model: ModelId,
  hash?: string,
) {
  z.string().max(100).parse(query);
  z.enum(modelIds).parse(model);
  const release = await catalogRelease(hash);
  const page = searchSchema.parse(
    await read("search", [release.hash, query.trim(), model, 20]),
  );
  return { ...page, release: release.hash };
}
async function parameters(hash: string) {
  const cached = parameterCache.get(hash);
  if (cached) return cached;
  const data = activityDatasetSchema.parse(await read("parameters", [hash]));
  if (contentHash(data) !== hash)
    throw new CatalogError("Catalog parameters failed their integrity check.");
  if (parameterCache.size >= 4)
    parameterCache.delete(parameterCache.keys().next().value!);
  parameterCache.set(hash, data);
  return data;
}
export async function loadCatalogSelection(
  hash: string,
  ids: [string, string],
  model: ModelId,
): Promise<CatalogSnapshot> {
  hashSchema.parse(hash);
  z.tuple([z.string().min(1).max(80), z.string().min(1).max(80)]).parse(ids);
  z.enum(modelIds).parse(model);
  if (ids[0] === ids[1])
    throw new CatalogError("Select two different chemicals.", 422);
  const release = await catalogRelease(hash);
  const [records, data] = await Promise.all([
    read("compounds", [hash, ids]).then((value) => recordsSchema.parse(value)),
    parameters(release.parameterHash),
  ]);
  const selected = ids.map((id) => {
    const record = records.find((r) => r.chemical.id === id);
    if (!record)
      throw new CatalogError(
        `Chemical ${id} is absent from this catalog release.`,
        404,
      );
    if (contentHash(record.chemical) !== record.hash)
      throw new CatalogError("Chemical record failed its integrity check.");
    const manifestRecords = z
      .record(z.string(), hashSchema)
      .parse(release.manifest.records);
    if (manifestRecords[id] !== record.hash)
      throw new CatalogError(
        "Chemical record is not part of the selected data release.",
      );
    if (!availableModels(record.chemical, data).includes(model))
      throw new CatalogError(
        `${record.chemical.name} does not have the data required by this model.`,
        422,
      );
    return record;
  });
  const chemicals: CatalogSnapshot["chemicals"] = [
    selected[0].chemical,
    selected[1].chemical,
  ];
  const ranges = chemicals.map((c) => propertyRange(c, model)!);
  if (
    Math.max(...ranges.map((r) => r[0])) >= Math.min(...ranges.map((r) => r[1]))
  )
    throw new CatalogError(
      "These chemicals have no common supported temperature range for this model.",
      422,
    );
  const snapshot: CatalogSnapshot = {
    release: hash,
    chemicals,
    recordHashes: [selected[0].hash, selected[1].hash],
  };
  if (model === "modified-unifac-2.0") {
    try {
      const dataset = selectParameters(chemicals, data);
      snapshot.parameters = {
        hash: contentHash(dataset),
        sourceHash: release.parameterHash,
        dataset,
      };
    } catch (error) {
      throw new CatalogError(
        error instanceof Error ? error.message : "Missing activity parameters.",
        422,
      );
    }
  }
  return snapshot;
}

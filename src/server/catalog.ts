import "server-only";
import { z } from "zod";
import {
  activityDatasetSchema,
  chemicalSchema,
  contentHash,
  hashSchema,
  selectParameters,
  type CatalogSnapshot,
} from "../domain/thermo/data";
import { availableModels, propertyRange } from "../domain/thermo/availability";
import { modelIds, type ModelId } from "../domain/thermo/registry";
import {
  CHEMICAL_PAGE_SIZE,
  chemicalSearchFields,
  chemicalSearchSorts,
  type ChemicalSearchField,
  type ChemicalSearchSort,
} from "../lib/chemical-search";

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
  catalogTotal: z.number().int().nonnegative(),
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
const releases = new Map<string, Release>();
const releaseRequests = new Map<string, Promise<Release>>();
let latestRelease: { value: Release; expires: number } | undefined;
const searchPages = new Map<
  string,
  Promise<z.infer<typeof searchSchema> & { release: string }>
>();
const parameterCache = new Map<string, z.infer<typeof activityDatasetSchema>>();
// RPC names are an allowlist, never user-provided SQL identifiers.
const queries = {
  release: {
    name: "chemical_catalog_release",
    args: ["p_release"],
  },
  search: {
    name: "chemical_catalog_search_v2",
    args: [
      "p_release",
      "p_query",
      "p_model",
      "p_limit",
      "p_field",
      "p_sort",
      "p_offset",
    ],
  },
  compounds: {
    name: "chemical_catalog_compounds",
    args: ["p_release", "p_ids"],
  },
  parameters: {
    name: "chemical_catalog_parameters",
    args: ["p_hash"],
  },
  models: {
    name: "chemical_catalog_models",
    args: [],
  },
} as const;

async function read(
  kind: keyof typeof queries,
  args: unknown[],
): Promise<unknown> {
  const query = queries[kind];
  try {
    const url = process.env.SUPABASE_URL,
      key =
        process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (!url || !key)
      throw new CatalogError(
        "Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY on the server to connect the chemical catalog.",
      );
    const base = new URL(url);
    if (base.protocol !== "https:")
      throw new CatalogError("The hosted chemical catalog requires HTTPS.");
    const response = await fetch(new URL(`/rest/v1/rpc/${query.name}`, base), {
      method: "POST",
      // Persist immutable reference data across server restarts/instances.
      // Only the latest-release pointer and model registry need short expiry.
      cache: "force-cache",
      next: {
        revalidate:
          (kind === "release" && !args[0]) || kind === "models" ? 60 : 3600,
      },
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        ...(!key.startsWith("sb_") ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(
        Object.fromEntries(query.args.map((name, i) => [name, args[i]])),
      ),
    });
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
  } else if (latestRelease && latestRelease.expires > Date.now()) {
    return latestRelease.value;
  }
  const key = hash ?? "latest";
  const pending = releaseRequests.get(key);
  if (pending) return pending;
  const request = readRelease(hash)
    .then((release) => {
      // Published releases are immutable; only the latest-release pointer expires.
      if (!hash)
        latestRelease = { value: release, expires: Date.now() + 60_000 };
      return release;
    })
    .finally(() => releaseRequests.delete(key));
  releaseRequests.set(key, request);
  return request;
}
async function readRelease(hash?: string): Promise<Release> {
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
  options: {
    field?: ChemicalSearchField;
    sort?: ChemicalSearchSort;
    page?: number;
  } = {},
) {
  z.string().max(100).parse(query);
  z.enum(modelIds).parse(model);
  const field = z.enum(chemicalSearchFields).parse(options.field ?? "all");
  const sort = z.enum(chemicalSearchSorts).parse(options.sort ?? "relevance");
  const pageNumber = z
    .number()
    .int()
    .min(1)
    .max(5000)
    .parse(options.page ?? 1);
  const release = await catalogRelease(hash);
  const args = [
    release.hash,
    query.trim().toLowerCase(),
    model,
    CHEMICAL_PAGE_SIZE,
    field,
    sort,
    (pageNumber - 1) * CHEMICAL_PAGE_SIZE,
  ];
  const key = JSON.stringify(args);
  const cached = searchPages.get(key);
  if (cached) return cached;
  const pending = read("search", args)
    .then((value) => ({ ...searchSchema.parse(value), release: release.hash }))
    .catch((error: unknown) => {
      if (searchPages.get(key) === pending) searchPages.delete(key);
      throw error;
    });
  if (searchPages.size >= 128)
    searchPages.delete(searchPages.keys().next().value!);
  searchPages.set(key, pending);
  return pending;
}
export async function catalogModels() {
  const [release, registered] = await Promise.all([
    catalogRelease(),
    read("models", []).then((data) =>
      z
        .array(
          z.object({
            id: z.enum(modelIds),
            name: z.string(),
            version: z.string(),
          }),
        )
        .length(3)
        .parse(data),
    ),
  ]);
  if (new Set(registered.map((model) => model.id)).size !== modelIds.length)
    throw new CatalogError(
      "The chemical database model registry is incomplete.",
    );
  const counts = z
    .record(z.enum(modelIds), z.number().int().nonnegative())
    .parse(release.manifest.counts);
  return {
    release: release.hash,
    models: registered.map((model) => ({ ...model, count: counts[model.id] })),
  };
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
  ids: string[],
  model: ModelId,
): Promise<CatalogSnapshot> {
  hashSchema.parse(hash);
  z.array(z.string().min(1).max(80)).min(2).max(40).parse(ids);
  z.enum(modelIds).parse(model);
  if (new Set(ids).size !== ids.length)
    throw new CatalogError(
      "Select different chemicals for every component.",
      422,
    );
  const release = await catalogRelease(hash);
  const [records, data] = await Promise.all([
    read("compounds", [hash, ids]).then((value) => recordsSchema.parse(value)),
    parameters(release.parameterHash),
  ]);
  const manifestRecords = z
    .record(z.string(), hashSchema)
    .parse(release.manifest.records);
  const selected = ids.map((id) => {
    const record = records.find((r) => r.chemical.id === id);
    if (!record)
      throw new CatalogError(
        `Chemical ${id} is absent from this catalog release.`,
        404,
      );
    if (contentHash(record.chemical) !== record.hash)
      throw new CatalogError("Chemical record failed its integrity check.");
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
  const chemicals = selected.map((record) => record.chemical);
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
    recordHashes: selected.map((record) => record.hash),
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

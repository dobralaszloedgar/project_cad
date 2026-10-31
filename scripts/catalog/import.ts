import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import pg from "pg";
import {
  activityDatasetSchema,
  chemicalSchema,
  contentHash,
  type Chemical,
} from "../../src/domain/thermo/data";
import { availableModels } from "../../src/domain/thermo/availability";
import {
  evaluateProperties,
  flashPressureEnthalpy,
} from "../../src/domain/thermo";
import { defaultThermo, type ModelId } from "../../src/domain/thermo/registry";

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const filename = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!filename)
  throw new Error(
    "Usage: npm run catalog:import -- /path/catalog.json [--migrate] [--check]",
  );
const input = JSON.parse(await readFile(filename, "utf8"));
if (input.schemaVersion !== 1) throw new Error("Unsupported catalog schema");
const parameters = activityDatasetSchema.parse(input.parameters);
const parameterHash = contentHash(parameters);
const candidates = chemicalSchema.array().max(10000).parse(input.chemicals);
const ids = new Set<string>();
const excluded: { id: string; reason: string }[] = [];
const records: { chemical: Chemical; hash: string; models: ModelId[] }[] = [];
// Verify imported Cp data against the actual browser/server kernel before publication.
for (const chemical of candidates) {
  if (ids.has(chemical.id))
    throw new Error(`Duplicate chemical ${chemical.id}`);
  ids.add(chemical.id);
  const models = availableModels(chemical, parameters);
  if (!models.includes("ideal-gas")) continue;
  const provider = {
    version: "import-validation",
    get: () => chemical,
    search: () => [chemical],
  };
  try {
    for (const t of [298.15, 350, 500, 750]) {
      const range = chemical.gasCp!.ranges;
      if (!range.some((r) => r.min <= t && r.max >= t)) continue;
      const state = evaluateProperties(
        t,
        101325,
        [1],
        defaultThermo,
        provider,
        [chemical.id],
      );
      if (!Number.isFinite(state.molarEnthalpy))
        throw new Error("Invalid gas enthalpy");
      const back = flashPressureEnthalpy(
        101325,
        state.molarEnthalpy!,
        [1],
        defaultThermo,
        provider,
        [chemical.id],
      );
      if (Math.abs(back.temperature - t) > 1e-5)
        throw new Error("Gas PH round trip failed");
    }
  } catch (e) {
    excluded.push({
      id: chemical.id,
      reason: e instanceof Error ? e.message : "Invalid data",
    });
    continue;
  }
  records.push({ chemical, hash: contentHash(chemical), models });
}
const manifest = {
  schemaVersion: 1,
  adapterVersion: "project-thermo-catalog-1",
  parameterHash,
  sources: input.sources,
  records: Object.fromEntries(records.map((r) => [r.chemical.id, r.hash])),
  counts: Object.fromEntries(
    ["ideal-gas", "ideal-solution", "modified-unifac-2.0"].map((m) => [
      m,
      records.filter((r) => r.models.includes(m as (typeof r.models)[number]))
        .length,
    ]),
  ),
};
const releaseHash = contentHash(manifest);
console.log(
  JSON.stringify(
    { release: releaseHash, counts: manifest.counts, excluded },
    null,
    2,
  ),
);
if (process.argv.includes("--check")) process.exit(0);
const connectionString =
  process.env.CHEMICAL_DATABASE_MODE === "cloud"
    ? process.env.SUPABASE_DATABASE_URL
    : process.env.CHEMICAL_DATABASE_URL;
if (!connectionString)
  throw new Error(
    "Set the catalog PostgreSQL connection in .env.local before importing.",
  );
let url: URL;
try {
  url = new URL(connectionString);
} catch {
  throw new Error(
    "Invalid catalog PostgreSQL connection string. Check .env.local.",
  );
}
const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
const caFile =
  process.env.CHEMICAL_DATABASE_SSL_CA_FILE ??
  url.searchParams.get("sslrootcert");
const ca = caFile ? await readFile(caFile, "utf8") : undefined;
for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
  url.searchParams.delete(key);
const db = new pg.Client({
  connectionString: url.toString(),
  ssl: local ? false : { rejectUnauthorized: true, ca },
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
});
try {
  await db.connect();
  await db.query("begin");
  await db.query("select pg_advisory_xact_lock(284612342)");
  const existing = await db.query(
    "select nspname from pg_namespace where nspname='thermo_catalog'",
  );
  if (!existing.rowCount) {
    if (!process.argv.includes("--migrate"))
      throw new Error(
        "Catalog schema is absent. Rerun with --migrate to install it.",
      );
    const migration = await readFile(
      new URL(
        "../../supabase/migrations/20261031012108_chemical_catalog.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.query(migration);
  }
  await db.query(
    "insert into thermo_catalog.parameters(hash,payload) values($1,$2) on conflict do nothing",
    [parameterHash, JSON.stringify(parameters)],
  );
  await db.query(
    "insert into thermo_catalog.releases(hash,parameter_hash,manifest) values($1,$2,$3) on conflict do nothing",
    [releaseHash, parameterHash, JSON.stringify(manifest)],
  );
  for (let i = 0; i < records.length; i += 100) {
    const batch = records.slice(i, i + 100).map((r) => ({
      release_hash: releaseHash,
      id: r.chemical.id,
      record_hash: r.hash,
      name: r.chemical.name,
      formula: r.chemical.formula ?? "",
      models: r.models,
      payload: r.chemical,
    }));
    await db.query(
      `insert into thermo_catalog.compounds(release_hash,id,record_hash,name,formula,models,payload)
      select release_hash,id,record_hash,name,formula,models,payload from jsonb_to_recordset($1)
      as x(release_hash text,id text,record_hash text,name text,formula text,models text[],payload jsonb)
      on conflict do nothing`,
      [JSON.stringify(batch)],
    );
  }
  const count = await db.query(
    "select count(*)::integer as count from thermo_catalog.compounds where release_hash=$1",
    [releaseHash],
  );
  if (count.rows[0].count !== records.length)
    throw new Error("Catalog row count mismatch");
  await db.query("commit");
  console.log(
    `Imported ${records.length} verified records. Release ${releaseHash}.`,
  );
} catch (error) {
  await db.query("rollback").catch(() => {});
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "IMPORT_FAILED";
  // Database errors can include sensitive connection details. Print the code only.
  console.error(
    `Catalog import failed (${code}). No partial release was published.`,
  );
  process.exitCode = 1;
} finally {
  await db.end();
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contentHash } from "../src/domain/thermo/data";
vi.mock("server-only", () => ({}));
let catalogRelease: typeof import("../src/server/catalog").catalogRelease;
let searchChemicals: typeof import("../src/server/catalog").searchChemicals;

const manifest = { parameterHash: "a".repeat(64) };
const release = {
  hash: contentHash(manifest),
  parameterHash: manifest.parameterHash,
  manifest,
};
beforeEach(async () => {
  vi.resetModules();
  ({ catalogRelease, searchChemicals } = await import("../src/server/catalog"));
  vi.stubEnv("SUPABASE_URL", "https://catalog.example.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("chemical lookup caching", () => {
  const page = {
    total: 1,
    catalogTotal: 100,
    results: [
      { id: "7732-18-5", name: "water", formula: "H2O", models: ["ideal-gas"] },
    ],
  };

  it("shares concurrent lookups and reuses release metadata for new searches", async () => {
    const fetcher = vi.fn(async (url: URL) =>
      Response.json(
        url.pathname.endsWith("chemical_catalog_release") ? release : page,
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const results = await Promise.all([
      searchChemicals("water", "ideal-gas"),
      searchChemicals("water", "ideal-gas"),
    ]);
    expect(results).toEqual([
      { ...page, release: release.hash },
      { ...page, release: release.hash },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await searchChemicals(" WATER ", "ideal-gas");
    expect(fetcher).toHaveBeenCalledTimes(2);
    await searchChemicals("ethanol", "ideal-gas");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("keeps model, identifier, ordering and page lookups separate", async () => {
    const fetcher = vi.fn(async (url: URL) =>
      Response.json(
        url.pathname.endsWith("chemical_catalog_release") ? release : page,
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    await searchChemicals("water", "ideal-gas");
    await searchChemicals("water", "ideal-solution");
    await searchChemicals("water", "ideal-gas", undefined, { field: "name" });
    await searchChemicals("water", "ideal-gas", undefined, { sort: "name" });
    await searchChemicals("water", "ideal-gas", undefined, { page: 2 });
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it("discovers a new release after expiry without changing pinned results", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const nextManifest = { ...manifest, version: 2 };
    const nextRelease = {
      ...release,
      hash: contentHash(nextManifest),
      manifest: nextManifest,
    };
    let activeRelease = release;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) =>
        Response.json(
          url.pathname.endsWith("chemical_catalog_release")
            ? activeRelease
            : page,
        ),
      ),
    );
    expect((await searchChemicals("water", "ideal-gas")).release).toBe(
      release.hash,
    );
    activeRelease = nextRelease;
    now = 60_001;
    expect((await searchChemicals("water", "ideal-gas")).release).toBe(
      nextRelease.hash,
    );
    expect(
      (await searchChemicals("water", "ideal-gas", release.hash)).release,
    ).toBe(release.hash);
  });

  it("retries failed searches instead of caching their errors", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(release))
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(Response.json(page));
    vi.stubGlobal("fetch", fetcher);
    await expect(searchChemicals("water", "ideal-gas")).rejects.toThrow(
      "unavailable",
    );
    expect(await searchChemicals("water", "ideal-gas")).toEqual({
      ...page,
      release: release.hash,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

describe("automatic Supabase catalog connection", () => {
  it.each([undefined, "local", "cloud"])(
    "uses Supabase regardless of the obsolete mode %s",
    async (mode) => {
      vi.stubEnv("CHEMICAL_DATABASE_MODE", mode);
      vi.stubEnv(
        "CHEMICAL_DATABASE_URL",
        "postgresql://unused:unused@127.0.0.1:1/unused",
      );
      const fetcher = vi.fn().mockResolvedValue(Response.json(release));
      vi.stubGlobal("fetch", fetcher);
      expect(await catalogRelease()).toEqual(release);
      expect(String(fetcher.mock.calls[0][0])).toBe(
        "https://catalog.example.supabase.co/rest/v1/rpc/chemical_catalog_release",
      );
      expect(fetcher.mock.calls[0][1].headers).toEqual({
        "Content-Type": "application/json",
        apikey: "sb_publishable_test",
      });
    },
  );
  it("does not fall back to another source when Supabase is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(new Error("sensitive upstream connection details")),
    );
    await expect(catalogRelease()).rejects.toThrow(
      "Could not read the chemical catalog",
    );
  });
  it("rejects missing credentials before making a request", async () => {
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(catalogRelease()).rejects.toThrow("SUPABASE_PUBLISHABLE_KEY");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contentHash } from "../src/domain/thermo/data";
vi.mock("server-only", () => ({}));
import { catalogRelease } from "../src/server/catalog";

const manifest = { parameterHash: "a".repeat(64) };
const release = {
  hash: contentHash(manifest),
  parameterHash: manifest.parameterHash,
  manifest,
};
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://catalog.example.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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

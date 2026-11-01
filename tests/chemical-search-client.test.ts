import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChemicalSearchOptions } from "../src/lib/chemical-search-client";

let client: typeof import("../src/lib/chemical-search-client");
const options: ChemicalSearchOptions = {
  query: "water",
  field: "all",
  sort: "relevance",
  page: 1,
  model: "ideal-gas",
};
const page = {
  release: "a".repeat(64),
  total: 1,
  catalogTotal: 2050,
  results: [{ id: "7732-18-5", name: "water", formula: "H2O" }],
};

beforeEach(async () => {
  vi.resetModules();
  client = await import("../src/lib/chemical-search-client");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("chemical search preloading", () => {
  it("shares an in-flight preload with the picker and reuses it after pinning the release", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    client.prefetchChemicalSearch("ideal-gas");
    const lookup = client.loadChemicalSearch({ ...options, query: "" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    finish(Response.json(page));
    expect(await lookup).toEqual(page);
    expect(
      await client.loadChemicalSearch({
        ...options,
        query: "",
        release: page.release,
      }),
    ).toEqual(page);
    expect(
      client.cachedChemicalSearch(
        client.chemicalSearchKey({ ...options, query: "" }),
      ),
    ).toEqual(page);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refreshes the latest release after expiry while retaining pinned pages", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(page))
      .mockResolvedValueOnce(
        Response.json({ ...page, release: "b".repeat(64) }),
      );
    vi.stubGlobal("fetch", fetcher);
    await client.loadChemicalSearch(options);
    now = 60_001;
    expect(
      (await client.loadChemicalSearch({ ...options, release: page.release }))
        .release,
    ).toBe(page.release);
    expect((await client.loadChemicalSearch(options)).release).toBe(
      "b".repeat(64),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("retries failed lookups and keeps fields, models, sorting and pages separate", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ error: "Try again" }, { status: 503 }),
      )
      .mockImplementation(() => Promise.resolve(Response.json(page)));
    vi.stubGlobal("fetch", fetcher);
    await expect(client.loadChemicalSearch(options)).rejects.toThrow(
      "Try again",
    );
    await client.loadChemicalSearch(options);
    await client.loadChemicalSearch({ ...options, query: " WATER " });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await client.loadChemicalSearch({ ...options, field: "name" });
    await client.loadChemicalSearch({ ...options, model: "ideal-solution" });
    await client.loadChemicalSearch({ ...options, sort: "name" });
    await client.loadChemicalSearch({ ...options, page: 2 });
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
});

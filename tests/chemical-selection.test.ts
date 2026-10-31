import { afterEach, describe, expect, it, vi } from "vitest";
import {
  catalogChoices,
  resolveCatalogSettings,
} from "../src/lib/chemical-catalog";
import { defaultThermo } from "../src/domain/thermo/registry";
import { settingsFor } from "./helpers/catalog";

afterEach(() => vi.unstubAllGlobals());
describe("Supabase component selection", () => {
  it("retains the identity and order of legacy real mixtures without inventing chemicals for A/B", () => {
    expect(catalogChoices(defaultThermo)).toEqual([undefined, undefined]);
    expect(
      catalogChoices({ ...defaultThermo, mixture: "aromatics" }).map(
        (c) => c?.id,
      ),
    ).toEqual(["71-43-2", "108-88-3"]);
    expect(
      catalogChoices({ ...defaultThermo, mixture: "aqueous" }).map(
        (c) => c?.id,
      ),
    ).toEqual(["64-17-5", "7732-18-5"]);
  });
  it("uses the saved Supabase snapshot offline when components and required parameters are unchanged", async () => {
    const settings = settingsFor(
      ["71-43-2", "108-88-3"],
      "modified-unifac-2.0",
    );
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await resolveCatalogSettings(settings)).toEqual(settings);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("automatically resolves legacy real components through Supabase", async () => {
    const saved = settingsFor(["71-43-2", "108-88-3"], "modified-unifac-2.0");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ release: saved.catalog!.release }))
      .mockResolvedValueOnce(Response.json(saved.catalog));
    vi.stubGlobal("fetch", fetcher);
    const result = await resolveCatalogSettings({
      ...defaultThermo,
      mixture: "aromatics",
      modelId: "modified-unifac-2.0",
    });
    expect(result).toEqual(saved);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      release: saved.catalog!.release,
      ids: ["71-43-2", "108-88-3"],
      model: "modified-unifac-2.0",
    });
  });
  it("rejects a response containing a different pair", async () => {
    const saved = settingsFor(["64-17-5", "7732-18-5"]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(saved.catalog)),
    );
    await expect(
      resolveCatalogSettings(
        { ...defaultThermo, mixture: "aromatics" },
        undefined,
        saved.catalog!.release,
      ),
    ).rejects.toThrow("different component selection");
  });
});

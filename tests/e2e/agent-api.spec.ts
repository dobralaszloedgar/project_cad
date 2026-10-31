import { expect, test } from "@playwright/test";
import { aiGuideText, AI_GUIDE_VERSION } from "../../src/assistant/guide";
import { hydraulicProject } from "../fixtures/hydraulic-project";
import type { Result } from "../../src/domain/solver";
import type { MeshResult } from "../../src/domain/equipment/distillation";

test("HTTP agents discover, patch and calculate hydraulic states with unchanged separation", async ({
  request,
}) => {
  const guide = await request.get("/api/ai/guide");
  expect(guide.ok()).toBe(true);
  expect(guide.headers()["x-ai-guide-version"]).toBe(AI_GUIDE_VERSION);
  expect(await guide.text()).toBe(aiGuideText);
  const discovery = await request.get("/api/capabilities");
  expect(discovery.ok()).toBe(true);
  const capabilities = await discovery.json();
  expect(capabilities.mode).toBe("stateless");
  expect(capabilities.guide.url).toBe("/api/ai/guide");
  expect(capabilities.units.hydraulics.surfaceTension).toBe("N/m");
  expect(capabilities.tools.get_guide).toBeDefined();
  expect(capabilities.tools.get_chemical_selection).toBeDefined();
  expect(capabilities.projectSchema.properties.units).toBeDefined();

  const project = hydraulicProject();
  const baseResponse = await request.post("/api/simulate", { data: project });
  expect(baseResponse.ok()).toBe(true);
  const baseline: Result = await baseResponse.json();
  expect(baseline.converged).toBe(true);
  const baseColumn = baseline.equipment["D-201"].distillation as MeshResult;
  expect(
    baseColumn.hydraulics!.stages.every((row) => row.state === "normal"),
  ).toBe(true);

  for (const [diameter, state] of [
    [2, "weeping"],
    [0.7, "flooding"],
  ] as const) {
    const preview = await request.post("/api/actions/preview", {
      data: {
        project,
        plan: {
          summary: `Rate diameter ${diameter}`,
          actions: [
            {
              type: "update",
              id: "D-201",
              params: { distillation: { hydraulics: { diameter } } },
            },
          ],
        },
      },
    });
    expect(preview.ok(), await preview.text()).toBe(true);
    const candidate = await preview.json();
    expect(candidate.applied).toBe(false);
    expect(candidate.baseRevision).toHaveLength(64);
    expect(candidate.candidateRevision).not.toBe(candidate.baseRevision);
    expect(candidate.project.units[1].params.distillation).toEqual({
      ...project.units[1].params.distillation,
      hydraulics: {
        ...project.units[1].params.distillation!.hydraulics,
        diameter,
      },
    });
    const calculated = await request.post("/api/simulate", {
      data: candidate.project,
    });
    expect(calculated.ok(), await calculated.text()).toBe(true);
    const result: Result = await calculated.json();
    const column = result.equipment["D-201"].distillation as MeshResult;
    expect(result.converged).toBe(true);
    expect(column.hydraulics!.status).toBe("rated");
    expect(
      column.hydraulics!.stages.some((row) => row.state.includes(state)),
    ).toBe(true);
    expect(column.hydraulics!.stages).toHaveLength(
      project.units[1].params.trayCount,
    );
    expect(result.streams).toEqual(baseline.streams);
    expect(column.stages).toEqual(baseColumn.stages);
    expect(column.condenserDutyW).toBe(baseColumn.condenserDutyW);
    expect(column.reboilerDutyW).toBe(baseColumn.reboilerDutyW);
    expect(
      result.warnings.some((warning) => warning.toLowerCase().includes(state)),
    ).toBe(true);
  }
});

test("HTTP rating reports missing data honestly and supports disabling and FUG", async ({
  request,
}) => {
  const project = hydraulicProject();
  const settings = project.units[1].params.distillation!;
  delete settings.hydraulics!.surfaceTension;
  const missing = await request.post("/api/simulate", { data: project });
  expect(missing.ok()).toBe(true);
  const unrated: Result = await missing.json();
  expect(unrated.converged).toBe(true);
  expect(
    (unrated.equipment["D-201"].distillation as MeshResult).hydraulics,
  ).toMatchObject({
    status: "unavailable",
    maxFloodFraction: null,
    minimumWeepRatio: null,
  });
  expect(unrated.warnings.length).toBeGreaterThan(0);
  settings.hydraulics!.enabled = false;
  const disabled = await request.post("/api/simulate", { data: project });
  expect(disabled.ok()).toBe(true);
  expect(
    (await disabled.json()).equipment["D-201"].distillation.hydraulics,
  ).toBeUndefined();
  settings.hydraulics!.enabled = true;
  settings.method = "fug";
  const fug = await request.post("/api/simulate", { data: project });
  expect(fug.ok()).toBe(true);
  expect((await fug.json()).equipment["D-201"].distillation).toMatchObject({
    method: "fug",
  });
  expect(
    (await fug.json()).equipment["D-201"].distillation.hydraulics,
  ).toBeUndefined();
});

test("HTTP previews reject stale, invalid and oversized requests without changing inputs", async ({
  request,
}) => {
  const project = hydraulicProject();
  const plan = { summary: "No changes", actions: [] };
  const stale = await request.post("/api/actions/preview", {
    data: { project, plan, baseRevision: "0".repeat(64) },
  });
  expect(stale.status()).toBe(409);
  const invalid = await request.post("/api/actions/preview", {
    data: {
      project,
      plan: {
        summary: "Invalid liquid seal",
        actions: [
          {
            type: "update",
            id: "D-201",
            params: { distillation: { hydraulics: { weirHeight: 0.02 } } },
          },
        ],
      },
    },
  });
  expect(invalid.status()).toBe(422);
  expect((await invalid.json()).error).toContain("liquid seal");
  const normalized = await request.post("/api/actions/preview", {
    data: { project, plan },
  });
  expect(normalized.ok()).toBe(true);
  expect((await normalized.json()).project).toEqual(project);
  const matching = await request.post("/api/actions/preview", {
    data: {
      project,
      plan,
      baseRevision: (await normalized.json()).baseRevision,
    },
  });
  expect(matching.ok()).toBe(true);
  for (const path of ["/api/actions/preview", "/api/simulate"]) {
    const malformed = await request.post(path, {
      data: "{broken",
      headers: { "Content-Type": "application/json" },
    });
    expect(malformed.status()).toBe(422);
    // Multi-byte input checks bytes rather than JS character count.
    const oversized = await request.post(path, {
      data: JSON.stringify("é".repeat(2 * 1024 * 1024)),
      headers: { "Content-Type": "application/json" },
    });
    expect(oversized.status()).toBe(413);
  }
});

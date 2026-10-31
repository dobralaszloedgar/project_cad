import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyActions, planSchema, type Plan } from "../src/domain/actions";
import { simulate } from "../src/domain/solver";
import { type Project } from "../src/domain/schema";
import { type MeshResult } from "../src/domain/equipment/distillation";
import {
  executeProjectTool,
  projectRevision,
  assistantInstructions,
} from "../src/assistant/tools";
import { projectCapabilities } from "../src/assistant/capabilities";
import { AI_GUIDE_VERSION, aiGuideText } from "../src/assistant/guide";
import { hydraulicProject } from "./fixtures/hydraulic-project";

afterEach(() => vi.unstubAllGlobals());
const column = (project: Project) => project.units[1].params.distillation!;
const resize = (diameter: number): Plan => ({
  summary: "Change tower diameter",
  actions: [
    {
      type: "update",
      id: "D-201",
      params: { distillation: { hydraulics: { diameter } } },
    },
  ],
});

describe("agent hydraulic workflow", () => {
  it("preserves non-default settings through sparse nested edits and checks the merged liquid seal", () => {
    const project = hydraulicProject();
    const previous = column(project);
    previous.refluxRatio = 3.2;
    previous.feedTray = 6;
    previous.pressureDrop = 1200;
    previous.hydraulics!.traySpacing = 0.6;
    previous.hydraulics!.weirHeight = 0.08;
    previous.hydraulics!.downcomerClearance = 0.07;
    const before = structuredClone(project);
    const plan = resize(1.7);
    expect(planSchema.parse(plan)).toEqual(plan);
    const edited = applyActions(project, plan);
    expect(column(edited)).toEqual({
      ...previous,
      hydraulics: { ...previous.hydraulics, diameter: 1.7 },
    });
    // This is valid against stored weirHeight=0.08, but not against its default.
    const sealed = applyActions(edited, {
      summary: "Raise clearance",
      actions: [
        {
          type: "update",
          id: "D-201",
          params: {
            distillation: { hydraulics: { downcomerClearance: 0.075 } },
          },
        },
      ],
    });
    expect(column(sealed).hydraulics!.downcomerClearance).toBe(0.075);
    expect(() =>
      applyActions(project, {
        summary: "Invalid seal",
        actions: [
          {
            type: "update",
            id: "D-201",
            params: { distillation: { hydraulics: { weirHeight: 0.05 } } },
          },
        ],
      }),
    ).toThrow("liquid seal");
    expect(project).toEqual(before);
  });

  it("previews, simulates and proposes flooding without changing the source or separation", async () => {
    const project = hydraulicProject();
    const before = structuredClone(project);
    const context = { projectId: "tower", project, mode: "review" as const };
    const baseRevision = await projectRevision(project);
    const plan = resize(0.7);
    const preview = await executeProjectTool(
      "preview_actions",
      { baseRevision, plan },
      context,
    );
    expect(preview).toMatchObject({ applied: false, baseRevision });
    expect(preview.candidateRevision).toBe(
      await projectRevision(preview.project),
    );
    expect(preview.candidateRevision).not.toBe(baseRevision);
    expect(column(preview.project).hydraulics!.diameter).toBe(0.7);
    const actual = await executeProjectTool(
      "simulate",
      { baseRevision, plan },
      context,
    );
    const baseline = simulate(project);
    expect(actual).toMatchObject({
      revision: baseRevision,
      preview: true,
      result: { converged: true },
    });
    const rated = actual.result.equipment["D-201"].distillation as MeshResult;
    expect(rated.hydraulics!.status).toBe("rated");
    expect(
      rated.hydraulics!.stages.some((row) => row.state.includes("flooding")),
    ).toBe(true);
    expect(rated.hydraulics!.maxFloodFraction).toBeGreaterThan(1);
    expect(rated.stages).toEqual(
      (baseline.equipment["D-201"].distillation as MeshResult).stages,
    );
    expect(actual.result.streams).toEqual(baseline.streams);
    expect(actual.result.heatDuty).toBe(baseline.heatDuty);
    expect(
      await executeProjectTool(
        "propose_actions",
        { baseRevision, plan },
        context,
      ),
    ).toMatchObject({ applied: false, plan });
    await expect(
      executeProjectTool(
        "propose_actions",
        { baseRevision, plan },
        { ...context, mode: "read-only" },
      ),
    ).rejects.toThrow("read-only");
    await expect(
      executeProjectTool(
        "simulate",
        { baseRevision, plan },
        { ...context, project: preview.project },
      ),
    ).rejects.toThrow("project changed");
    expect(project).toEqual(before);
  });

  it("supports disabling, removing and restoring configurations without resetting inactive settings", () => {
    const project = hydraulicProject();
    const disable = applyActions(project, {
      summary: "Disable rating",
      actions: [
        {
          type: "update",
          id: "D-201",
          params: { distillation: { hydraulics: { enabled: false } } },
        },
      ],
    });
    expect(column(disable).hydraulics).toEqual({
      ...column(project).hydraulics,
      enabled: false,
    });
    expect(
      (simulate(disable).equipment["D-201"].distillation as MeshResult)
        .hydraulics,
    ).toBeUndefined();
    const remove = applyActions(project, {
      summary: "Remove hydraulic settings",
      actions: [
        {
          type: "update",
          id: "D-201",
          params: { distillation: { hydraulics: null } },
        },
      ],
    });
    expect(column(remove).hydraulics).toBeUndefined();
    expect(column(remove).method).toBe("mesh");
    const legacy = applyActions(project, {
      summary: "Return to legacy contact",
      actions: [
        { type: "update", id: "D-201", params: { distillation: null } },
      ],
    });
    expect(legacy.units[1].params.distillation).toBeUndefined();
    expect(
      column(
        applyActions(legacy, {
          summary: "Restore MESH",
          actions: [
            {
              type: "update",
              id: "D-201",
              params: { distillation: column(project) },
            },
          ],
        }),
      ),
    ).toEqual(column(project));
  });
});

describe("agent discovery and guide", () => {
  it("keeps the document, tool and provider instructions synchronized", async () => {
    expect(
      readFileSync(
        new URL("../docs/AI_GUIDE.txt", import.meta.url),
        "utf8",
      ).replaceAll("\r\n", "\n"),
    ).toBe(aiGuideText);
    expect(assistantInstructions).toContain(aiGuideText);
    const context = {
      projectId: "tower",
      project: hydraulicProject(),
      mode: "read-only" as const,
    };
    expect(await executeProjectTool("get_guide", {}, context)).toEqual({
      version: AI_GUIDE_VERSION,
      content: aiGuideText,
    });
    const capabilities = await executeProjectTool(
      "get_capabilities",
      {},
      context,
    );
    expect(capabilities).toEqual(projectCapabilities("read-only"));
    expect(capabilities.tools.get_guide.available).toBe(true);
    expect(capabilities.tools.propose_actions.available).toBe(false);
    expect(capabilities.units.hydraulics.surfaceTension).toBe("N/m");
    expect(capabilities.results.hydraulicFeedback).toBe(false);
    const update =
      capabilities.actionSchema.properties.actions.items.oneOf.find(
        (action: { properties: { type: { const: string } } }) =>
          action.properties.type.const === "update",
      );
    const d = update.properties.params.properties.distillation.anyOf.find(
      (s: { type: string }) => s.type === "object",
    );
    expect(d.properties.method.default).toBeUndefined();
    expect(
      d.properties.hydraulics.anyOf[0].properties.diameter.default,
    ).toBeUndefined();
  });

  it("routes catalog tools through the app's bounded, read-only endpoints and preserves failures", async () => {
    const context = {
      projectId: "tower",
      project: hydraulicProject(),
      mode: "read-only" as const,
    };
    const before = structuredClone(context.project);
    const network = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ release: "a".repeat(64), records: [] })),
      );
    vi.stubGlobal("fetch", network);
    const args = { query: "benzene & water", model: "ideal-solution" };
    await executeProjectTool("search_chemicals", args, context);
    const url = new URL(network.mock.calls[0][0], "http://localhost");
    expect(url.pathname).toBe("/api/chemicals");
    expect(url.searchParams.get("query")).toBe(args.query);
    expect(url.searchParams.get("page")).toBe("1");
    network.mockResolvedValue(new Response(JSON.stringify({ chemicals: [] })));
    const selection = {
      release: "a".repeat(64),
      model: "ideal-solution",
      ids: ["benzene", "toluene"],
    };
    await executeProjectTool("get_chemical_selection", selection, context);
    expect(network.mock.calls[1][0]).toBe("/api/chemicals/selection");
    expect(JSON.parse(network.mock.calls[1][1].body)).toEqual(selection);
    network.mockResolvedValue(
      new Response(JSON.stringify({ error: "Catalog unavailable" }), {
        status: 503,
      }),
    );
    await expect(
      executeProjectTool("get_catalog_models", {}, context),
    ).rejects.toThrow("Catalog unavailable");
    expect(context.project).toEqual(before);
  });
});

it("supports graph editing and naming atomically through the action API", () => {
  const project = hydraulicProject();
  const before = structuredClone(project);
  const edge = project.edges[0];
  const edited = applyActions(project, {
    summary: "Reorganize the column",
    actions: [
      { type: "rename_project", name: "Rated column" },
      {
        type: "update",
        id: "D-201",
        name: "Main tower",
        position: { x: 700, y: 300 },
        params: {},
      },
      {
        type: "update_stream",
        id: edge.id,
        changes: { name: "Feed to column", colorIndex: 4 },
      },
    ],
  });
  expect(edited.name).toBe("Rated column");
  expect(edited.units[1]).toMatchObject({
    name: "Main tower",
    position: { x: 700, y: 300 },
    params: project.units[1].params,
  });
  expect(edited.edges[0]).toEqual({
    ...edge,
    name: "Feed to column",
    colorIndex: 4,
  });
  const reconnect: Plan = {
    summary: "Reconnect feed",
    actions: [
      { type: "disconnect", id: edge.id },
      { type: "connect", edge },
    ],
  };
  expect(applyActions(project, reconnect).edges).toContainEqual(edge);
  expect(() =>
    applyActions(project, {
      summary: "Bad batch",
      actions: [
        reconnect.actions[0],
        { type: "update_stream", id: "missing", changes: {} },
      ],
    }),
  ).toThrow("Unknown stream");
  expect(() =>
    applyActions(project, {
      summary: "Bad port",
      actions: [
        { type: "update_stream", id: edge.id, changes: { sourcePort: "out2" } },
      ],
    }),
  ).toThrow("incompatible");
  expect(project).toEqual(before);
});

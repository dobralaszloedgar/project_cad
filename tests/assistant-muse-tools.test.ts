// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { projectMcp } from "../src/server/assistant/providers/project-mcp";
import {
  MuseProjectTools,
  museCapabilities,
} from "../src/server/assistant/providers/muse-tools";
import type { ProviderInput } from "../src/server/assistant/providers/types";
import type { StoredConversation, ToolName } from "../src/assistant/protocol";
import { executeProjectTool, projectRevision } from "../src/assistant/tools";
import { projectCapabilities } from "../src/assistant/capabilities";
import { applyActions } from "../src/domain/actions";
import { newUnit, projectSchema } from "../src/domain/schema";
import {
  catalogSnapshotSchema,
  validateSnapshot,
} from "../src/domain/thermo/data";
import { templateChemicalJson } from "../src/domain/reactions/template-chemicals";
import {
  parseProjectFile,
  serializeProjectFile,
} from "../src/lib/project-file";
import { checkpoint, type Workspace } from "../src/lib/revisions";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function selection() {
  // Preserve the actual problematic H2 coefficient, -9.687600000000001e-11.
  const all = catalogSnapshotSchema.parse(JSON.parse(templateChemicalJson));
  const indices = ["124-38-9", "1333-74-0"].map((id) =>
    all.chemicals.findIndex((c) => c.id === id),
  );
  return {
    release: all.release,
    chemicals: indices.map((i) => all.chemicals[i]),
    recordHashes: indices.map((i) => all.recordHashes[i]),
  };
}

const selectionArgs = (snapshot = selection()) => ({
  release: snapshot.release,
  ids: snapshot.chemicals.map((c) => c.id),
  model: "ideal-gas" as const,
});

it("reduces capability discovery without losing requested action validators or ports", () => {
  const full = projectCapabilities("auto");
  const compact = museCapabilities(full, ["connect", "set_thermo_model"]);
  const fullSchema = full.actionSchema as typeof compact.actionSchema;
  expect(JSON.stringify(compact).length).toBeLessThan(
    JSON.stringify(full).length / 10,
  );
  expect(compact.ports).toEqual(full.ports);
  expect(compact.units).toEqual(full.units);
  expect(compact.actionSchema.properties!.actions.items!.oneOf).toHaveLength(2);
  const actions = compact.actionSchema.properties!.actions.items!.oneOf!;
  expect(actions[0]).toEqual(fullSchema.properties!.actions.items!.oneOf![1]);
  expect(actions[1].properties).toHaveProperty("catalogRef");
  expect(actions[1].properties).not.toHaveProperty("catalog");
  expect(() => museCapabilities(full, ["invented_action"])).toThrow(
    "Unknown action type",
  );
  expect(
    fullSchema.properties!.actions.items!.oneOf![7].properties,
  ).toHaveProperty("catalog");
});

it("applies and saves incremental Muse MCP batches using exact catalog data before the final simulation", async () => {
  const root = mkdtempSync(join(tmpdir(), "pcad-muse-incremental-"));
  roots.push(root);
  const filename = join(root, "process.pcad"),
    projectId = randomUUID();
  const createdAt = new Date().toISOString();
  let project = projectSchema.parse({
    version: 1,
    name: "Empty",
    units: [],
    edges: [],
  });
  const workspace: Workspace = { version: 1, project, revisions: [] };
  const calls: ToolName[] = [];
  const snapshot = selection();
  const input = {
    conversation: { mode: "auto" } as StoredConversation,
    signal: new AbortController().signal,
    call: async (name: ToolName, args: unknown) => {
      calls.push(name);
      if (name === "get_chemical_selection") return structuredClone(snapshot);
      return executeProjectTool(name, args, {
        projectId,
        project,
        mode: "auto",
        commandId: randomUUID(),
        apply: async (proposal) => {
          if (proposal.baseRevision !== (await projectRevision(project)))
            throw new Error("Stale revision");
          project = applyActions(project, proposal.plan);
          workspace.project = project;
          workspace.revisions.push(checkpoint(project, proposal.plan.summary));
          writeFileSync(
            filename,
            serializeProjectFile({
              format: "project-cad",
              formatVersion: 1,
              projectId,
              createdAt,
              updatedAt: new Date().toISOString(),
              workspace,
            }),
          );
          return "Applied and saved.";
        },
      });
    },
  } as ProviderInput;
  const bridge = await projectMcp(input);
  const call = async (name: ToolName, args: unknown) => {
    const response = await fetch(bridge.config.url, {
      method: "POST",
      headers: { ...bridge.config.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: randomUUID(),
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    const value = await response.json();
    if (value.result?.isError) throw new Error(value.result.content[0].text);
    if (value.error) throw new Error(value.error.message);
    return JSON.parse(value.result.content[0].text);
  };
  const saved = () => parseProjectFile(readFileSync(filename, "utf8"));
  try {
    const capabilities = await call("get_capabilities", {
      actionTypes: ["add", "connect", "set_thermo_model"],
    });
    expect(
      capabilities.actionSchema.properties.actions.items.oneOf,
    ).toHaveLength(3);
    const loaded = await call(
      "get_chemical_selection",
      selectionArgs(snapshot),
    );
    expect(loaded.components.map((c: { id: string }) => c.id)).toEqual(
      selectionArgs(snapshot).ids,
    );
    expect(loaded).not.toHaveProperty("chemicals");
    const initial = await call("get_project", {});
    const componentPlan = {
      summary: "Select verified gas components",
      actions: [
        {
          type: "set_thermo_model",
          modelId: "ideal-gas",
          mixture: "catalog",
          catalogRef: loaded.catalogRef,
        },
      ],
    };
    expect(
      await call("propose_actions", {
        baseRevision: initial.revision,
        plan: JSON.stringify(componentPlan),
      }),
    ).toMatchObject({ applied: true });
    expect(saved().workspace.project.thermo!.catalog).toEqual(snapshot);
    expect(saved().workspace.project.units).toHaveLength(0);
    expect(calls).not.toContain("simulate");

    const current = await call("get_project", {});
    expect(current.revision).not.toBe(initial.revision);
    const feed = newUnit("Feed", "F1", 0, 100),
      heater = newUnit("Heater", "H1", 250, 100),
      product = newUnit("Product", "P1", 500, 100);
    Object.assign(feed.params, {
      temperature: 400,
      pressure: 101325,
      flow: 10,
      fractionA: 0.4,
    });
    Object.assign(heater.params, { temperature: 450, pressure: 101325 });
    const buildPlan = {
      summary: "Build connected heating section",
      actions: [
        ...[feed, heater, product].map((unit) => ({ type: "add", unit })),
        ...[
          ["F1", "H1"],
          ["H1", "P1"],
        ].map(([source, target], i) => ({
          type: "connect",
          edge: {
            id: `s${i}`,
            source,
            target,
            sourcePort: "out",
            targetPort: "in",
          },
        })),
      ],
    };
    // Uncertain edits can be previewed without consuming the selection reference.
    expect(
      await call("preview_actions", {
        baseRevision: current.revision,
        plan: JSON.stringify(buildPlan),
      }),
    ).toMatchObject({ applied: false, equipment: 3 });
    expect(
      await call("propose_actions", {
        baseRevision: current.revision,
        plan: JSON.stringify(buildPlan),
      }),
    ).toMatchObject({ applied: true });
    expect(saved().workspace.project.units).toHaveLength(3);
    expect(saved().workspace.revisions).toHaveLength(2);
    expect(calls).not.toContain("simulate");
    const final = await call("get_project", {});
    await expect(
      call("propose_actions", {
        baseRevision: current.revision,
        plan: JSON.stringify(buildPlan),
      }),
    ).rejects.toThrow("Stale revision");
    expect(saved().workspace.revisions).toHaveLength(2);
    const result = await call("simulate", { baseRevision: final.revision });
    expect(result.preview).toBe(false);
    expect(result.result.converged).toBe(true);
    expect(Math.abs(result.result.massResidual)).toBeLessThan(1e-8);
    expect(Math.abs(result.result.energyResidual)).toBeLessThan(1e-6);
    expect(result.result.heatDuty).toBeCloseTo(17205.397170958575, 6);
    validateSnapshot(saved().workspace.project.thermo!.catalog!);
    // Preview/simulation/apply may all reuse a reference within the same turn.
    expect(
      await call("simulate", {
        baseRevision: final.revision,
        plan: JSON.stringify(componentPlan),
      }),
    ).toMatchObject({ preview: true, result: { converged: true } });
  } finally {
    bridge.close();
  }
});

it("rejects rounded records, expired references and reference/model mismatches before handing off a mutation", async () => {
  const snapshot = selection();
  const input = { call: vi.fn(async () => structuredClone(snapshot)) };
  const adapter = new MuseProjectTools(input);
  const loaded = (await adapter.call(
    "get_chemical_selection",
    selectionArgs(snapshot),
  )) as { catalogRef: string };
  const args = (changes = {}) => ({
    baseRevision: "a".repeat(64),
    plan: JSON.stringify({
      summary: "Set thermo",
      actions: [
        {
          type: "set_thermo_model",
          modelId: "ideal-gas",
          mixture: "catalog",
          catalogRef: loaded.catalogRef,
          ...changes,
        },
      ],
    }),
  });
  input.call.mockClear();
  await expect(
    new MuseProjectTools(input).call("propose_actions", args()),
  ).rejects.toThrow("expired catalogRef");
  await expect(
    adapter.call("propose_actions", args({ modelId: "ideal-solution" })),
  ).rejects.toThrow("same model");
  await expect(
    adapter.call("propose_actions", args({ catalog: snapshot })),
  ).rejects.toThrow("catalogRef alone");
  const corrupt = structuredClone(snapshot);
  corrupt.chemicals[1].gasCp!.ranges[2].coefficients[3] = -9.6876e-11;
  await expect(
    adapter.call(
      "propose_actions",
      args({ catalogRef: undefined, catalog: corrupt }),
    ),
  ).rejects.toThrow("integrity");
  expect(input.call).not.toHaveBeenCalled();
});

it("does not cache corrupt or mismatched catalog responses", async () => {
  const snapshot = selection();
  const corrupt = structuredClone(snapshot);
  corrupt.chemicals[1].gasCp!.ranges[2].coefficients[3] = -9.6876e-11;
  const input = { call: vi.fn(async () => corrupt) };
  await expect(
    new MuseProjectTools(input).call(
      "get_chemical_selection",
      selectionArgs(snapshot),
    ),
  ).rejects.toThrow("integrity");
  input.call.mockResolvedValue(snapshot);
  await expect(
    new MuseProjectTools(input).call("get_chemical_selection", {
      ...selectionArgs(snapshot),
      ids: [...selectionArgs(snapshot).ids].reverse(),
    }),
  ).rejects.toThrow("different component selection");
});

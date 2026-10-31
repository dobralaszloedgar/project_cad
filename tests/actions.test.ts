import { describe, it, expect } from "vitest";
import { applyActions, planSchema } from "../src/domain/actions";
import { distillationExample, reactorExample } from "../src/domain/examples";
import { checkpoint, restore, diff } from "../src/lib/revisions";
import { parseImport } from "../src/lib/storage";
import { projectSchema } from "../src/domain/schema";
describe("actions and local revisions", () => {
  it("rejects executable and unknown actions", () => {
    expect(() =>
      planSchema.parse({
        summary: "bad",
        actions: [{ type: "shell", command: "anything" }],
      }),
    ).toThrow();
  });
  it("validates proposals atomically without mutating source", () => {
    const p = reactorExample();
    expect(() =>
      applyActions(p, {
        summary: "bad",
        actions: [
          { type: "update", id: "R-101", params: { temperature: 500 } },
          { type: "update", id: "absent", params: {} },
        ],
      }),
    ).toThrow();
    expect(p.units[3].params.temperature).toBe(450);
  });
  it("restores as new history and preserves later edits", () => {
    const p = reactorExample(),
      first = checkpoint(p, "Initial");
    const newer = applyActions(p, {
      summary: "Heat",
      actions: [{ type: "update", id: "R-101", params: { temperature: 500 } }],
    });
    const state = restore(
      {
        version: 1,
        project: newer,
        revisions: [first, checkpoint(newer, "Hotter")],
      },
      first,
    );
    expect(state.revisions).toHaveLength(4);
    expect(state.revisions[1].project.units[3].params.temperature).toBe(500);
    expect(state.project.units[3].params.temperature).toBe(450);
    expect(diff(p, newer).changed).toHaveLength(1);
  });
  it("round-trips JSON and rejects unsupported versions", () => {
    const p = reactorExample();
    expect(parseImport(JSON.stringify(p)).project).toEqual(
      projectSchema.parse(p),
    );
    expect(() => parseImport(JSON.stringify({ ...p, version: 2 }))).toThrow();
  });
});

it("a partial AI update preserves existing non-default operating conditions", () => {
  const p = reactorExample();
  p.units[3].params.residenceTime = 42;
  p.units[3].params.pressure = 200000;
  const updated = applyActions(p, {
    summary: "Temperature only",
    actions: [{ type: "update", id: "R-101", params: { temperature: 500 } }],
  });
  expect(updated.units[3].params.temperature).toBe(500);
  expect(updated.units[3].params.residenceTime).toBe(42);
  expect(updated.units[3].params.pressure).toBe(200000);
});

it("tray-only actions preserve operating conditions and later operating edits preserve the tray count", () => {
  const project = distillationExample();
  const column = project.units[1];
  column.params.relativeVolatility = 6;
  column.params.distillateFraction = 0.3;
  column.params.pressure = 200000;
  for (const trayCount of [2, 80]) {
    const resized = applyActions(project, {
      summary: "Resize the visible column",
      actions: [{ type: "update", id: column.id, params: { trayCount } }],
    });
    expect(resized.units[1].params).toEqual({
      ...column.params,
      trayCount,
    });
    const edited = applyActions(resized, {
      summary: "Change the ideal separation setting",
      actions: [
        { type: "update", id: column.id, params: { relativeVolatility: 7 } },
      ],
    });
    expect(edited.units[1].params.trayCount).toBe(trayCount);
    expect(resized.units[1].params.relativeVolatility).toBe(6);
  }
  expect(column.params.trayCount).toBe(8);
});

it.each([1, 81, 2.5])(
  "rejects invalid tray count %s atomically",
  (trayCount) => {
    const project = distillationExample();
    const before = structuredClone(project);
    expect(() =>
      applyActions(project, {
        summary: "Invalid visual edit",
        actions: [
          { type: "update", id: "D-201", params: { relativeVolatility: 7 } },
          { type: "update", id: "D-201", params: { trayCount } },
        ],
      }),
    ).toThrow();
    expect(project).toEqual(before);
  },
);

it("keeps old project and action payloads compatible without injecting update defaults", () => {
  const legacy = JSON.parse(JSON.stringify(distillationExample()));
  for (const unit of legacy.units) delete unit.params.trayCount;
  const plan = planSchema.parse({
    summary: "An older operating update",
    actions: [
      { type: "update", id: "D-201", params: { relativeVolatility: 5 } },
    ],
  });
  expect(plan.actions[0]).toEqual({
    type: "update",
    id: "D-201",
    params: { relativeVolatility: 5 },
  });
  const updated = applyActions(legacy, plan);
  expect(updated.units[1].params.trayCount).toBe(8);
  expect(updated.units[1].params.relativeVolatility).toBe(5);
});

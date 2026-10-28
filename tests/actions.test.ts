import { describe, it, expect } from "vitest";
import { applyActions, planSchema } from "../src/domain/actions";
import { reactorExample } from "../src/domain/examples";
import { checkpoint, restore, diff } from "../src/lib/revisions";
import { parseImport } from "../src/lib/storage";
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
    expect(parseImport(JSON.stringify(p)).project).toEqual(p);
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

import { describe, expect, it } from "vitest";
import { nameStreams, availableStreamName } from "../src/domain/stream-names";
import { edgeSchema, projectSchema } from "../src/domain/schema";
import { heatingExample } from "../src/domain/examples";
import { applyActions } from "../src/domain/actions";
import { parseImport } from "../src/lib/storage";

describe("automatic stream names", () => {
  it("names legacy streams in order without changing internal IDs or input data", () => {
    const original = heatingExample();
    const parsed = projectSchema.parse(original);
    expect(parsed.edges.map((edge) => edge.name)).toEqual([
      "Stream 1",
      "Stream 2",
    ]);
    expect(parsed.edges.map((edge) => edge.id)).toEqual(
      original.edges.map((edge) => edge.id),
    );
    expect(original.edges[0].name).toBeUndefined();
  });
  it("reserves existing names case-insensitively and preserves custom names", () => {
    const streams = nameStreams([
      { id: "a" },
      { id: "b", name: "STREAM 1" },
      { id: "c", name: "Recycle" },
    ]);
    expect(streams.map((stream) => stream.name)).toEqual([
      "Stream 2",
      "STREAM 1",
      "Recycle",
    ]);
    expect(availableStreamName(streams)).toBe("Stream 3");
    expect(availableStreamName(streams.slice(1))).toBe("Stream 2");
  });
  it("repairs duplicate default names while preserving custom names", () => {
    expect(
      nameStreams([
        { id: "a", name: "Stream 2" },
        { id: "b", name: "stream 2" },
        { id: "c", name: "Reactor feed" },
      ]).map((stream) => stream.name),
    ).toEqual(["Stream 1", "Stream 2", "Reactor feed"]);
  });
  it("allocates names for actions after deletion without renumbering survivors", () => {
    const project = projectSchema.parse(heatingExample());
    const removed = project.edges.shift()!;
    const updated = applyActions(project, {
      summary: "Reconnect feed",
      actions: [
        {
          type: "connect",
          edge: { ...removed, id: "new-stream", name: undefined },
        },
      ],
    });
    expect(updated.edges.map((edge) => edge.name)).toEqual([
      "Stream 2",
      "Stream 1",
    ]);
    expect(project.edges).toHaveLength(1);
  });
  it("persists names and manual colors through import, including revision snapshots", () => {
    const project = projectSchema.parse(heatingExample());
    project.edges[0] = {
      ...project.edges[0],
      name: "Fresh feed",
      colorIndex: 7,
    };
    const workspace = {
      version: 1,
      project,
      revisions: [{ id: "r1", label: "Named", time: "now", project }],
    };
    expect(parseImport(JSON.stringify(workspace))).toEqual(workspace);
  });
  it("validates editable names and palette bounds", () => {
    const edge = heatingExample().edges[0];
    for (const colorIndex of [-1, 8, 0.5])
      expect(edgeSchema.safeParse({ ...edge, colorIndex }).success).toBe(false);
    for (const name of ["", "   ", "x".repeat(61)])
      expect(edgeSchema.safeParse({ ...edge, name }).success).toBe(false);
  });
});

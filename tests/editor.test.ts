import { describe, it, expect } from "vitest";
import { catalystExample } from "../src/domain/examples";
import {
  copySelection,
  deleteSelection,
  pasteSelection,
} from "../src/domain/editor";
import { migrateReactorInlets } from "../src/domain/project-migrations";
import { availableEquipmentTag } from "../src/domain/equipment-tags";
import { ports, validateGraph } from "../src/domain/schema";
import { parseImport } from "../src/lib/storage";
import { simulate } from "../src/domain/solver";

describe("canvas editing", () => {
  it("allocates readable equipment tags without colliding with existing identifiers", () => {
    const equipment = [
      { id: "R-101" },
      { id: "r-102" },
      { id: "PBR-bec83e" },
      { id: "R-104" },
    ];
    expect(availableEquipmentTag("PBR", equipment)).toBe("R-103");
    expect(availableEquipmentTag("Cooler", equipment)).toBe("C-101");
    expect(equipment.map((unit) => unit.id)).toEqual([
      "R-101",
      "r-102",
      "PBR-bec83e",
      "R-104",
    ]);
  });
  it("reserves numbered tags across repeated pastes and reconnects the copied feeds", () => {
    const project = catalystExample();
    const copy = copySelection(project, ["F-601", "F-602", "M-601"]);
    const first = pasteSelection(project, copy);
    const second = pasteSelection(first.project, copy);
    expect(first.selection).toEqual(["F-101", "F-102", "M-101"]);
    expect(second.selection).toEqual(["F-103", "F-104", "M-102"]);
    expect(validateGraph(second.project)).toEqual([]);
    expect(
      second.project.edges.slice(-2).map(({ source, target }) => ({
        source,
        target,
      })),
    ).toEqual([
      { source: "F-103", target: "M-102" },
      { source: "F-104", target: "M-102" },
    ]);
    expect(second.project.units.slice(0, project.units.length)).toEqual(
      project.units,
    );
  });
  it("duplicates only internal connections with fresh IDs and independent parameters", () => {
    const project = catalystExample();
    const copy = copySelection(project, ["M-601", "R-601"]);
    const next = pasteSelection(project, copy);
    expect(next.selection).toHaveLength(2);
    expect(next.project.edges).toHaveLength(project.edges.length + 1);
    expect(validateGraph(next.project)).toEqual([]);
    const stream = next.project.edges.at(-1)!;
    expect(next.selection).toContain(stream.source);
    expect(next.selection).toContain(stream.target);
    expect(new Set(next.project.edges.map((edge) => edge.name)).size).toBe(
      next.project.edges.length,
    );
    next.project.units.at(-1)!.params.catalystMass = 123;
    expect(
      project.units.find((unit) => unit.id === "R-601")!.params.catalystMass,
    ).toBe(10);
    expect(copy.units.at(-1)!.params.catalystMass).toBe(10);
  });
  it("deletes incident streams and allows deleting a stream alone", () => {
    const project = catalystExample();
    const next = deleteSelection(project, ["M-601"]);
    expect(next.edges).toHaveLength(1);
    expect(validateGraph(next)).toEqual([]);
    const streamOnly = deleteSelection(project, [project.edges[0].id]);
    expect(streamOnly.units).toEqual(project.units);
    expect(streamOnly.edges).toHaveLength(project.edges.length - 1);
  });
});

describe("single-inlet reactor projects", () => {
  function legacyProject() {
    const project = catalystExample();
    project.units = project.units.filter((unit) => unit.kind !== "Mixer");
    project.edges = project.edges.filter((edge) => edge.source !== "M-601");
    for (const edge of project.edges)
      if (edge.target === "M-601") edge.target = "R-601";
    return project;
  }
  it("migrates saved projects and revisions without dropping streams or changing balances", () => {
    const original = legacyProject();
    const workspace = parseImport(
      JSON.stringify({
        version: 1,
        project: original,
        revisions: [
          {
            id: "before",
            label: "Saved",
            time: "2026-10-28",
            project: original,
          },
        ],
      }),
    );
    for (const project of [workspace.project, workspace.revisions[0].project]) {
      expect(validateGraph(project, true)).toEqual([]);
      expect(
        project.edges.filter((edge) => edge.target === "R-601"),
      ).toHaveLength(1);
      expect(
        project.edges.filter((edge) => edge.target === "R-601")[0].targetPort,
      ).toBe("in");
      expect(
        project.units.filter((unit) => unit.kind === "Mixer"),
      ).toHaveLength(1);
      expect(simulate(project).energyResidual).toBeCloseTo(0, 6);
      expect(migrateReactorInlets(project)).toEqual(project);
    }
    expect(original.units.some((unit) => unit.kind === "Mixer")).toBe(false);
    expect(ports("PBR")).toEqual({ inputs: ["in"], outputs: ["out"] });
  });
  it("remaps an isolated former side inlet without adding unnecessary equipment", () => {
    const project = legacyProject();
    project.edges = project.edges.filter((edge) => edge.id !== "feed-a");
    const migrated = migrateReactorInlets(project);
    expect(migrated.units).toHaveLength(project.units.length);
    expect(
      migrated.edges.find((edge) => edge.id === "feed-b")!.targetPort,
    ).toBe("in");
  });
});

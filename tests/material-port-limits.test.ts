// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { describe, expect, it } from "vitest";
import { applyActions } from "../src/domain/actions";
import { defaultDistillation } from "../src/domain/equipment/distillation-schema";
import { migrateReactorInlets } from "../src/domain/project-migrations";
import {
  newUnit,
  ports,
  validateGraph,
  type Connection,
  type Project,
  type Unit,
} from "../src/domain/schema";
import { operate, simulate } from "../src/domain/solver";
import { parseImport } from "../src/lib/storage";
import { reactionProject } from "./helpers/reactions";

const scenarios: {
  name: string;
  unit: () => Unit;
  outputs: Connection["sourcePort"][];
}[] = [
  ...(["residence-time", "catalyst-weight", "reaction-set"] as const).map(
    (mode) => ({
      name: `PBR ${mode}`,
      unit: () => {
        if (mode === "reaction-set") return reactionProject().units[1];
        const unit = newUnit("PBR", "reactor", 0, 0);
        unit.params.reactorMode = mode;
        return unit;
      },
      outputs: ["out"] as Connection["sourcePort"][],
    }),
  ),
  ...(["legacy", "fug", "mesh"] as const).map((method) => ({
    name: `Distillation ${method}`,
    unit: () => {
      const unit = newUnit("Distillation", "column", 0, 0);
      if (method !== "legacy")
        unit.params.distillation = {
          ...defaultDistillation(["A", "B"]),
          method,
        };
      return unit;
    },
    outputs: ["out", "out2"] as Connection["sourcePort"][],
  })),
];

describe.each(scenarios)(
  "$name material ports",
  ({ unit: makeUnit, outputs }) => {
    function fixture(): Project {
      const unit = makeUnit();
      return {
        version: 1,
        name: "Single-stream ports",
        units: [
          newUnit("Feed", "feed", 0, 0),
          unit,
          ...outputs.map((port) => newUnit("Product", `product-${port}`, 0, 0)),
        ],
        edges: [
          {
            id: "inlet",
            source: "feed",
            sourcePort: "out",
            target: unit.id,
            targetPort: "in",
            color: "teal",
          },
          ...outputs.map((port): Connection => ({
            id: port,
            source: unit.id,
            sourcePort: port,
            target: `product-${port}`,
            targetPort: "in",
            color: "teal",
          })),
        ],
      };
    }

    it("accepts exactly one inlet and one stream per supported outlet", () => {
      const project = fixture();
      expect(ports(project.units[1].kind)).toEqual({ inputs: ["in"], outputs });
      expect(validateGraph(project, true)).toEqual([]);
      for (const edge of project.edges)
        expect(
          validateGraph(
            {
              ...project,
              edges: project.edges.filter((item) => item !== edge),
            },
            true,
          ),
        ).not.toEqual([]);
    });

    it("rejects a second feed in graph edits and standalone calculations", () => {
      const project = fixture();
      const feed = newUnit("Feed", "extra-feed", 0, 0);
      project.units.push(feed);
      const edge = { ...project.edges[0], id: "extra-inlet", source: feed.id };
      const invalid = { ...project, edges: [...project.edges, edge] };
      expect(validateGraph(invalid)).toContain(
        "Each port accepts one stream; use a mixer or splitter.",
      );
      expect(() => simulate(invalid)).toThrow(/Each port accepts one stream/);
      expect(() =>
        applyActions(project, {
          summary: "Add feed",
          actions: [{ type: "connect", edge }],
        }),
      ).toThrow(/Each port accepts one stream/);
      const inlet = { a: 1, b: 0, temperature: 450, pressure: 101325 };
      expect(() => operate(project.units[1], [inlet, inlet])).toThrow(
        /too many material inlets/,
      );
      expect(project.edges).toHaveLength(1 + outputs.length);
    });

    it("rejects branching an occupied outlet through connections and stream edits", () => {
      const project = fixture();
      project.units.push(newUnit("Product", "extra-product", 0, 0));
      for (const port of outputs) {
        const edge: Connection = {
          id: "branch",
          source: project.units[1].id,
          sourcePort: port,
          target: "extra-product",
          targetPort: "in",
          color: "teal",
        };
        expect(() =>
          applyActions(project, {
            summary: "Branch outlet",
            actions: [{ type: "connect", edge }],
          }),
        ).toThrow(/Each port accepts one stream/);
        project.units.push(newUnit("Feed", "extra-feed", 0, 0));
        project.edges.push({
          ...edge,
          source: "extra-feed",
          sourcePort: "out",
        });
        expect(() =>
          applyActions(project, {
            summary: "Reconnect stream",
            actions: [
              {
                type: "update_stream",
                id: edge.id,
                changes: { source: edge.source, sourcePort: port },
              },
            ],
          }),
        ).toThrow(/Each port accepts one stream/);
        project.edges.pop();
        project.units.pop();
      }
    });

    it("rejects additional numbered inlet and outlet fittings", () => {
      const project = fixture();
      for (const targetPort of ["in2", "in3", "in4"] as const) {
        const invalid = structuredClone(project);
        invalid.edges[0].targetPort = targetPort;
        expect(validateGraph(invalid).join(" ")).toMatch(
          /incompatible material ports/,
        );
      }
      for (const sourcePort of ["out2", "out3", "out4"] as const) {
        if (outputs.includes(sourcePort)) continue;
        const invalid = structuredClone(project);
        invalid.edges[1].sourcePort = sourcePort;
        expect(validateGraph(invalid).join(" ")).toMatch(
          /incompatible material ports/,
        );
      }
    });
  },
);

it.each([2, 4, 5, 8])(
  "preserves %i formerly shared PBR feeds with upstream mixers on import",
  (count) => {
    const original = reactionProject();
    for (let index = 1; index < count; index++) {
      const feed = {
        ...structuredClone(original.units[0]),
        id: `feed-${index}`,
      };
      original.units.push(feed);
      original.edges.push({
        ...original.edges[0],
        id: `inlet-${index}`,
        source: feed.id,
      });
    }
    const before = structuredClone(original);
    const workspace = parseImport(
      JSON.stringify({
        version: 1,
        project: original,
        revisions: [
          {
            id: "legacy",
            label: "Saved",
            time: "2026-11-02",
            project: original,
          },
        ],
      }),
    );
    for (const project of [workspace.project, workspace.revisions[0].project]) {
      expect(validateGraph(project, true)).toEqual([]);
      expect(
        project.edges.filter((edge) => edge.target === "R-101"),
      ).toHaveLength(1);
      for (const edge of original.edges)
        expect(project.edges.some((item) => item.id === edge.id)).toBe(true);
      for (const mixer of project.units.filter((unit) => unit.kind === "Mixer"))
        expect(
          project.edges.filter((edge) => edge.target === mixer.id).length,
        ).toBeLessThanOrEqual(4);
      const result = simulate(project);
      expect(result.streams.product.components!["7727-37-9"]).toBeCloseTo(
        4 * count,
        8,
      );
      expect(result.massResidual).toBeCloseTo(0, 8);
      expect(Math.abs(result.energyResidual)).toBeLessThan(1e-3);
      expect(migrateReactorInlets(project)).toEqual(project);
    }
    expect(original).toEqual(before);
  },
);

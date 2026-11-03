// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { describe, expect, it } from "vitest";
import { Group, Mesh, Vector3 } from "three";
import {
  newUnit,
  paramsSchema,
  projectSchema,
  visiblePorts,
} from "../src/domain/schema";
import {
  connectedUnitPorts,
  junctionBranchCount,
} from "../src/domain/material-ports";
import { equipmentPort } from "../src/components/flow-geometry";
import { junctionConnectors } from "../src/components/equipment-symbols";
import { acquireEquipmentModel } from "../src/components/equipment-3d/model-resources";
import { disposeEquipmentModel } from "../src/components/equipment-3d/models";
import { createProcessContents } from "../src/components/equipment-3d/process-contents";
import { OperationClock } from "../src/components/equipment-3d/operation";
import { equipmentPorts } from "../src/components/equipment-3d/system-geometry";
import { buildProjectPlant } from "../src/components/equipment-3d/project-plant";
import { fourBranchProject } from "./helpers/four-branch-project";
import { applyActions } from "../src/domain/actions";

function hasGeometryNear(model: Group, point: number[]) {
  model.updateMatrixWorld(true);
  const target = new Vector3(...point);
  const vertex = new Vector3();
  let found = false;
  model.traverse((part) => {
    if (found || !(part instanceof Mesh)) return;
    const positions = part.geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index++) {
      vertex
        .fromBufferAttribute(positions, index)
        .applyMatrix4(part.matrixWorld);
      if (vertex.distanceTo(target) < 0.15) {
        found = true;
        break;
      }
    }
  });
  return found;
}

describe("dynamic junction branches", () => {
  it("starts with two branches and keeps configured spare ports across serialization", () => {
    for (const kind of ["Mixer", "Splitter"] as const) {
      const unit = newUnit(kind, kind, 0, 0);
      const direction = kind === "Mixer" ? "inputs" : "outputs";
      expect(visiblePorts(unit)[direction]).toHaveLength(2);
      unit.params.branchCount = 3;
      const restored = projectSchema.parse(
        JSON.parse(
          JSON.stringify({
            version: 1,
            name: kind,
            units: [unit],
            edges: [],
          }),
        ),
      );
      expect(visiblePorts(restored.units[0])[direction]).toHaveLength(3);
      const updated = applyActions(restored, {
        summary: "Reserve a fourth branch",
        actions: [{ type: "update", id: unit.id, params: { branchCount: 4 } }],
      });
      expect(visiblePorts(updated.units[0])[direction]).toHaveLength(4);
    }
    for (const branchCount of [1, 2.5, 5])
      expect(paramsSchema.safeParse({ branchCount }).success).toBe(false);
  });

  it("reveals connected and nonzero legacy branches without showing padded zero fractions", () => {
    const mixer = newUnit("Mixer", "M", 0, 0);
    const splitter = newUnit("Splitter", "S", 0, 0);
    expect(visiblePorts(mixer, ["in", "in2", "in3"]).inputs).toHaveLength(3);
    expect(visiblePorts(mixer, ["in4"]).inputs).toHaveLength(4);
    expect(visiblePorts(splitter, ["out4"]).outputs).toHaveLength(4);
    splitter.params.splitFractions = [0.5, 0.5, 0, 0];
    expect(visiblePorts(splitter).outputs).toHaveLength(2);
    splitter.params.splitFractions = [0.2, 0.3, 0.5];
    expect(visiblePorts(splitter).outputs).toHaveLength(3);
    for (const unit of projectSchema.parse(fourBranchProject(true)).units)
      if (unit.kind === "Mixer" || unit.kind === "Splitter")
        expect(
          junctionBranchCount(
            unit,
            connectedUnitPorts(unit, fourBranchProject().edges),
          ),
        ).toBe(4);
  });

  it.each([2, 3, 4])(
    "aligns %i branches with 2D connectors and 3D fittings and fluid",
    (branchCount) => {
      for (const kind of ["Mixer", "Splitter"] as const) {
        const connectors = junctionConnectors(kind, branchCount);
        const locations = Array.from({ length: branchCount }, (_, index) =>
          equipmentPort(
            kind,
            kind === "Splitter",
            index,
            undefined,
            branchCount,
          ),
        );
        expect(locations[0].y + locations.at(-1)!.y).toBe(128);
        expect(new Set(locations.map(({ y }) => y)).size).toBe(branchCount);
        for (const { y } of locations)
          expect(connectors).toContain(
            kind === "Mixer" ? `M8 ${y}H40` : `M88 ${y}H120`,
          );

        // Acquire different variants concurrently to catch a missing cache key.
        const baseline = acquireEquipmentModel(kind);
        const current = acquireEquipmentModel(kind, false, false, {
          branchCount,
        });
        const clear = acquireEquipmentModel(kind, false, true, { branchCount });
        const fluid = createProcessContents(
          kind,
          true,
          new OperationClock(),
          undefined,
          { branchCount },
        );
        try {
          const extras = kind === "Mixer" ? ["in3", "in4"] : ["c", "d"];
          extras.forEach((port, index) => {
            const point = equipmentPorts[kind][port];
            expect(hasGeometryNear(baseline.model, point)).toBe(false);
            expect(hasGeometryNear(current.model, point)).toBe(
              index + 3 <= branchCount,
            );
            expect(hasGeometryNear(clear.model, point)).toBe(
              index + 3 <= branchCount,
            );
            expect(hasGeometryNear(fluid.group, point)).toBe(
              index + 3 <= branchCount,
            );
          });
          expect(
            fluid.group.children.filter((part) => part.name === "liquid-core"),
          ).toHaveLength(branchCount + 1);
        } finally {
          baseline.release();
          current.release();
          clear.release();
          disposeEquipmentModel(fluid.group);
        }
      }
    },
  );

  it("updates cached 3D plants for spare ports and derives counts for connected branches", () => {
    const project = fourBranchProject();
    const full = buildProjectPlant(project);
    for (const id of ["M", "S"])
      expect(full.equipment.find((item) => item.id === id)?.branchCount).toBe(
        4,
      );
    const spare = {
      ...project,
      name: "Spare branches",
      units: [newUnit("Mixer", "M", 0, 0), newUnit("Splitter", "S", 200, 0)],
      edges: [],
    };
    const two = buildProjectPlant(spare);
    expect(two.equipment.map((item) => item.branchCount)).toEqual([2, 2]);
    spare.units.forEach((unit) => {
      unit.params.branchCount = 3;
    });
    const three = buildProjectPlant(spare);
    expect(three).not.toBe(two);
    expect(three.equipment.map((item) => item.branchCount)).toEqual([3, 3]);
  });
});

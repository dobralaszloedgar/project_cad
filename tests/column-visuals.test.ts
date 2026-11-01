import { describe, expect, it } from "vitest";
import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  TubeGeometry,
  Vector3,
} from "three";
import { columnDiagramLayout } from "../src/domain/column-geometry";
import { columnSymbol } from "../src/components/column-symbol";
import { equipmentPort } from "../src/components/flow-geometry";
import {
  columnLayout,
  columnOverhead,
} from "../src/components/equipment-3d/column-layout";
import { refluxTeeGeometry } from "../src/components/equipment-3d/column-details";
import { createProcessContents } from "../src/components/equipment-3d/process-contents";
import {
  createEquipmentModel,
  disposeEquipmentModel,
} from "../src/components/equipment-3d/models";
import { OperationClock } from "../src/components/equipment-3d/operation";
import { arrangeFlowsheet } from "../src/domain/flowsheet-layout";
import { plantTemplate } from "../src/domain/plant-templates";

describe("tray-driven column views", () => {
  it.each([2, 8, 24, 80])(
    "keeps all %i numbered trays, feed and product ports within the drawing",
    (count) => {
      const diagram = columnSymbol(count);
      expect(
        [...diagram.body.matchAll(/data-column-tray="(\d+)"/g)].map((m) =>
          Number(m[1]),
        ),
      ).toEqual(Array.from({ length: count }, (_, i) => i + 1));
      for (const part of [
        "condenser",
        "reflux-receiver",
        "reflux-splitter",
        "reboiler",
      ])
        expect(diagram.body).toContain(`data-column-equipment="${part}"`);
      const inlet = equipmentPort("Distillation", false, 0, count);
      const distillate = equipmentPort("Distillation", true, 0, count);
      const bottoms = equipmentPort("Distillation", true, 1, count);
      expect(inlet.y).toBeGreaterThanOrEqual(diagram.first);
      expect(inlet.y).toBeLessThanOrEqual(diagram.last);
      expect(distillate.y).toBeLessThan(diagram.first);
      expect(bottoms.y).toBeGreaterThan(diagram.last);
      expect(bottoms.y).toBeLessThan(diagram.height);
      expect(diagram.connectors).toContain(`M8 ${inlet.y}H34`);
      expect(diagram.connectors).toContain(`M96 ${distillate.y}H120`);
      expect(diagram.connectors).toContain(`V${bottoms.y}H120`);
    },
  );

  it("adds height without widening or stretching the auxiliary equipment", () => {
    const short = columnSymbol(2),
      tall = columnSymbol(80);
    expect(tall.height).toBeGreaterThan(short.height * 2);
    expect(tall.width).toBe(short.width);
    expect(tall.distillateY).toBe(short.distillateY);
    expect(
      tall.body.match(/<g data-column-equipment="condenser">.*?<\/g>/)?.[0],
    ).toBe(
      short.body.match(/<g data-column-equipment="condenser">.*?<\/g>/)?.[0],
    );
  });

  it("arranges tall columns without overlapping equipment or labels in the next row", () => {
    const project = plantTemplate("fractionation-complex")!;
    for (const unit of project.units)
      if (unit.kind === "Distillation") unit.params.trayCount = 80;
    const arranged = arrangeFlowsheet(project, { width: 1200, height: 900 });
    for (const unit of arranged.units) {
      const height =
        unit.kind === "Distillation" ? columnDiagramLayout(80).height : 128;
      for (const other of arranged.units.filter(
        (other) =>
          other.position.x === unit.position.x &&
          other.position.y > unit.position.y,
      ))
        expect(other.position.y - unit.position.y).toBeGreaterThan(height + 58);
    }
  });
});

describe("physical reflux splitter", () => {
  it("has open bores through the run and from the inlet to the split", () => {
    const mesh = new Mesh(
      refluxTeeGeometry(),
      new MeshBasicMaterial({ side: DoubleSide }),
    );
    mesh.updateMatrixWorld();
    for (const z of [-0.02, 0, 0.02]) {
      const run = new Raycaster(
        new Vector3(-0.2, 0, z),
        new Vector3(1, 0, 0),
        0,
        0.4,
      );
      expect(run.intersectObject(mesh)).toHaveLength(0);
      const branch = new Raycaster(
        new Vector3(0, 0.22, z),
        new Vector3(0, -1, 0),
        0,
        0.22,
      );
      expect(branch.intersectObject(mesh)).toHaveLength(0);
      const wall = new Raycaster(
        new Vector3(0, 0.1, 0.2),
        new Vector3(0, 0, -1),
        0,
        0.4,
      );
      expect(wall.intersectObject(mesh).length).toBeGreaterThan(0);
    }
    mesh.geometry.dispose();
    mesh.material.dispose();
  });

  it.each([2, 8, 24, 80])(
    "keeps all reflux flow branches connected at %i trays",
    (trayCount) => {
      const options = { trayCount },
        overhead = columnOverhead(options);
      const fluid = createProcessContents(
        "Distillation",
        true,
        new OperationClock(),
        undefined,
        options,
      );
      const at = (name: string, t: number) =>
        (
          (fluid.group.getObjectByName(name) as Mesh).geometry as TubeGeometry
        ).parameters.path.getPoint(t);
      const joint = at("column-inlet-flow", 1);
      expect(at("column-reflux-flow", 0).distanceTo(joint)).toBeLessThan(1e-8);
      expect(at("column-distillate-flow", 0).distanceTo(joint)).toBeLessThan(
        1e-8,
      );
      expect(joint.toArray()).toEqual(overhead.split);
      expect(joint.y).toBeGreaterThan(columnLayout(options).trays.at(-1)!);
      const model = createEquipmentModel("Distillation", false, true, options);
      for (const part of [
        "reflux-splitter",
        "reflux-receiver",
        "reflux-control-valve",
        "distillate-control-valve",
      ])
        expect(model.getObjectByName(part)).toBeDefined();
      disposeEquipmentModel(model);
      disposeEquipmentModel(fluid.group);
    },
  );
});

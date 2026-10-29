import { describe, expect, it } from "vitest";
import {
  distillationExample,
  heatingExample,
  reactorExample,
} from "../src/domain/examples";
import {
  newUnit,
  projectSchema,
  validateGraph,
  type Project,
} from "../src/domain/schema";
import {
  buildProjectPlant,
  modelPort,
} from "../src/components/equipment-3d/project-plant";
import {
  equipmentEnvelope,
  segmentTouchesBox,
} from "../src/components/equipment-3d/plant-routing";
import {
  rackMembers,
  worldPort,
  type SystemExample,
} from "../src/components/equipment-3d/system-geometry";
import { plantTemplate, plantTemplates } from "../src/domain/plant-templates";
import { simulate } from "../src/domain/solver";
import { compactPlantLayout } from "../src/components/equipment-3d/plant-layout";
import {
  getComplexSystem,
  complexSystems,
} from "../src/components/equipment-3d/complex-systems";
import type { Point } from "../src/components/equipment-3d/operation";

function checkPlant(project: Project, plant: SystemExample) {
  expect(plant.equipment.map((item) => item.id).sort()).toEqual(
    project.units.map((unit) => unit.id).sort(),
  );
  expect(plant.streams.map((item) => item.id)).toEqual(
    project.edges.map((edge) => edge.id),
  );
  const segments: { a: Point; b: Point; id: string }[] = [];
  for (const edge of project.edges) {
    const stream = plant.streams.find((item) => item.id === edge.id)!;
    const source = project.units.find((unit) => unit.id === edge.source)!;
    const target = project.units.find((unit) => unit.id === edge.target)!;
    expect(stream.from).toEqual([
      source.id,
      modelPort(source.kind, edge.sourcePort),
    ]);
    expect(stream.to).toEqual([
      target.id,
      modelPort(target.kind, edge.targetPort),
    ]);
    expect(stream.points[0]).toEqual(worldPort(plant.equipment, stream.from));
    expect(stream.points.at(-1)).toEqual(worldPort(plant.equipment, stream.to));
    for (let i = 1; i < stream.points.length; i++) {
      const a = stream.points[i - 1],
        b = stream.points[i];
      expect(b.filter((value, axis) => value !== a[axis])).toHaveLength(1);
      for (const item of plant.equipment) {
        if (i === 1 && item.id === source.id) continue;
        if (i === stream.points.length - 1 && item.id === target.id) continue;
        expect(
          segmentTouchesBox(a, b, equipmentEnvelope(item), 0.065),
          `${edge.id} intersects ${item.id}`,
        ).toBe(false);
      }
      for (const other of segments) {
        if (other.id === stream.id) continue;
        const box = {
          min: other.a.map((v, axis) => Math.min(v, other.b[axis])) as Point,
          max: other.a.map((v, axis) => Math.max(v, other.b[axis])) as Point,
        };
        expect(
          segmentTouchesBox(a, b, box, 0.13),
          `${edge.id} crosses ${other.id}`,
        ).toBe(false);
      }
      segments.push({ a, b, id: stream.id });
      if (plant.site)
        for (const member of rackMembers(plant.site.rack)) {
          const box = {
            min: member.center.map(
              (v, axis) => v - member.size[axis] / 2,
            ) as Point,
            max: member.center.map(
              (v, axis) => v + member.size[axis] / 2,
            ) as Point,
          };
          expect(
            segmentTouchesBox(a, b, box, 0.03),
            `${edge.id} clips rack`,
          ).toBe(false);
        }
    }
  }
  for (let i = 0; i < plant.equipment.length; i++) {
    const a = equipmentEnvelope(plant.equipment[i]);
    for (const item of plant.equipment.slice(i + 1)) {
      const b = equipmentEnvelope(item);
      expect(
        a.max[0] + 0.25 < b.min[0] ||
          b.max[0] + 0.25 < a.min[0] ||
          a.max[2] + 0.25 < b.min[2] ||
          b.max[2] + 0.25 < a.min[2],
        `${plant.equipment[i].id} crowds ${item.id}`,
      ).toBe(true);
    }
  }
}

describe("project 3D integration", () => {
  it.each([heatingExample, distillationExample, reactorExample])(
    "connects %s without changing the saved project",
    (factory) => {
      const project = factory(),
        before = JSON.stringify(project);
      checkPlant(project, buildProjectPlant(project));
      expect(JSON.stringify(project)).toBe(before);
    },
  );
  it.each(plantTemplates)(
    "uses the approved $id plot plan with real project identities",
    (definition) => {
      const project = plantTemplate(definition.id)!;
      const before = JSON.stringify(project);
      expect(validateGraph(project, true)).toEqual([]);
      const plant = buildProjectPlant(project);
      const approved = compactPlantLayout(definition.id, definition.equipment);
      for (const reference of approved.equipment) {
        const actual = plant.equipment.find(
          (item) => item.id === reference.tag,
        )!;
        expect(actual.position).toEqual(reference.position);
        expect(actual.turn).toBe(reference.turn);
      }
      checkPlant(project, plant);
      expect(JSON.stringify(project)).toBe(before);
      expect(simulate(project).converged).toBe(true);
    },
  );
  it.each(
    plantTemplates.filter((definition) => definition.id.endsWith("-complex")),
  )(
    "$id preserves authored column heights and provides enough rack lanes",
    (definition) => {
      const system = getComplexSystem(definition.id)!;
      const metadata = complexSystems.find(
        (item) => item.id === definition.id,
      )!;
      expect(system.site!.rack.levels.length * 9).toBeGreaterThanOrEqual(
        system.streams.length,
      );
      expect(system.site!.equipmentArea).toBeLessThan(
        system.site!.previousEquipmentArea,
      );
      expect(
        metadata.equipment.map((item) => [
          item.id,
          item.position,
          item.trayCount,
        ]),
      ).toEqual(
        system.equipment.map((item) => [
          item.id,
          item.position,
          item.trayCount,
        ]),
      );
      for (const item of definition.equipment.filter(
        (item) => item.kind === "Distillation",
      ))
        expect(
          system.equipment.find((unit) => unit.id === item.id)!.trayCount,
        ).toBe(item.params!.trayCount);
      const resized = getComplexSystem(definition.id, 24)!;
      for (const item of resized.equipment.filter(
        (item) => item.kind === "Distillation",
      ))
        expect(item.trayCount).toBe(24);
      for (const stream of resized.streams) {
        expect(stream.points[0]).toEqual(
          worldPort(resized.equipment, stream.from),
        );
        expect(stream.points.at(-1)).toEqual(
          worldPort(resized.equipment, stream.to),
        );
      }
    },
    20000,
  );
  it("preserves current names, stream colors, and changed connectivity in a known plant", () => {
    const project = plantTemplate("integrated")!;
    project.units[0].name = "Edited tank";
    project.edges[0].color = "amber";
    // Editing an unfinished project must not resurrect deleted template streams.
    project.edges.splice(5, 1);
    const plant = buildProjectPlant(project);
    expect(
      plant.equipment.find((item) => item.id === project.units[0].id)!.title,
    ).toBe("Edited tank");
    expect(plant.streams[0].color).toBe("#d18416");
    checkPlant(project, plant);
  });
  it.each(plantTemplates)(
    "routes independent column heights in $id",
    (definition) => {
      const project = plantTemplate(definition.id)!;
      let index = 0;
      for (const unit of project.units)
        if (unit.kind === "Distillation")
          unit.params.trayCount = [2, 12, 80][index++ % 3];
      const plant = buildProjectPlant(project);
      for (const unit of project.units)
        expect(
          plant.equipment.find((item) => item.id === unit.id)!.trayCount,
        ).toBe(unit.params.trayCount);
      checkPlant(project, plant);
    },
  );
  it("lays out a renamed and extended plant with every equipment kind", () => {
    const project = plantTemplate("integrated")!;
    const ids = new Map(
      project.units.map((unit, i) => [unit.id, `CUSTOM${i}`]),
    );
    project.units.forEach((unit) => {
      unit.id = ids.get(unit.id)!;
    });
    project.edges.forEach((edge) => {
      edge.source = ids.get(edge.source)!;
      edge.target = ids.get(edge.target)!;
    });
    project.units.push(newUnit("Mixer", "DISCONNECTED", 0, 0));
    expect(new Set(project.units.map((unit) => unit.kind)).size).toBe(8);
    checkPlant(project, buildProjectPlant(project));
  });
  it("visual tray count does not change the equilibrium calculation", () => {
    const project = distillationExample();
    const before = simulate(project);
    project.units[1].params.trayCount = 80;
    expect(simulate(project)).toEqual(before);
  });
  it("keeps the scene stable for 2D moves and operating-condition edits", () => {
    const project = distillationExample();
    const initial = buildProjectPlant(project);
    project.units[0].position = { x: 500, y: -200 };
    project.units[0].params.temperature = 410;
    project.units[0].params.flow = 18;
    expect(buildProjectPlant(structuredClone(project))).toBe(initial);
    project.units[1].params.trayCount = 12;
    const taller = buildProjectPlant(project);
    expect(taller).not.toBe(initial);
    expect(taller.streams[1].points[0][1]).toBeGreaterThan(
      initial.streams[1].points[0][1],
    );
    project.edges[1].color = "amber";
    const recolored = buildProjectPlant(project);
    expect(recolored).not.toBe(taller);
    expect(recolored.streams[1].color).toBe("#d18416");
    [project.edges[1].target, project.edges[2].target] = [
      project.edges[2].target,
      project.edges[1].target,
    ];
    const reconnected = buildProjectPlant(project);
    expect(reconnected).not.toBe(recolored);
    expect(reconnected.streams[1].to[0]).toBe(project.edges[1].target);
    expect(reconnected.streams[1].points.at(-1)).toEqual(
      worldPort(reconnected.equipment, reconnected.streams[1].to),
    );
  });
  it("handles empty and disconnected projects during editing", () => {
    const empty: Project = { version: 1, name: "Blank", units: [], edges: [] };
    expect(buildProjectPlant(empty).equipment).toHaveLength(0);
    const project = {
      ...empty,
      units: [newUnit("Mixer", "M1", 0, 0), newUnit("Cooler", "C1", 0, 0)],
    };
    checkPlant(project, buildProjectPlant(project));
  });
  it.each([2, 80])(
    "routes a %i-tray column to the resized nozzles",
    (trayCount) => {
      const project = distillationExample();
      project.units.find(
        (unit) => unit.kind === "Distillation",
      )!.params.trayCount = trayCount;
      const plant = buildProjectPlant(project);
      expect(
        plant.equipment.find((item) => item.kind === "Distillation")!.trayCount,
      ).toBe(trayCount);
      checkPlant(project, plant);
    },
  );
  it("normalizes older saved projects to eight trays and validates explicit counts", () => {
    const older = JSON.parse(JSON.stringify(distillationExample()));
    older.units.forEach(
      (unit: { params: { trayCount?: number } }) =>
        delete unit.params.trayCount,
    );
    expect(projectSchema.parse(older).units[1].params.trayCount).toBe(8);
    for (const count of [1, 81, 5.5]) {
      older.units[1].params.trayCount = count;
      expect(projectSchema.safeParse(older).success).toBe(false);
    }
  });
  it("arranges and connects the maximum 40 equipment without a snake layout", () => {
    const units = Array.from({ length: 40 }, (_, i) =>
      newUnit(
        i === 0
          ? "Feed"
          : i === 39
            ? "Product"
            : i % 3 === 0
              ? "PBR"
              : i % 3 === 1
                ? "Heater"
                : "Cooler",
        `U${i}`,
        i * 180,
        0,
      ),
    );
    const project: Project = {
      version: 1,
      name: "Large process",
      units,
      edges: units.slice(1).map((unit, i) => ({
        id: `S${i}`,
        source: units[i].id,
        target: unit.id,
        sourcePort: "out",
        targetPort: "in",
        color: "teal",
      })),
    };
    const plant = buildProjectPlant(project);
    expect(plant.site).toBeDefined();
    expect(
      new Set(plant.equipment.map((item) => item.position[2])).size,
    ).toBeGreaterThan(3);
    checkPlant(project, plant);
  }, 30000);
});

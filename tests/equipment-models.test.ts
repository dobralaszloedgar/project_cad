import { describe, expect, it } from "vitest";
import { Box3, Group, Mesh, Raycaster, Vector3 } from "three";
import {
  createEquipmentModel,
  createSystemConnections,
  disposeEquipmentModel,
} from "../src/components/equipment-3d/models";
import { OperationClock } from "../src/components/equipment-3d/operation";
import {
  createProcessContents,
  createSystemFlow,
} from "../src/components/equipment-3d/process-contents";
import { columnLayout } from "../src/components/equipment-3d/column-layout";
import {
  getSystem,
  systemExamples,
  worldPort,
} from "../src/components/equipment-3d/systems";
import type { Kind } from "../src/domain/schema";
import {
  rackMembers,
  rotatePoint,
} from "../src/components/equipment-3d/system-geometry";
import {
  equipmentEnvelope,
  segmentTouchesBox,
} from "../src/components/equipment-3d/plant-routing";

const kinds: Kind[] = [
  "Feed",
  "Product",
  "Mixer",
  "Splitter",
  "Heater",
  "Cooler",
  "PBR",
  "Distillation",
];

describe("equipment assembly clearances", () => {
  it.each(kinds)("%s assembles both views without invalid geometry", (kind) => {
    for (const [section, transparent] of [
      [false, false],
      [true, false],
      [false, true],
    ]) {
      const model = createEquipmentModel(kind, section, transparent);
      let meshes = 0;
      model.traverse((part) => {
        if (!(part instanceof Mesh)) return;
        meshes++;
        const positions = part.geometry.getAttribute("position");
        expect(positions.count).toBeGreaterThan(0);
        expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
        part.geometry.computeBoundingBox();
        expect(
          part.geometry.boundingBox!.min.y + part.parent!.position.y,
        ).toBeGreaterThanOrEqual(-0.001);
      });
      expect(meshes).toBeGreaterThan(3);
      disposeEquipmentModel(model);
    }
  });

  it.each(kinds)(
    "%s reveals full enclosures while keeping hardware opaque",
    (kind) => {
      const model = createEquipmentModel(kind, false, true);
      let clearBodies = 0;
      let solidHardware = 0;
      model.traverse((part) => {
        if (!(part instanceof Mesh)) return;
        const materials = Array.isArray(part.material)
          ? part.material
          : [part.material];
        for (const material of materials) {
          if (part.userData.enclosure) {
            clearBodies++;
            expect(material.transparent).toBe(true);
            expect(material.opacity).toBeGreaterThan(0);
            expect(material.opacity).toBeLessThan(0.3);
            expect(material.depthWrite).toBe(false);
            expect(part.castShadow).toBe(false);
          } else {
            solidHardware++;
            expect(material.transparent).toBe(false);
            expect(material.opacity).toBe(1);
          }
        }
      });
      expect(clearBodies).toBeGreaterThan(0);
      expect(solidHardware).toBeGreaterThan(0);
      disposeEquipmentModel(model);
    },
  );

  it.each(kinds.filter((kind) => !["Feed", "Cooler", "Mixer"].includes(kind)))(
    "%s leaves the entire gauge face unobstructed",
    (kind) => {
      const model = createEquipmentModel(kind);
      model.updateMatrixWorld(true);
      const gauge = model.getObjectByName("pressure-gauge") as Group;
      expect(gauge).toBeDefined();
      const ray = new Raycaster();
      // Shoot rays toward the dial from the viewer side, including its lower rim:
      // the vessel head must never be the first surface covering the dial.
      for (let i = 0; i < 24; i++) {
        const angle = (i * Math.PI) / 12;
        const origin = gauge.localToWorld(
          new Vector3(Math.cos(angle) * 0.083, Math.sin(angle) * 0.083, 4),
        );
        ray.set(origin, new Vector3(0, 0, -1));
        const hit = ray.intersectObject(model, true)[0];
        expect(hit?.object.parent, `Dial obscured at sample ${i}`).toBe(gauge);
      }
      disposeEquipmentModel(model);
    },
  );

  it.each(["Mixer", "Cooler"] as Kind[])(
    "%s rotors clear the stationary housing through a full revolution",
    (kind) => {
      const model = createEquipmentModel(kind, true);
      let rotorCount = 0;
      model.traverse((part) => {
        if (!(part instanceof Group) || !part.userData.angularSpeed) return;
        rotorCount++;
        part.traverse((mesh) => {
          if (!(mesh instanceof Mesh)) return;
          const vertices = mesh.geometry.getAttribute("position");
          for (let i = 0; i < vertices.count; i++) {
            const sweptRadius =
              part.userData.angularAxis === "x"
                ? Math.hypot(vertices.getY(i), vertices.getZ(i))
                : Math.hypot(vertices.getX(i), vertices.getZ(i));
            expect(sweptRadius).toBeLessThan(kind === "Mixer" ? 0.34 : 0.55);
            if (kind === "Cooler")
              expect(vertices.getY(i) + part.position.y).toBeLessThan(2.08);
            if (kind === "Mixer") {
              // Fixed pickup begins at x=.716; the horizontal rotor must never
              // touch it, and the true inner bowl radius is .34.
              expect(part.userData.angularAxis).toBe("x");
              expect(vertices.getX(i) + part.position.x).toBeLessThan(0.706);
            }
          }
        });
      });
      expect(rotorCount).toBe(kind === "Mixer" ? 1 : 2);
      disposeEquipmentModel(model);
    },
  );
});

describe("configurable columns and connected systems", () => {
  it.each(["integrated", "parallel", "fractionation"])(
    "%s reduces the equipment footprint and preserves access gaps",
    (id) => {
      const system = getSystem(id);
      expect(system.site!.equipmentArea).toBeLessThan(
        system.site!.previousEquipmentArea * 0.8,
      );
      for (let i = 0; i < system.equipment.length; i++) {
        const a = equipmentEnvelope(system.equipment[i]);
        for (const item of system.equipment.slice(i + 1)) {
          const b = equipmentEnvelope(item);
          expect(
            a.max[0] + 0.25 < b.min[0] ||
              b.max[0] + 0.25 < a.min[0] ||
              a.max[2] + 0.25 < b.min[2] ||
              b.max[2] + 0.25 < a.min[2],
            `${system.equipment[i].id} crowds ${item.id}`,
          ).toBe(true);
        }
      }
      const steel = rackMembers(system.site!.rack).map(({ center, size }) => ({
        min: center.map((v, i) => v - size[i] / 2) as [number, number, number],
        max: center.map((v, i) => v + size[i] / 2) as [number, number, number],
      }));
      for (const stream of system.streams)
        for (let i = 1; i < stream.points.length; i++)
          for (const box of steel)
            expect(
              segmentTouchesBox(
                stream.points[i - 1],
                stream.points[i],
                box,
                0.03,
              ),
              `${stream.id} clips rack steel`,
            ).toBe(false);
    },
  );

  it("rotates nozzle axes consistently with the visible equipment", () => {
    expect(rotatePoint([1, 2, 3], 1)).toEqual([3, 2, -1]);
    expect(rotatePoint([1, 2, 3], 2)).toEqual([-1, 2, -3]);
    expect(rotatePoint([1, 2, 3], 3)).toEqual([-3, 2, 1]);
    const system = getSystem("integrated");
    const item = system.equipment.find((v) => v.id === "preheat")!;
    expect(item.turn).toBe(1);
    expect(worldPort(system.equipment, ["preheat", "in"])).toEqual([
      item.position[0],
      1.14,
      Number((item.position[2] + 1.7676).toFixed(6)),
    ]);
  });
  it.each(["integrated", "parallel", "fractionation"])(
    "%s routes a complete large plant without hidden pipe junctions",
    (id) => {
      const system = getSystem(id);
      expect(system.equipment.length).toBeGreaterThanOrEqual(17);
      const visited = new Set(
        system.equipment
          .filter((item) => item.kind === "Feed")
          .map((item) => item.id),
      );
      for (let pass = 0; pass < system.equipment.length; pass++)
        for (const stream of system.streams)
          if (visited.has(stream.from[0])) visited.add(stream.to[0]);
      expect(visited.size).toBe(system.equipment.length);
      expect(
        new Set(system.streams.map((stream) => stream.from.join("."))).size,
      ).toBe(system.streams.length);
      expect(
        new Set(system.streams.map((stream) => stream.to.join("."))).size,
      ).toBe(system.streams.length);
      const segments: {
        a: [number, number, number];
        b: [number, number, number];
        route: string;
      }[] = [];
      for (const stream of system.streams) {
        for (let i = 1; i < stream.points.length; i++) {
          const a = stream.points[i - 1],
            b = stream.points[i];
          expect(a.filter((value, axis) => value !== b[axis])).toHaveLength(1);
          for (const item of system.equipment) {
            if (i === 1 && item.id === stream.from[0]) continue;
            if (i === stream.points.length - 1 && item.id === stream.to[0])
              continue;
            expect(
              segmentTouchesBox(a, b, equipmentEnvelope(item), 0.065),
              `${stream.id} hits ${item.id}`,
            ).toBe(false);
          }
          for (const other of segments) {
            if (other.route === stream.id) continue;
            const box = {
              min: other.a.map((v, axis) => Math.min(v, other.b[axis])) as [
                number,
                number,
                number,
              ],
              max: other.a.map((v, axis) => Math.max(v, other.b[axis])) as [
                number,
                number,
                number,
              ],
            };
            expect(
              segmentTouchesBox(a, b, box, 0.13),
              `${stream.id} intersects ${other.route}`,
            ).toBe(false);
          }
          segments.push({ a, b, route: stream.id });
        }
      }
    },
  );

  it.each([2, 12, 24, 80])(
    "reconnects every large-system column at %i trays",
    (trayCount) => {
      for (const id of ["integrated", "parallel", "fractionation"]) {
        const system = getSystem(id, trayCount);
        for (const column of system.equipment.filter(
          (item) => item.kind === "Distillation",
        ))
          expect(column.trayCount).toBe(trayCount);
        for (const stream of system.streams) {
          expect(stream.points[0]).toEqual(
            worldPort(system.equipment, stream.from),
          );
          expect(stream.points.at(-1)).toEqual(
            worldPort(system.equipment, stream.to),
          );
        }
      }
    },
  );

  it.each([2, 8, 12, 24, 80])(
    "builds %i real trays with matching fluid and fittings",
    (trayCount) => {
      const options = { trayCount };
      const layout = columnLayout(options);
      const model = createEquipmentModel("Distillation", false, true, options);
      const contents = createProcessContents(
        "Distillation",
        true,
        new OperationClock(),
        undefined,
        options,
      );
      const surfaces = contents.group.children.filter(
        (part) => part.name === "moving-liquid-surface",
      );
      expect(surfaces).toHaveLength(trayCount + 4); // trays, sump, reboiler, condenser, receiver
      for (let i = 0; i < trayCount; i++) {
        expect(surfaces[i].position.y).toBeCloseTo(layout.trays[i] + 0.07);
        if (i) expect(layout.trays[i] - layout.trays[i - 1]).toBeCloseTo(0.46);
      }
      const bounds = new Box3().setFromObject(model);
      expect(bounds.max.y).toBeCloseTo(layout.totalHeight, 2);
      expect(bounds.min.y).toBeGreaterThanOrEqual(-0.001);
      expect(model.userData.column.trayCount).toBe(trayCount);
      const system = getSystem("distillation", trayCount);
      expect(
        system.streams.find((s) => s.id === "heater-column")!.points.at(-1)![1],
      ).toBeCloseTo(layout.feedY);
      expect(
        system.streams.find((s) => s.id === "distillate")!.points[0][1],
      ).toBeCloseTo(layout.distillateY);
      expect(layout.distillateY).toBeGreaterThan(layout.trays.at(-1)!);
      disposeEquipmentModel(model);
      disposeEquipmentModel(contents.group);
    },
  );

  it("normalizes external tray counts without invalid geometry", () => {
    expect(columnLayout({ trayCount: NaN }).trayCount).toBe(8);
    expect(columnLayout({ trayCount: 0 }).trayCount).toBe(2);
    expect(columnLayout({ trayCount: Infinity }).trayCount).toBe(8);
    expect(columnLayout({ trayCount: 500 }).trayCount).toBe(80);
    expect(columnLayout({ trayCount: 11.6 }).trayCount).toBe(12);
  });

  it.each(systemExamples)(
    "$title connects open ports with visible fluid inside clear walls",
    (system) => {
      expect(new Set(system.equipment.map((unit) => unit.id)).size).toBe(
        system.equipment.length,
      );
      const walls = createSystemConnections(system, true);
      const flow = createSystemFlow(system, new OperationClock());
      expect(flow.children).toHaveLength(system.streams.length);
      system.streams.forEach((stream, index) => {
        expect(stream.points[0]).toEqual(
          worldPort(system.equipment, stream.from),
        );
        expect(stream.points.at(-1)).toEqual(
          worldPort(system.equipment, stream.to),
        );
        const mesh = flow.children[index] as Mesh;
        expect(
          mesh.geometry.getAttribute("position").array.every(Number.isFinite),
        ).toBe(true);
        expect(
          (mesh.geometry as import("three").TubeGeometry).parameters.radius,
        ).toBeLessThan(stream.radius);
      });
      walls.traverse((part) => {
        if (!(part instanceof Mesh) || !part.userData.enclosure) return;
        const materials = Array.isArray(part.material)
          ? part.material
          : [part.material];
        expect(
          materials.every(
            (material) => material.transparent && material.opacity < 0.3,
          ),
        ).toBe(true);
      });
      disposeEquipmentModel(walls);
      disposeEquipmentModel(flow);
    },
  );
});

describe("physical process contents", () => {
  it.each(kinds)(
    "%s keeps liquid depth-tested and inside the section view",
    (kind) => {
      const clock = new OperationClock();
      const closed = createProcessContents(kind, false, clock);
      expect(closed.group.children).toHaveLength(0);
      const open = createProcessContents(kind, true, clock);
      expect(open.group.children.length).toBeGreaterThan(0);
      expect(new Box3().setFromObject(open.group).min.y).toBeGreaterThanOrEqual(
        0,
      );
      clock.advance(0.04, true, 1);
      open.update(true);
      open.group.traverse((part) => {
        if (!(part instanceof Mesh)) return;
        const materials = Array.isArray(part.material)
          ? part.material
          : [part.material];
        expect(materials.every((material) => material.depthTest)).toBe(true);
        expect(
          Array.from(part.geometry.getAttribute("position").array).every(
            Number.isFinite,
          ),
        ).toBe(true);
      });
      disposeEquipmentModel(open.group);
      disposeEquipmentModel(closed.group);
    },
  );
  it("preserves phase when paused or changing playback speed", () => {
    const clock = new OperationClock();
    clock.advance(0.04, true, 1);
    expect(clock.uniform.value).toBeCloseTo(0.04);
    clock.advance(10, false, 2);
    expect(clock.uniform.value).toBeCloseTo(0.04);
    clock.advance(0.04, true, 2);
    expect(clock.uniform.value).toBeCloseTo(0.12);
    clock.advance(20, true, 1);
    expect(clock.uniform.value).toBeCloseTo(0.17);
  });
});

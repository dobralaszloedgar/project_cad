import { describe, expect, it } from "vitest";
import { arrangeFlowsheet } from "../src/domain/flowsheet-layout";
import { plantTemplate } from "../src/domain/plant-templates";
import { heatingExample, reactorExample } from "../src/domain/examples";
import { newUnit, ports, type Project } from "../src/domain/schema";
import { equipmentPort } from "../src/components/flow-geometry";
import { routedStreamPath } from "../src/components/flow-routing";

describe("compact flowsheet arrangement", () => {
  it.each(["parallel-complex", "recycle-complex", "fractionation-complex"])(
    "fits %s into compact rows while preserving all process data",
    (id) => {
      const original = plantTemplate(id)!;
      const before = structuredClone(original);
      const arranged = arrangeFlowsheet(original, { width: 1276, height: 960 });
      expect(original).toEqual(before);
      expect(arranged.edges).toBe(original.edges);
      expect(
        arranged.units.map((unit) => ({ ...unit, position: undefined })),
      ).toEqual(
        original.units.map((unit) => ({ ...unit, position: undefined })),
      );
      const xs = arranged.units.map((unit) => unit.position.x),
        ys = arranged.units.map((unit) => unit.position.y);
      expect(new Set(ys).size).toBeGreaterThan(1);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1800);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1400);
      expect(
        new Set(
          arranged.units.map((unit) => `${unit.position.x},${unit.position.y}`),
        ).size,
      ).toBe(original.units.length);
      expect(arrangeFlowsheet(arranged, { width: 1276, height: 960 })).toEqual(
        arranged,
      );
    },
  );
  it("adapts to narrow canvases and handles the maximum 40-item chain", () => {
    const project: Project = {
      version: 1,
      name: "Long process",
      units: Array.from({ length: 40 }, (_, index) =>
        newUnit(
          index === 0 ? "Feed" : index === 39 ? "Product" : "Heater",
          `U-${index}`,
          index * 185,
          150,
        ),
      ),
      edges: Array.from({ length: 39 }, (_, index) => ({
        id: `s${index}`,
        source: `U-${index}`,
        target: `U-${index + 1}`,
        sourcePort: "out",
        targetPort: "in",
        color: "teal",
      })),
    };
    const wide = arrangeFlowsheet(project, { width: 1600, height: 900 });
    const narrow = arrangeFlowsheet(project, { width: 800, height: 1100 });
    expect(
      new Set(narrow.units.map((unit) => unit.position.x)).size,
    ).toBeLessThan(new Set(wide.units.map((unit) => unit.position.x)).size);
    expect(
      new Set(wide.units.map((unit) => unit.position.y)).size,
    ).toBeGreaterThan(1);
  });
  it("handles empty projects, reverse input order, and recycle loops", () => {
    const empty: Project = { version: 1, name: "Empty", units: [], edges: [] };
    expect(arrangeFlowsheet(empty)).toBe(empty);
    const simple = heatingExample();
    simple.units.reverse();
    const arranged = arrangeFlowsheet(simple);
    const feed = arranged.units.find((unit) => unit.kind === "Feed")!,
      product = arranged.units.find((unit) => unit.kind === "Product")!;
    expect(feed.position.x).toBeLessThan(product.position.x);
    expect(arrangeFlowsheet(reactorExample()).units).toHaveLength(6);
  });

  it.each(["parallel-complex", "recycle-complex", "fractionation-complex"])(
    "routes every stream in %s around unrelated equipment",
    (id) => {
      const project = arrangeFlowsheet(plantTemplate(id)!, {
        width: 1276,
        height: 960,
      });
      const obstacles = project.units.map((unit) => ({
        id: unit.id,
        ...unit.position,
      }));
      for (const [lane, edge] of project.edges.entries()) {
        const source = project.units.find((unit) => unit.id === edge.source)!,
          target = project.units.find((unit) => unit.id === edge.target)!;
        const from = equipmentPort(
          source.kind,
          true,
          ports(source.kind).outputs.indexOf(edge.sourcePort),
        );
        const to = equipmentPort(
          target.kind,
          false,
          ports(target.kind).inputs.indexOf(edge.targetPort),
        );
        const a = {
            x: source.position.x + from.x,
            y: source.position.y + from.y,
          },
          b = { x: target.position.x + to.x, y: target.position.y + to.y };
        const route = routedStreamPath(
          {
            source: source.id,
            target: target.id,
            sourceX: a.x,
            sourceY: a.y,
            targetX: b.x,
            targetY: b.y,
            sourcePosition: from.position,
            targetPosition: to.position,
          },
          obstacles,
          lane,
        );
        expect(route, edge.id).toBeDefined();
        const points = [...route!.matchAll(/[ML] ([\d.-]+) ([\d.-]+)/g)].map(
          (match) => ({ x: Number(match[1]), y: Number(match[2]) }),
        );
        expect(points[0]).toEqual(a);
        expect(points.at(-1)).toEqual(b);
        for (const [i, point] of points.slice(1).entries()) {
          const previous = points[i];
          expect(point.x === previous.x || point.y === previous.y).toBe(true);
          for (const node of project.units.filter(
            (unit) => unit.id !== source.id && unit.id !== target.id,
          )) {
            const { x, y } = node.position;
            const intersects =
              point.y === previous.y
                ? point.y > y &&
                  point.y < y + 128 &&
                  Math.max(point.x, previous.x) > x &&
                  Math.min(point.x, previous.x) < x + 128
                : point.x > x &&
                  point.x < x + 128 &&
                  Math.max(point.y, previous.y) > y &&
                  Math.min(point.y, previous.y) < y + 128;
            expect(intersects, `${edge.id} crosses ${node.id}`).toBe(false);
          }
        }
      }
    },
  );
});

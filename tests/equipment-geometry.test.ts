import { describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import { kinds, newUnit, ports, type Connection } from "../src/domain/schema";
import {
  equipmentPort,
  plantHeight,
  plantPort,
  plantStreamPath,
} from "../src/components/flow-geometry";
import {
  equipmentConnectors,
  equipmentSymbols,
} from "../src/components/equipment-symbols";

describe("equipment geometry", () => {
  it("gives every material handle a separate position inside the symbol bounds", () => {
    for (const kind of kinds) {
      const locations = [
        ...ports(kind).inputs.map((_, index) =>
          equipmentPort(kind, false, index),
        ),
        ...ports(kind).outputs.map((_, index) =>
          equipmentPort(kind, true, index),
        ),
      ];
      expect(new Set(locations.map(({ x, y }) => `${x},${y}`)).size).toBe(
        locations.length,
      );
      for (const { x, y } of locations) {
        expect(x).toBeGreaterThanOrEqual(8);
        expect(x).toBeLessThanOrEqual(120);
        expect(y).toBeGreaterThanOrEqual(8);
        expect(y).toBeLessThanOrEqual(120);
      }
      expect(equipmentSymbols[kind]).toMatch(/<(path|circle|rect)/);
      expect(equipmentConnectors[kind]).toMatch(/^M/);
    }
  });

  it("places the reactor's single inlet at the top and outlet at the bottom", () => {
    expect(equipmentPort("PBR", false, 0)).toEqual({
      x: 64,
      y: 8,
      position: Position.Top,
    });
    expect(equipmentPort("PBR", true, 0)).toEqual({
      x: 64,
      y: 120,
      position: Position.Bottom,
    });
    expect(ports("PBR")).toEqual({ inputs: ["in"], outputs: ["out"] });
    expect(equipmentConnectors.PBR).toBe("M64 8V20M64 108V120");
  });

  it("separates the column outlets and preserves physical reactor feed locations in 3D", () => {
    const column = newUnit("Distillation", "column", 120, 200);
    expect(plantPort(column, "out").point[1]).toBeGreaterThan(
      plantPort(column, "in").point[1],
    );
    expect(plantPort(column, "out2").point[1]).toBeLessThan(
      plantPort(column, "in").point[1],
    );
    const reactor = newUnit("PBR", "reactor", 120, 200);
    expect(plantPort(reactor, "in").direction).toEqual([0, 1, 0]);
    expect(plantPort(reactor, "out").direction).toEqual([0, -1, 0]);
    expect(plantHeight("Distillation")).toBeGreaterThan(plantHeight("PBR"));
  });

  it("joins every valid 3D material-port pairing with finite, nonzero orthogonal segments", () => {
    for (const sourceKind of kinds) {
      const source = newUnit(sourceKind, "source", -200, 340);
      for (const targetKind of kinds) {
        const target = newUnit(targetKind, "target", 410, -170);
        for (const sourcePort of ports(sourceKind).outputs) {
          for (const targetPort of ports(targetKind).inputs) {
            const edge = { sourcePort, targetPort } as Pick<
              Connection,
              "sourcePort" | "targetPort"
            >;
            const path = plantStreamPath(source, target, edge);
            expect(path[0]).toEqual(plantPort(source, edge.sourcePort).point);
            expect(path.at(-1)).toEqual(
              plantPort(target, edge.targetPort).point,
            );
            expect(path.length).toBeGreaterThanOrEqual(2);
            for (let index = 1; index < path.length; index++) {
              expect(path[index].every(Number.isFinite)).toBe(true);
              expect(path[index][1]).toBeGreaterThan(0);
              const changedAxes = path[index].filter(
                (value, axis) => Math.abs(value - path[index - 1][axis]) > 1e-9,
              );
              expect(changedAxes).toHaveLength(1);
            }
          }
        }
      }
    }
  });

  it("moves pipe endpoints with the equipment without changing local port geometry", () => {
    const source = newUnit("Splitter", "split", 0, 0);
    const target = newUnit("Mixer", "mix", 300, 200);
    const edge = { sourcePort: "out2", targetPort: "in2" } as const;
    const before = plantStreamPath(source, target, edge);
    source.position.x += 100;
    source.position.y -= 200;
    const after = plantStreamPath(source, target, edge);
    expect(after[0][0] - before[0][0]).toBeCloseTo(1);
    expect(after[0][2] - before[0][2]).toBeCloseTo(-2);
    expect(after.at(-1)).toEqual(before.at(-1));
    expect(new Set(after.map((point) => point.join(","))).size).toBe(
      after.length,
    );
  });
});

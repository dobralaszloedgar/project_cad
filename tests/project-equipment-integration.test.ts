import { describe, expect, it } from "vitest";
import {
  catalystExample,
  mixingExample,
  solutionExample,
  thermalCycleExample,
} from "../src/domain/examples";
import { buildProjectPlant } from "../src/components/equipment-3d/project-plant";
import { worldPort } from "../src/components/equipment-3d/system-geometry";

describe("equipment examples in the 3D workspace", () => {
  it.each([
    ["catalyst", catalystExample],
    ["mixing", mixingExample],
    ["solution", solutionExample],
    ["thermal cycle", thermalCycleExample],
  ] as const)(
    "connects every stream in %s without changing the project",
    (_, factory) => {
      const project = factory();
      const original = structuredClone(project);
      const plant = buildProjectPlant(project);
      expect(plant.equipment).toHaveLength(project.units.length);
      expect(plant.streams.map((stream) => stream.id)).toEqual(
        project.edges.map((edge) => edge.id),
      );
      for (const stream of plant.streams) {
        expect(stream.points[0]).toEqual(
          worldPort(plant.equipment, stream.from),
        );
        expect(stream.points.at(-1)).toEqual(
          worldPort(plant.equipment, stream.to),
        );
        expect(stream.points.flat().every(Number.isFinite)).toBe(true);
      }
      expect(project).toEqual(original);
    },
  );

  it("connects the reactor feeds to distinct fittings with an outward side lead", () => {
    const plant = buildProjectPlant(catalystExample());
    const primary = plant.streams.find((stream) => stream.id === "feed-a")!;
    const secondary = plant.streams.find((stream) => stream.id === "feed-b")!;
    const fitting = secondary.points.at(-1)!;
    const lead = secondary.points.at(-2)!;
    expect(primary.points.at(-1)).not.toEqual(fitting);
    expect(lead[0]).toBeLessThan(fitting[0]);
    expect(lead.slice(1)).toEqual(fitting.slice(1));
  });
});

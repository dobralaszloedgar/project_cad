import { describe, expect, it } from "vitest";
import { plantTemplate } from "../src/domain/plant-templates";
import {
  projectSchema,
  validateGraph,
  type Project,
} from "../src/domain/schema";
import { flow, simulate, type Result } from "../src/domain/solver";

const examples = [
  { id: "recycle-complex", units: 32, streams: 32, trays: [12, 10, 8] },
  { id: "parallel-complex", units: 39, streams: 40, trays: [12, 10, 8] },
  {
    id: "fractionation-complex",
    units: 35,
    streams: 34,
    trays: [14, 12, 10, 8],
  },
];

function outlet(project: Project, result: Result, id: string, port = "out") {
  const edge = project.edges.find(
    (item) => item.source === id && item.sourcePort === port,
  )!;
  expect(edge).toBeDefined();
  return result.streams[edge.id];
}

describe("advanced editable plant templates", () => {
  it.each(examples)(
    "$id is complete, within project limits, and balanced",
    (example) => {
      const project = plantTemplate(example.id)!;
      expect(projectSchema.safeParse(project).success).toBe(true);
      expect(project.units).toHaveLength(example.units);
      expect(project.edges).toHaveLength(example.streams);
      expect(validateGraph(project, true)).toEqual([]);
      expect(
        project.units
          .filter((unit) => unit.kind === "Distillation")
          .map((unit) => unit.params.trayCount),
      ).toEqual(example.trays);
      const result = simulate(project);
      expect(result.converged).toBe(true);
      expect(Math.abs(result.massResidual)).toBeLessThan(1e-8);
      expect(Math.abs(result.energyResidual)).toBeLessThan(0.001);
      for (const stream of Object.values(result.streams)) {
        expect(flow(stream)).toBeGreaterThan(0);
        expect(Object.values(stream).every(Number.isFinite)).toBe(true);
      }
    },
  );

  it("returns a real cooled recycle to the inlet mixer with a modest split", () => {
    const project = plantTemplate("recycle-complex")!;
    const result = simulate(project);
    expect(result.tearId).toBeDefined();
    expect(result.iterations).toBeGreaterThan(1);
    const returnEdge = project.edges.find((edge) => edge.id === result.tearId)!;
    expect(returnEdge.source).toBe("C-903");
    expect(returnEdge.target).toBe("M-902");
    expect(returnEdge.targetPort).toBe("in2");
    expect(
      project.units.find((unit) => unit.id === "S-901")!.params.recycleFraction,
    ).toBe(0.25);
    const recycled = result.streams[returnEdge.id];
    expect(recycled.temperature).toBe(300);
    expect(flow(recycled)).toBeCloseTo(22 / 3, 7);
    expect(flow(outlet(project, result, "S-901"))).toBeCloseTo(22, 7);
  });

  it("feeds three parallel reaction trains and recombines every branch", () => {
    const project = plantTemplate("parallel-complex")!;
    const result = simulate(project);
    expect(result.tearId).toBeUndefined();
    for (const [id, temperature] of [
      ["R-1001", 425],
      ["R-1002", 450],
      ["R-1003", 475],
    ] as const) {
      const stream = outlet(project, result, id);
      expect(flow(stream)).toBeCloseTo(10);
      expect(stream.temperature).toBe(temperature);
    }
    expect(flow(outlet(project, result, "M-1003"))).toBeCloseTo(30);
    expect(flow(outlet(project, result, "M-1004"))).toBeCloseTo(33);
    expect(project.units.filter((unit) => unit.kind === "Feed")).toHaveLength(
      4,
    );
  });

  it("routes each successive bottoms cut into the next recovery column", () => {
    const project = plantTemplate("fractionation-complex")!;
    const result = simulate(project);
    for (let i = 1; i <= 3; i++) {
      const bottom = project.edges.find(
        (edge) => edge.source === `D-110${i}` && edge.sourcePort === "out2",
      )!;
      expect(bottom.target).toBe(`H-110${i + 1}`);
      const following = project.edges.find(
        (edge) => edge.source === bottom.target,
      )!;
      expect(following.target).toBe(`D-110${i + 1}`);
    }
    expect(flow(outlet(project, result, "M-1103"))).toBeGreaterThan(2);
    expect(
      project.units.filter((unit) => unit.kind === "Product"),
    ).toHaveLength(10);
  });

  it("keeps existing examples at eight trays and returns independent editable projects", () => {
    for (const id of ["integrated", "parallel", "fractionation"]) {
      const project = plantTemplate(id)!;
      expect(
        project.units
          .filter((unit) => unit.kind === "Distillation")
          .every((unit) => unit.params.trayCount === 8),
      ).toBe(true);
    }
    const first = plantTemplate("parallel-complex")!;
    first.units[0].params.flow = 99;
    first.units[0].name = "Edited feed";
    first.edges.splice(0, 1);
    const next = plantTemplate("parallel-complex")!;
    expect(next.units[0].params.flow).toBe(24);
    expect(next.units[0].name).toBe("Main process feed");
    expect(next.edges).toHaveLength(40);
  });
});

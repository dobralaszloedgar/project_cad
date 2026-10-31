import { describe, expect, it } from "vitest";
import {
  templates,
  loadTemplate,
  templateSpecification,
} from "../src/domain/templates";
import { projectSchema, validateGraph } from "../src/domain/schema";
import { flow, simulate } from "../src/domain/solver";
import { componentNames, thermoContext } from "../src/domain/thermo/catalog";
import { propertyRange } from "../src/domain/thermo/availability";
import { plantTemplate } from "../src/domain/plant-templates";
import { catalystExample } from "../src/domain/examples";
import { validateProjectFolderName } from "../src/lib/project-directory";

describe("real-chemical template catalog", () => {
  it.each(templates)(
    "$id runs with real property data and no additional setup",
    (template) => {
      const original = loadTemplate(template.id)!;
      expect(validateProjectFolderName(original.name)).toBe(original.name);
      expect(original.thermo).toBeDefined();
      const project = projectSchema.parse(JSON.parse(JSON.stringify(original)));
      const settings = project.thermo!;
      expect(settings.mixture).not.toBe("demo");
      expect(settings.extrapolate).toBe(false);
      expect(validateGraph(project, true)).toEqual([]);
      expect(project.units.some((unit) => unit.kind === "PBR")).toBe(false);
      const { catalog, ids } = thermoContext(settings);
      expect(ids).toHaveLength(2);
      for (const id of ids) {
        expect(["A", "B"]).not.toContain(id);
        expect(catalog.get(id).molecularWeight).toBeGreaterThan(0);
      }
      const result = simulate(project);
      expect(result.converged).toBe(true);
      expect(Math.abs(result.massResidual)).toBeLessThan(1e-8);
      expect(Math.abs(result.energyResidual)).toBeLessThan(0.001);
      expect(result.warnings.join(" ")).not.toMatch(/synthetic/i);
      for (const stream of Object.values(result.streams)) {
        expect(flow(stream)).toBeGreaterThan(0.001);
        expect(Object.values(stream).every(Number.isFinite)).toBe(true);
        for (const id of ids) {
          const range = propertyRange(catalog.get(id), settings.modelId)!;
          expect(stream.temperature).toBeGreaterThanOrEqual(range[0]);
          expect(stream.temperature).toBeLessThanOrEqual(range[1]);
        }
      }
      for (const unit of project.units.filter(
        (unit) => unit.kind === "Distillation",
      )) {
        expect(settings.modelId).not.toBe("ideal-gas");
        const topEdge = project.edges.find(
          (edge) => edge.source === unit.id && edge.sourcePort === "out",
        )!;
        const bottomEdge = project.edges.find(
          (edge) => edge.source === unit.id && edge.sourcePort === "out2",
        )!;
        const top = result.streams[topEdge.id],
          bottom = result.streams[bottomEdge.id];
        expect(top.a / flow(top)).toBeGreaterThan(bottom.a / flow(bottom));
        expect(result.properties[topEdge.id].phase).toBe("vapor");
        expect(result.properties[bottomEdge.id].phase).toBe("liquid");
      }
      for (const name of componentNames(settings))
        expect(templateSpecification(project).toLowerCase()).toContain(
          name.toLowerCase(),
        );
    },
  );

  it.each(templates)(
    "$id gives each project independent specifications",
    (template) => {
      const first = loadTemplate(template.id)!;
      const before = structuredClone(first);
      first.thermo!.modelId = "ideal-gas";
      first.units[0].params.flow = 999;
      first.edges.splice(0, 1);
      expect(loadTemplate(template.id)).toEqual(before);
    },
  );

  it("uses the real heat capacities in heating, duty and mixing calculations", () => {
    const heating = simulate(loadTemplate("heating")!);
    expect(heating.equipment["H-301"].duty).toBeCloseTo(5 * (82 + 104) * 50, 7);
    const cycle = simulate(loadTemplate("thermal-cycle")!);
    expect(cycle.streams.heated.temperature).toBeCloseTo(
      400 + 30000 / (5 * (82 + 104)),
      7,
    );
    expect(cycle.streams.cooled.temperature).toBe(400);
    const mixed = simulate(loadTemplate("mixing")!);
    expect(mixed.streams.mixed.temperature).toBeCloseTo(
      (10 * 82 * 400 + 5 * 104 * 450) / (10 * 82 + 5 * 104),
      7,
    );
    expect(mixed.streams.primary.a).toBeCloseTo(7.5);
    expect(mixed.streams.secondary.b).toBeCloseTo(1.25);
  });

  it("keeps connected plant layouts while specifying real equilibrium separations", () => {
    for (const id of ["fractionation", "fractionation-complex"]) {
      const project = loadTemplate(id)!;
      expect(project.edges).toEqual(plantTemplate(id)!.edges);
      expect(
        project.units
          .filter((unit) => unit.kind === "Heater")
          .map((unit) => unit.params.temperature),
      ).toEqual(
        id === "fractionation" ? [344, 348, 352] : [344, 348, 352, 355],
      );
    }
  });

  it("excludes synthetic and unsupported reaction recipes", () => {
    expect(new Set(templates.map((template) => template.id)).size).toBe(
      templates.length,
    );
    for (const id of [
      "catalyst",
      "reactor",
      "integrated",
      "parallel",
      "recycle-complex",
      "parallel-complex",
      "unsupported-reaction",
      "empty",
    ])
      expect(loadTemplate(id)).toBeUndefined();
    expect(() => templateSpecification(catalystExample())).toThrow(
      "real chemicals",
    );
    const unsupported = catalystExample();
    unsupported.thermo = loadTemplate("heating")!.thermo;
    expect(() => templateSpecification(unsupported)).toThrow("not implemented");
  });
});

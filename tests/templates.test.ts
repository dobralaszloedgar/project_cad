// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

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
      const { catalog, ids } = thermoContext(settings);
      expect(ids.length).toBeGreaterThanOrEqual(2);
      for (const id of ids) {
        expect(["A", "B"]).not.toContain(id);
        expect(catalog.get(id).molecularWeight).toBeGreaterThan(0);
      }
      const result = simulate(project);
      expect(result.converged).toBe(true);
      expect(Math.abs(result.massResidual)).toBeLessThan(1e-8);
      expect(Math.abs(result.energyResidual)).toBeLessThan(0.01);
      expect(result.warnings.join(" ")).not.toMatch(/synthetic/i);
      for (const stream of Object.values(result.streams)) {
        expect(flow(stream)).toBeGreaterThan(0.001);
        expect(
          [
            stream.temperature,
            stream.pressure,
            ...Object.values(stream.components ?? { a: stream.a, b: stream.b }),
          ].every(Number.isFinite),
        ).toBe(true);
        for (const id of ids) {
          if (stream.components && !stream.components[id]) continue;
          const range = propertyRange(
            catalog.get(id),
            stream.propertyModel ?? settings.modelId,
          )!;
          expect(stream.temperature).toBeGreaterThanOrEqual(range[0]);
          expect(stream.temperature).toBeLessThanOrEqual(range[1]);
        }
      }
      for (const unit of project.units.filter(
        (unit) => unit.kind === "Distillation",
      )) {
        const topEdge = project.edges.find(
          (edge) => edge.source === unit.id && edge.sourcePort === "out",
        )!;
        const bottomEdge = project.edges.find(
          (edge) => edge.source === unit.id && edge.sourcePort === "out2",
        )!;
        const top = result.streams[topEdge.id],
          bottom = result.streams[bottomEdge.id];
        const lightKey = unit.params.distillation?.lightKey ?? ids[0];
        const heavyKey = unit.params.distillation?.heavyKey ?? ids[1];
        const topLight = top.components?.[lightKey] ?? top.a;
        const bottomLight = bottom.components?.[lightKey] ?? bottom.a;
        const topHeavy = top.components?.[heavyKey] ?? top.b;
        const bottomHeavy = bottom.components?.[heavyKey] ?? bottom.b;
        // Light nonkeys can dilute the overhead; compare the selected key ratio.
        expect(topLight / topHeavy).toBeGreaterThan(bottomLight / bottomHeavy);
        if ((top.propertyModel ?? settings.modelId) === "ideal-gas") {
          expect(unit.params.distillation?.method).toBe("fug");
          expect(result.warnings.join(" ")).toContain(
            "supplied constant relative volatilities",
          );
          expect(result.properties[topEdge.id].phase).toBe("vapor");
          expect(result.properties[bottomEdge.id].phase).toBe("vapor");
        } else {
          expect(result.properties[topEdge.id].phase).toBe(
            unit.params.distillation &&
              unit.params.distillation.condenserType !== "partial"
              ? "liquid"
              : "vapor",
          );
          expect(result.properties[bottomEdge.id].phase).toBe("liquid");
        }
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

  it.each(["normal", "flooding", "weeping"])(
    "the %s column actually produces the advertised tray rating",
    (state) => {
      const result = simulate(loadTemplate(`distillation-${state}`)!);
      const column = result.equipment["D-201"].distillation!;
      expect(column.method).toBe("mesh");
      if (column.method !== "mesh") throw new Error("Expected MESH");
      expect(column.hydraulics?.status).toBe("rated");
      expect(column.hydraulics?.stages).toHaveLength(8);
      expect(
        column.hydraulics?.stages.every((tray) => tray.state === state),
      ).toBe(true);
    },
  );

  it("the integrated plant closes its recycle and runs all three reaction pathways in both beds", () => {
    const project = loadTemplate("methanol-recycle-plant")!;
    const result = simulate(project);
    expect(project.units).toHaveLength(21);
    expect(
      project.units.filter((unit) => unit.kind === "Distillation"),
    ).toHaveLength(2);
    expect(result.iterations).toBeGreaterThan(1);
    expect(result.converged).toBe(true);
    expect(Math.abs(result.energyResidual)).toBeLessThan(0.01);
    for (const unit of project.units.filter(
      (unit) => unit.kind === "Distillation",
    )) {
      const column = result.equipment[unit.id].distillation!;
      expect(unit.params.distillation?.method).toBe("mesh");
      expect(column.method).toBe("mesh");
      if (column.method !== "mesh") throw new Error("Expected MESH");
      expect(column.stages).toHaveLength(unit.params.trayCount + 2);
      expect(column.condenserDutyW).toBeLessThan(-100000);
      expect(column.reboilerDutyW).toBeGreaterThan(100000);
      expect(column.hydraulics?.status).toBe("rated");
      expect(column.hydraulics?.stages).toHaveLength(unit.params.trayCount);
      expect(Math.abs(column.residuals.overallEnergyW)).toBeLessThan(0.00001);
      expect(column.residuals.component).toBeLessThan(1e-9);
      expect(column.residuals.equilibrium).toBeLessThan(1e-9);
    }
    const productEdge = project.edges.find((edge) => edge.target === "P-702")!;
    const product = result.streams[productEdge.id];
    expect(result.properties[productEdge.id].phase).toBe("liquid");
    expect(product.propertyModel).toBe("ideal-solution");
    expect(product.components!["67-56-1"] / flow(product)).toBeGreaterThan(
      0.999,
    );
    expect(result.warnings.join(" ")).not.toContain("FUG");
    expect(result.warnings.join(" ")).toContain("specified recoveries");
    const recycle = project.edges.find((edge) => edge.id === result.tearId)!;
    expect(recycle.target).toBe("M-702");
    expect(flow(result.streams[recycle.id])).toBeGreaterThan(0.1);
    for (const unit of project.units.filter((unit) => unit.kind === "PBR")) {
      const bed = unit.params.packedBed!;
      expect(bed.reactions).toHaveLength(3);
      expect(
        bed.reactions.every(
          (reaction) =>
            reaction.enabled &&
            reaction.rateLaw?.expression &&
            reaction.kineticsSource,
        ),
      ).toBe(true);
      expect(
        Object.values(result.equipment[unit.id].packedBed!.extents).every(
          (extent) => Math.abs(extent) > 1e-6,
        ),
      ).toBe(true);
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
    expect(() => templateSpecification(unsupported)).toThrow(
      "sourced kinetics",
    );
  });
});

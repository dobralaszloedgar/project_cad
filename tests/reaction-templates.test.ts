import { describe, expect, it } from "vitest";
import { loadTemplate } from "../src/domain/templates";
import { projectSchema } from "../src/domain/schema";
import { simulate } from "../src/domain/solver";
import { thermoContext } from "../src/domain/thermo/catalog";
import { validateSnapshot } from "../src/domain/thermo/data";
import { compileRateLaw } from "../src/domain/reactions/rateLaw";
import { packedBedIssues } from "../src/domain/reactions/validation";
import reference from "./fixtures/reaction-templates-reference.json" with { type: "json" };

describe("published PBR templates", () => {
  it.each(reference.rateCases)(
    "matches independently evaluated $template rates at $temperature K",
    (state) => {
      const project = loadTemplate(state.template)!;
      const chemicals = project.thermo!.catalog!.chemicals;
      const bed = project.units[1].params.packedBed!;
      for (const reaction of bed.reactions) {
        const rate = compileRateLaw(
          reaction.rateLaw!,
          chemicals,
          true,
        )({
          ...state,
          flows: state.flows as Record<string, number>,
          volumetricFlow:
            (Object.values(state.flows).reduce((a, b) => a! + b!, 0)! *
              8.31446261815324 *
              state.temperature) /
            state.pressure,
        });
        const expected = (state.rates as Record<string, number | undefined>)[
          reaction.id
        ]!;
        expect(Math.abs(rate / expected - 1)).toBeLessThan(1e-11);
      }
    },
  );

  it.each([
    ["pbr-water-gas-shift", reference.waterGasShift],
    ["pbr-methanol-synthesis", reference.methanol],
  ] as const)("matches independent outlet balances for %s", (id, expected) => {
    const project = loadTemplate(id)!;
    const snapshot = project.thermo!.catalog!;
    expect(() => validateSnapshot(snapshot)).not.toThrow();
    const { catalog, ids } = thermoContext(project.thermo!);
    expect(
      packedBedIssues(
        project.units[1].params.packedBed!,
        ids.map((id) => catalog.get(id)),
      ),
    ).toEqual([]);
    const result = simulate(project);
    const bed = result.equipment["R-101"].packedBed!;
    expect(bed.conversion).toBeCloseTo(expected.conversion, 7);
    expect(bed.catalystMass).toBe(expected.catalystMass);
    for (const [id, value] of Object.entries(expected.flows))
      expect(bed.flows[id]).toBeCloseTo(value, 10);
    expect(bed.warnings).toEqual([]);
    expect(result.heatDuty).toBeLessThan(0);
    expect(Math.abs(result.massResidual)).toBeLessThan(1e-12);
    expect(Math.abs(result.energyResidual)).toBeLessThan(1e-9);
    if (id === "pbr-methanol-synthesis") {
      expect(bed.extents.rwgs).toBeLessThan(0); // The coupled shift reverses along the bed.
      expect(bed.flows["7440-37-1"]).toBe(0.0011); // Inert argon is conserved.
    }
  });

  it("sizes the catalyst against independent quadrature", () => {
    const result = simulate(loadTemplate("pbr-water-gas-shift-sizing")!);
    const bed = result.equipment["R-101"].packedBed!;
    expect(bed.conversion).toBeCloseTo(reference.sizing.conversion, 9);
    expect(bed.catalystMass).toBeCloseTo(reference.sizing.catalystMass, 7);
  });

  it("preserves editable kinetics and references through serialization without sharing template state", () => {
    const project = loadTemplate("pbr-methanol-synthesis")!;
    const original = structuredClone(project);
    const bed = project.units[1].params.packedBed!;
    bed.reactions[0].rateLaw!.parameters[0].value *= 2;
    bed.reactions[0].kineticsSource!.notes = "Edited note";
    expect(bed.reactions[1].kineticsSource!.notes).not.toBe("Edited note");
    project.thermo!.catalog!.chemicals[0].name = "Edited chemical";
    expect(loadTemplate("pbr-methanol-synthesis")).toEqual(original);
    const reopened = projectSchema.parse(JSON.parse(JSON.stringify(original)));
    expect(reopened).toEqual(original);
    expect(simulate(reopened)).toEqual(simulate(original));
  });

  it("reports temperature and pressure outside the source range, including outlet pressure", () => {
    const project = loadTemplate("pbr-water-gas-shift")!;
    project.units[1].params.temperature = 530;
    project.units[1].params.packedBed!.pressureDrop = 1000;
    const result = simulate(project);
    expect(result.warnings.join(" ")).toContain(
      "temperature is outside the published kinetics range",
    );
    expect(result.warnings.join(" ")).toContain(
      "bed pressure is outside the published kinetics range",
    );
  });
});

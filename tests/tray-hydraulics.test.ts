import { describe, expect, it } from "vitest";
import { simulate } from "../src/domain/solver";
import { projectSchema } from "../src/domain/schema";
import { aromaticColumnTemplate } from "../src/domain/real-chemical-templates";
import type { MeshResult } from "../src/domain/equipment/distillation";
import {
  defaultTrayHydraulics,
  trayHydraulicsSchema,
} from "../src/domain/equipment/tray-hydraulics-schema";
import {
  fairCapacity,
  hydraulicState,
  rateTrayHydraulics,
  sieveTrayGeometry,
  weepCoefficient,
} from "../src/domain/equipment/tray-hydraulics";
import { createProcessContents } from "../src/components/equipment-3d/process-contents";
import {
  createEquipmentModel,
  disposeEquipmentModel,
} from "../src/components/equipment-3d/models";
import { columnLayout } from "../src/components/equipment-3d/column-layout";
import { OperationClock } from "../src/components/equipment-3d/operation";
import { buildProjectPlant } from "../src/components/equipment-3d/project-plant";
import { worldPort } from "../src/components/equipment-3d/system-geometry";

const config = () => ({
  ...defaultTrayHydraulics(),
  liquidDensity: 800,
  surfaceTension: 0.02,
});
const columnResult = (result: ReturnType<typeof simulate>) =>
  result.equipment["D-201"].distillation as MeshResult;

describe("sieve-tray hydraulic rating", () => {
  it("checks the published Fair polynomial and Eduljee graph values independently", () => {
    // FLV = 1 makes ln(FLV) zero: C = 3.00232e-5 * 600 + 0.0140453.
    expect(fairCapacity(1, 0.6)).toBeCloseTo(0.03205922, 10);
    expect(weepCoefficient(0.06)).toBe(30.32);
    expect(weepCoefficient(0.09)).toBeCloseTo(30.875, 10);
    expect(fairCapacity(0.009, 0.6)).toBeNull();
    expect(fairCapacity(2.01, 0.6)).toBeNull();
    expect(fairCapacity(0.1, 1)).toBeNull();
    expect(weepCoefficient(0.111)).toBeNull();
  });

  it("checks areas, ideal-gas conversion, Francis head and pressure units against a hand-audited case", () => {
    // Quarter-circle segment (theta=pi/2): area fraction=(pi/2-1)/(2*pi),
    // weir chord=sqrt(2) m at D=2 m. L=8 kg/s, rhoL=800 => QL=0.01 m3/s.
    const h = {
      ...config(),
      diameter: 2,
      traySpacing: 0.6,
      downcomerFraction: (Math.PI / 2 - 1) / (2 * Math.PI),
    };
    const reference = {
      componentIds: ["test"],
      stages: [
        {
          stage: 1,
          kind: "tray",
          temperatureK: 400,
          pressurePa: 133031.401888,
          liquidMolS: 160,
          vaporMolS: 40,
          liquidComposition: [1],
          vaporComposition: [1],
        },
      ],
    } as MeshResult;
    const s = rateTrayHydraulics(reference, h, [0.05]).stages[0];
    const geometry = sieveTrayGeometry(h);
    expect(geometry.weirLength).toBeCloseTo(Math.SQRT2, 12);
    expect(geometry.activeArea).toBeCloseTo(Math.PI / 2 + 1, 12);
    expect(s.vaporDensity).toBeCloseTo(2, 10);
    expect(s.liquidVolumeFlow).toBeCloseTo(0.01, 12);
    expect(s.flowParameter).toBeCloseTo(0.2, 12);
    expect(s.holeVelocity).toBeCloseTo(3.889845296, 8);
    expect(s.clearLiquidHeight).toBeCloseTo(0.07763023624, 9);
    // All reported heads are metres, and pressure drop is Pa, not mm liquid.
    expect(s.pressureDropPa).toBeGreaterThan(700);
    expect(s.pressureDropPa).toBeLessThan(800);
    expect(s.downcomerBackup).toBeGreaterThan(0.34);
    expect(s.downcomerBackup).toBeLessThan(0.38);
  });

  it("changes from flooding to acceptable to weeping as diameter grows, without altering any separation outputs", () => {
    const p = aromaticColumnTemplate("mesh");
    const baseline = simulate(p),
      baseColumn = columnResult(baseline);
    for (const [diameter, state] of [
      [0.7, "flooding"],
      [1.2, "normal"],
      [2, "weeping"],
    ] as const) {
      p.units[1].params.distillation!.hydraulics = { ...config(), diameter };
      const solved = simulate(p),
        column = columnResult(solved);
      expect(column.hydraulics?.status).toBe("rated");
      expect(column.hydraulics?.stages).toHaveLength(
        p.units[1].params.trayCount,
      );
      expect(column.hydraulics!.stages.every((s) => s.state === state)).toBe(
        true,
      );
      expect(solved.streams).toEqual(baseline.streams);
      expect(solved.properties).toEqual(baseline.properties);
      expect(column.stages).toEqual(baseColumn.stages);
      expect(column.condenserDutyW).toBe(baseColumn.condenserDutyW);
      expect(column.reboilerDutyW).toBe(baseColumn.reboilerDutyW);
      expect(column.residuals).toEqual(baseColumn.residuals);
      expect(solved.heatDuty).toBe(baseline.heatDuty);
    }
  });

  it("more spacing reduces both flooding loads while preserving weep onset", () => {
    const column = columnResult(simulate(aromaticColumnTemplate("mesh")));
    const weights = [0.0781118, 0.0921384];
    const tight = rateTrayHydraulics(
      column,
      { ...config(), traySpacing: 0.3 },
      weights,
    );
    const wide = rateTrayHydraulics(
      column,
      { ...config(), traySpacing: 0.9 },
      weights,
    );
    tight.stages.forEach((s, i) => {
      expect(wide.stages[i].jetFloodFraction!).toBeLessThan(
        s.jetFloodFraction!,
      );
      expect(wide.stages[i].downcomerFloodFraction).toBeLessThan(
        s.downcomerFloodFraction,
      );
      expect(wide.stages[i].weepRatio).toBe(s.weepRatio);
    });
  });

  it("larger open area increases weeping susceptibility and lowers dry pressure loss", () => {
    const column = columnResult(simulate(aromaticColumnTemplate("mesh")));
    const a = rateTrayHydraulics(column, config(), [0.0781118, 0.0921384]);
    const b = rateTrayHydraulics(
      column,
      { ...config(), holeAreaFraction: 0.15 },
      [0.0781118, 0.0921384],
    );
    expect(b.stages[0].weepRatio!).toBeLessThan(a.stages[0].weepRatio!);
    expect(b.stages[0].pressureDropPa).toBeLessThan(a.stages[0].pressureDropPa);
  });

  it("reports missing data and out-of-range checks without declaring them normal", () => {
    const column = columnResult(simulate(aromaticColumnTemplate("mesh")));
    const missing = rateTrayHydraulics(
      column,
      defaultTrayHydraulics(),
      [0.0781118, 0.0921384],
    );
    expect(missing.status).toBe("unavailable");
    expect(missing.maxFloodFraction).toBeNull();
    expect(missing.stages).toEqual([]);
    const noWeights = rateTrayHydraulics(column, config(), []);
    expect(noWeights.status).toBe("unavailable");
    const extreme = structuredClone(column);
    extreme.stages
      .filter((s) => s.kind === "tray")
      .forEach((s) => {
        s.liquidMolS *= 1e5;
      });
    const partial = rateTrayHydraulics(
      extreme,
      config(),
      [0.0781118, 0.0921384],
    );
    expect(partial.status).toBe("partial");
    expect(
      partial.stages.every(
        (s) =>
          s.jetFloodFraction === null &&
          s.weepRatio === null &&
          s.state !== "normal",
      ),
    ).toBe(true);
    expect(hydraulicState(null, 0.3, 1.2)).toBe("unrated");
    expect(hydraulicState(1.2, 0.3, 0.5)).toBe("flooding-and-weeping");
  });

  it("persists settings, rejects impossible geometry, and retains disabled and FUG behavior", () => {
    const p = aromaticColumnTemplate("mesh");
    const before = simulate(p);
    p.units[1].params.distillation!.hydraulics = {
      ...config(),
      enabled: false,
    };
    const restored = projectSchema.parse(JSON.parse(JSON.stringify(p)));
    expect(restored.units[1].params.distillation!.hydraulics).toEqual(
      p.units[1].params.distillation!.hydraulics,
    );
    expect(simulate(restored)).toEqual(before);
    expect(
      trayHydraulicsSchema.safeParse({ ...config(), downcomerClearance: 0.08 })
        .success,
    ).toBe(false);
    expect(
      trayHydraulicsSchema.safeParse({ ...config(), holeAreaFraction: 0.5 })
        .success,
    ).toBe(false);
    expect(
      trayHydraulicsSchema.safeParse({ ...config(), liquidDensity: NaN })
        .success,
    ).toBe(false);
    const fug = aromaticColumnTemplate("fug");
    const fugBaseline = simulate(fug);
    fug.units[1].params.distillation!.hydraulics = config();
    expect(simulate(fug).streams).toEqual(fugBaseline.streams);
  });
});

describe("hydraulic column visuals", () => {
  it.each([0.15, 6, 12])(
    "routes the supported %s m diameter without losing the 3D plant",
    (diameter) => {
      const p = aromaticColumnTemplate("mesh");
      p.units[1].params.distillation!.hydraulics = { ...config(), diameter };
      const plant = buildProjectPlant(p);
      expect(plant.streams).toHaveLength(3);
      for (const stream of plant.streams) {
        expect(stream.points[0]).toEqual(
          worldPort(plant.equipment, stream.from),
        );
        expect(stream.points.at(-1)).toEqual(
          worldPort(plant.equipment, stream.to),
        );
      }
    },
  );
  it("keeps dimensional geometry, routing ports and feed tray aligned after edits", () => {
    const p = aromaticColumnTemplate("mesh");
    p.units[1].params.distillation!.hydraulics = {
      ...config(),
      diameter: 2,
      traySpacing: 0.7,
    };
    p.units[1].params.distillation!.feedTray = 2;
    const plant = buildProjectPlant(p);
    const tower = plant.equipment.find((e) => e.id === "D-201")!;
    const layout = columnLayout(tower);
    expect(layout.trays[1] - layout.trays[0]).toBeCloseTo(0.7);
    expect(layout.feedY).toBeCloseTo(layout.trays[6] + 0.14);
    const feedPort = worldPort([tower], [tower.id, "in"]);
    expect(feedPort[0] - tower.position[0]).toBeCloseTo((-1.3 * 2) / 1.2, 5);
    expect(feedPort[1]).toBeCloseTo(layout.feedY, 5);
    const model = createEquipmentModel("Distillation", true, true, tower);
    expect(model.scale.x).toBeCloseTo(2 / 1.2);
    disposeEquipmentModel(model);
    p.units[1].params.distillation!.hydraulics!.traySpacing = 0.4;
    expect(buildProjectPlant(p)).not.toBe(plant);
  });

  it.each([
    [2, "weeping"],
    [0.7, "carryover"],
  ] as const)(
    "shows calculated %s m tray effects with correct top-to-bottom numbering",
    (diameter, effect) => {
      const p = aromaticColumnTemplate("mesh");
      p.units[1].params.distillation!.hydraulics = { ...config(), diameter };
      const rating = columnResult(simulate(p)).hydraulics!;
      const options = {
        trayCount: 8,
        column: { diameter, traySpacing: 0.46, trayType: "sieve" as const },
      };
      const contents = createProcessContents(
        "Distillation",
        true,
        new OperationClock(),
        undefined,
        options,
        undefined,
        rating,
      );
      const first = contents.group.getObjectByName("tray-1-hydraulic-state")!;
      const last = contents.group.getObjectByName("tray-8-hydraulic-state")!;
      expect(first.position.y).toBeGreaterThan(last.position.y);
      expect(contents.group.getObjectByName(`tray-1-${effect}`)).toBeDefined();
      contents.update(true);
      expect(contents.group.getObjectByName(`tray-1-${effect}`)!.visible).toBe(
        true,
      );
      expect(contents.group.scale.x).toBeCloseTo(diameter / 1.2);
      disposeEquipmentModel(contents.group);
      const noRating = createProcessContents(
        "Distillation",
        true,
        new OperationClock(),
        undefined,
        options,
      );
      expect(
        noRating.group.getObjectByName("tray-1-hydraulic-state"),
      ).toBeUndefined();
      expect(
        noRating.group.getObjectByName(`tray-1-${effect}`),
      ).toBeUndefined();
      disposeEquipmentModel(noRating.group);
    },
  );
});

import dwsim from "../fixtures/dwsim-reference.json" with { type: "json" };
import independent from "../fixtures/independent-flash-reference.json" with { type: "json" };
import columns from "../fixtures/independent-column-reference.json" with { type: "json" };
import reactors from "../fixtures/reaction-templates-reference.json" with { type: "json" };
import {
  evaluateProperties,
  flashPressureEnthalpy,
} from "../../src/domain/thermo";
import { newUnit } from "../../src/domain/schema";
import { solveMesh } from "../../src/domain/equipment/distillation";
import { defaultDistillation } from "../../src/domain/equipment/distillation-schema";
import { loadTemplate } from "../../src/domain/templates";
import { simulate } from "../../src/domain/solver";
import type { ModelId } from "../../src/domain/thermo/registry";
import { settingsFor } from "./catalog";

export interface Comparison {
  metric: string;
  actual: number;
  expected: number;
  error: number;
  tolerance: number;
  passed: boolean;
}
export interface BenchmarkCase {
  id: string;
  group: string;
  run(): Comparison[];
}

function compare(
  metric: string,
  actual: number | null,
  expected: number,
  absolute: number,
  relative = 0,
): Comparison {
  const error = actual === null ? Infinity : Math.abs(actual - expected);
  const tolerance = absolute + relative * Math.abs(expected);
  return {
    metric,
    actual: actual ?? NaN,
    expected,
    error,
    tolerance,
    passed:
      actual !== null &&
      Number.isFinite(actual) &&
      Number.isFinite(expected) &&
      error <= tolerance,
  };
}

function vector(
  metric: string,
  actual: number[] | null,
  expected: number[] | null,
  absolute: number,
  relative = 0,
) {
  // The composition of an absent phase is not an observable benchmark quantity.
  return (
    expected?.map((v, i) =>
      compare(metric, actual?.[i] ?? null, v, absolute, relative),
    ) ?? []
  );
}

export const benchmarkCases: BenchmarkCase[] = [
  ...dwsim.rows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => row.pressure >= 1000 && row.pressure <= 200000)
    .map(({ row, i }) => ({
      id: `dwsim-${i}`,
      group: "DWSIM Raoult TP flash",
      run() {
        const state = evaluateProperties(
          row.temperature,
          row.pressure,
          row.composition,
          settingsFor(row.ids, "ideal-solution"),
        );
        return [
          compare(
            "vapor fraction",
            state.vaporFraction,
            row.vaporFraction,
            3e-6,
          ),
          ...vector(
            "liquid mole fraction",
            state.liquidComposition,
            row.liquidComposition,
            3e-6,
          ),
          ...vector(
            "vapor mole fraction",
            state.vaporComposition,
            row.vaporComposition,
            3e-6,
          ),
          ...vector(
            "saturation pressure (Pa)",
            state.saturationPressures,
            row.saturationPressures,
            1e-6,
            1e-9,
          ),
        ];
      },
    })),
  ...dwsim.rows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => row.pressure < 1000 || row.pressure > 200000)
    .map(({ row, i }) => ({
      id: `dwsim-domain-${i}`,
      group: "Out-of-domain pressure rejection",
      run() {
        let rejected = false;
        try {
          evaluateProperties(
            row.temperature,
            row.pressure,
            row.composition,
            settingsFor(row.ids, "ideal-solution"),
          );
        } catch (error) {
          if (!String(error).includes("1–200 kPa")) throw error;
          rejected = true;
        }
        return [compare("domain rejection", Number(rejected), 1, 0)];
      },
    })),
  ...independent.gas.map((row, i) => ({
    id: `quadrature-${i}`,
    group: "Independent gas enthalpy",
    run() {
      const other = row.id === "71-43-2" ? "108-88-3" : "71-43-2";
      const state = evaluateProperties(
        row.temperature,
        100000,
        [1, 0],
        settingsFor([row.id, other]),
      );
      return [
        compare(
          "enthalpy (J/mol)",
          state.molarEnthalpy,
          row.enthalpy,
          1e-5,
          1e-10,
        ),
      ];
    },
  })),
  ...independent.rows.map((row, i) => ({
    id: `independent-tp-${i}`,
    group: `Independent ${row.model} TP flash`,
    run() {
      const state = evaluateProperties(
        row.temperature,
        row.pressure,
        row.composition,
        settingsFor(row.ids, row.model as ModelId),
      );
      return [
        compare("vapor fraction", state.vaporFraction, row.vaporFraction, 2e-7),
        ...vector(
          "liquid mole fraction",
          state.liquidComposition,
          row.liquidComposition,
          2e-7,
        ),
        ...vector(
          "vapor mole fraction",
          state.vaporComposition,
          row.vaporComposition,
          2e-7,
        ),
        ...vector(
          "activity coefficient",
          state.activityCoefficients,
          row.gamma,
          2e-7,
          1e-8,
        ),
        compare(
          "enthalpy (J/mol)",
          state.molarEnthalpy,
          row.enthalpy,
          1e-4,
          1e-9,
        ),
      ];
    },
  })),
  ...independent.rows
    .filter((_, i) => i % 9 === 4)
    .map((row, i) => ({
      id: `independent-ph-${i}`,
      group: "Independent PH flash",
      run() {
        // Target enthalpy comes from Python, not a round trip through this kernel.
        const state = flashPressureEnthalpy(
          row.pressure,
          row.enthalpy,
          row.composition,
          settingsFor(row.ids, row.model as ModelId),
        );
        return [
          compare("temperature (K)", state.temperature, row.temperature, 2e-5),
          compare(
            "vapor fraction",
            state.vaporFraction,
            row.vaporFraction,
            2e-6,
          ),
          ...vector(
            "liquid mole fraction",
            state.liquidComposition,
            row.liquidComposition,
            2e-6,
          ),
          ...vector(
            "vapor mole fraction",
            state.vaporComposition,
            row.vaporComposition,
            2e-6,
          ),
        ];
      },
    })),
  ...columns.rows.map((row) => ({
    id: `independent-column-${row.trays}`,
    group: "Independent MESH columns",
    run() {
      const column = newUnit("Distillation", "benchmark-column", 0, 0);
      column.params.trayCount = row.trays;
      column.params.pressure = row.pressure;
      column.params.distillation = {
        ...defaultDistillation(row.ids),
        method: "mesh",
        feedTray: row.feedTray,
        refluxRatio: row.reflux,
        pressureDrop: row.pressureDrop,
        distillateFlow: row.distillateFlow,
      };
      const feed = {
        a: row.feedFlow * row.feedComposition[0],
        b: row.feedFlow * row.feedComposition[1],
        temperature: row.feedTemperature,
        pressure: row.feedPressure,
      };
      const { result } = solveMesh(
        column,
        feed,
        settingsFor(row.ids, "ideal-solution"),
      );
      return [
        compare(
          "condenser duty (W)",
          result.condenserDutyW,
          row.condenserDuty,
          0.1,
        ),
        compare(
          "reboiler duty (W)",
          result.reboilerDutyW,
          row.reboilerDuty,
          0.1,
        ),
        compare("stage count", result.stages.length, row.stages.length, 0),
        ...row.stages.flatMap((stage, i) => {
          const actual = result.stages[i];
          return [
            compare(
              "stage temperature (K)",
              actual.temperatureK,
              stage.temperature,
              2e-4,
            ),
            compare(
              "stage pressure (Pa)",
              actual.pressurePa,
              stage.pressure,
              1e-7,
            ),
            compare(
              "liquid flow (mol/s)",
              actual.liquidMolS,
              stage.liquidFlow,
              2e-5,
            ),
            compare(
              "vapor flow (mol/s)",
              actual.vaporMolS,
              stage.vaporFlow,
              2e-5,
            ),
            ...vector(
              "liquid mole fraction",
              actual.liquidComposition,
              stage.liquidComposition,
              2e-6,
            ),
            ...vector(
              "vapor mole fraction",
              actual.vaporComposition,
              stage.vaporComposition,
              2e-6,
            ),
          ];
        }),
      ];
    },
  })),
  ...(
    [
      ["pbr-water-gas-shift", reactors.waterGasShift],
      ["pbr-methanol-synthesis", reactors.methanol],
      ["pbr-water-gas-shift-sizing", reactors.sizing],
    ] as const
  ).map(([id, expected]) => ({
    id,
    group: "Independent reactor integration/sizing",
    run() {
      const solved = simulate(loadTemplate(id)!);
      const bed = solved.equipment["R-101"].packedBed!;
      return [
        compare("conversion", bed.conversion, expected.conversion, 5e-8),
        compare(
          "catalyst mass (kg)",
          bed.catalystMass,
          expected.catalystMass,
          5e-8,
        ),
        ...("flows" in expected
          ? Object.entries(expected.flows).map(([id, n]) =>
              compare("species flow (mol/s)", bed.flows[id], n, 5e-11),
            )
          : []),
      ];
    },
  })),
];

export function defaultToleranceDifferences() {
  const differences = dwsim.withDefaultFlashTolerance.map((row) => ({
    case: row.case,
    absoluteVaporFractionDifference: Math.abs(
      row.vaporFraction - dwsim.rows[row.case].vaporFraction,
    ),
  }));
  return differences.sort(
    (a, b) =>
      b.absoluteVaporFractionDifference - a.absoluteVaporFractionDifference,
  );
}

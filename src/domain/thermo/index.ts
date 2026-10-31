import kernelBytes from "./kernel.wasm.json" with { type: "json" };
import identity from "./kernel-identity.json" with { type: "json" };
import { thermoContext, type ChemicalProvider } from "./catalog";
import {
  defaultThermo,
  modelInfo,
  thermoSchema,
  type ThermoSettings,
} from "./registry";

interface Kernel extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  thermo_alloc(size: number): number;
  thermo_free(pointer: number, size: number): void;
  thermo_execute(pointer: number, size: number): bigint;
}
let kernel: Kernel | undefined;
export interface Properties {
  temperature: number;
  phase: "vapor" | "liquid" | "two-phase" | "saturation" | "empty";
  vaporFraction: number | null;
  liquidComposition: number[] | null;
  vaporComposition: number[] | null;
  kValues: number[] | null;
  activityCoefficients: number[];
  saturationPressures: number[] | null;
  partialPressures: number[] | null;
  molarEnthalpy: number | null;
  gasMolarVolume: number | null;
  molecularWeight: number;
  iterations: number;
  equilibriumResidual: number;
  componentResidual: number;
  enthalpyResidual: number | null;
  warnings: string[];
}
export function evaluateProperties(
  temperature: number,
  pressure: number,
  composition: number[],
  settings: ThermoSettings = defaultThermo,
  catalog?: ChemicalProvider,
  chemicalIds?: readonly string[],
  vaporFraction?: number,
): Properties {
  if (vaporFraction !== undefined && !Number.isFinite(vaporFraction))
    throw new Error("Invalid specified vapor fraction");
  return execute(
    temperature,
    pressure,
    composition,
    settings,
    catalog,
    chemicalIds,
    {
      vaporFraction,
    },
  );
}

export function flashPressureEnthalpy(
  pressure: number,
  molarEnthalpy: number,
  composition: number[],
  settings: ThermoSettings = defaultThermo,
  catalog?: ChemicalProvider,
  chemicalIds?: readonly string[],
): Properties {
  if (!Number.isFinite(molarEnthalpy))
    throw new Error("Invalid target enthalpy");
  return execute(
    298.15,
    pressure,
    composition,
    settings,
    catalog,
    chemicalIds,
    {
      molarEnthalpy,
    },
  );
}

function execute(
  temperature: number,
  pressure: number,
  composition: number[],
  settings: ThermoSettings,
  catalog: ChemicalProvider | undefined,
  chemicalIds: readonly string[] | undefined,
  specification: { molarEnthalpy?: number; vaporFraction?: number },
): Properties {
  thermoSchema.parse(settings);
  const context = thermoContext(settings);
  catalog ??= context.catalog;
  chemicalIds ??= context.ids;
  kernel ??= new WebAssembly.Instance(
    new WebAssembly.Module(new Uint8Array(kernelBytes)),
  ).exports as Kernel;
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      modelId: settings.modelId,
      temperature,
      pressure,
      composition,
      chemicals: chemicalIds.map((id) => catalog.get(id)),
      extrapolate: settings.extrapolate,
      activityParameters: catalog.activityParameters,
      ...specification,
    }),
  );
  const pointer = kernel.thermo_alloc(bytes.length);
  try {
    new Uint8Array(kernel.memory.buffer, pointer, bytes.length).set(bytes);
    const packed = kernel.thermo_execute(pointer, bytes.length);
    const outputPointer = Number(packed >> 32n),
      size = Number(packed & 0xffffffffn);
    try {
      const response = JSON.parse(
        new TextDecoder().decode(
          new Uint8Array(kernel.memory.buffer, outputPointer, size),
        ),
      ) as { ok: true; result: Properties } | { ok: false; error: string };
      if (!response.ok) throw new Error(response.error);
      for (const id of chemicalIds) {
        const chemical = catalog.get(id);
        if (
          chemical.formationSource?.startsWith("Explicit reference convention:")
        )
          response.result.warnings.push(
            `${chemical.name}: formation enthalpy is unavailable; a zero gas-enthalpy reference at 298.15 K is used for nonreacting balances.`,
          );
      }
      return response.result;
    } finally {
      kernel.thermo_free(outputPointer, size);
    }
  } finally {
    kernel.thermo_free(pointer, bytes.length);
  }
}
export function provenance(settings: ThermoSettings = defaultThermo) {
  const context = thermoContext(settings);
  return {
    modelId: settings.modelId,
    modelVersion: modelInfo(settings.modelId).version,
    dataVersion: context.catalog.version,
    kernelHash: identity.kernelHash,
    parameterHash:
      settings.modelId === "modified-unifac-2.0"
        ? (context.catalog.parameterHash ?? identity.parameterHash)
        : null,
    chemicalIds: context.ids,
    extrapolate: settings.extrapolate,
  };
}

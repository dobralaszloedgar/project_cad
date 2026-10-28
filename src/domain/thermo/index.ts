import kernelBytes from "./kernel.wasm.json";
import identity from "./kernel-identity.json";
import {
  sampleCatalog,
  sampleMixtures,
  type ChemicalProvider,
} from "./catalog";
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
  warnings: string[];
}
export function evaluateProperties(
  temperature: number,
  pressure: number,
  composition: number[],
  settings: ThermoSettings = defaultThermo,
  catalog: ChemicalProvider = sampleCatalog,
  chemicalIds: readonly string[] = sampleMixtures[settings.mixture].ids,
): Properties {
  thermoSchema.parse(settings);
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
      return response.result;
    } finally {
      kernel.thermo_free(outputPointer, size);
    }
  } finally {
    kernel.thermo_free(pointer, bytes.length);
  }
}
export function provenance(settings: ThermoSettings = defaultThermo) {
  return {
    modelId: settings.modelId,
    modelVersion: modelInfo(settings.modelId).version,
    dataVersion: sampleCatalog.version,
    kernelHash: identity.kernelHash,
    parameterHash:
      settings.modelId === "modified-unifac-2.0"
        ? identity.parameterHash
        : null,
    chemicalIds: sampleMixtures[settings.mixture].ids,
    extrapolate: settings.extrapolate,
  };
}

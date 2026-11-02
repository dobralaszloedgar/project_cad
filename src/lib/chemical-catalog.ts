import {
  catalogSnapshotSchema,
  contentHash,
  hashSchema,
  selectParameters,
  validateSnapshot,
} from "../domain/thermo/data";
import { propertyRange } from "../domain/thermo/availability";
import type { ThermoSettings } from "../domain/thermo/registry";

export interface ChemicalChoice {
  id: string;
  name: string;
  formula?: string;
}
export type ComponentChoices = (ChemicalChoice | undefined)[];

// Identity mapping only. Older real-mixture projects get their property data
// from Supabase when applied; synthetic A/B has no real-chemical equivalent.
export function catalogChoices(settings: ThermoSettings): ComponentChoices {
  if (settings.mixture === "catalog")
    return settings.catalog?.chemicals ?? [undefined, undefined];
  if (settings.mixture === "aromatics")
    return [
      { id: "71-43-2", name: "Benzene", formula: "C6H6" },
      { id: "108-88-3", name: "Toluene", formula: "C7H8" },
    ];
  if (settings.mixture === "aqueous")
    return [
      { id: "64-17-5", name: "Ethanol", formula: "C2H6O" },
      { id: "7732-18-5", name: "Water", formula: "H2O" },
    ];
  return [undefined, undefined];
}

export async function resolveCatalogSettings(
  settings: ThermoSettings,
  choices: ComponentChoices = catalogChoices(settings),
  release: string | undefined = settings.catalog?.release,
  signal?: AbortSignal,
): Promise<ThermoSettings> {
  signal?.throwIfAborted();
  if (
    choices.length < 2 ||
    choices.length > 40 ||
    choices.some((c) => !c) ||
    new Set(choices.map((c) => c!.id)).size !== choices.length
  )
    throw new Error("Select 2–40 different components.");
  let snapshot = settings.catalog;
  // Removing/reordering already saved components needs no database round trip.
  // Keep each record paired with its integrity hash and trim activity data.
  if (snapshot && (!release || snapshot.release === release)) {
    const saved = snapshot;
    const indices = choices.map((choice) =>
      saved.chemicals.findIndex((chemical) => chemical.id === choice!.id),
    );
    if (indices.every((index) => index >= 0)) {
      validateSnapshot(saved);
      const chemicals = indices.map((index) => saved.chemicals[index]);
      snapshot = {
        ...saved,
        chemicals,
        recordHashes: indices.map((index) => saved.recordHashes[index]),
      };
      if (saved.parameters) {
        const dataset = selectParameters(chemicals, saved.parameters.dataset);
        snapshot.parameters = {
          ...saved.parameters,
          dataset,
          hash: contentHash(dataset),
        };
      }
    }
  }
  if (
    !snapshot ||
    snapshot.chemicals.length !== choices.length ||
    snapshot.chemicals.some((c, i) => c.id !== choices[i]!.id) ||
    (release && snapshot.release !== release) ||
    (settings.modelId === "modified-unifac-2.0" && !snapshot.parameters)
  ) {
    if (!release) {
      const response = await fetch("/api/chemicals/models", { signal });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not connect to Supabase.");
      release = hashSchema.parse(data.release);
    }
    const response = await fetch("/api/chemicals/selection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        release,
        ids: choices.map((c) => c!.id),
        model: settings.modelId,
      }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error ?? "Could not load components.");
    snapshot = catalogSnapshotSchema.parse(data);
    if (
      snapshot.release !== release ||
      snapshot.chemicals.length !== choices.length ||
      snapshot.chemicals.some((c, i) => c.id !== choices[i]!.id)
    )
      throw new Error(
        "The database returned a different component selection. Please retry.",
      );
  }
  signal?.throwIfAborted();
  validateSnapshot(snapshot);
  const ranges = snapshot.chemicals.map((c) =>
    propertyRange(c, settings.modelId),
  );
  if (ranges.some((range) => !range))
    throw new Error("These components do not support the selected model.");
  if (
    Math.max(...ranges.map((r) => r![0])) >=
    Math.min(...ranges.map((r) => r![1]))
  )
    throw new Error("These components have no shared temperature range.");
  return { ...settings, mixture: "catalog", catalog: snapshot };
}

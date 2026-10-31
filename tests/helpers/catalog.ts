import fixture from "../fixtures/catalog-reference.json" with { type: "json" };
import {
  activityDatasetSchema,
  chemicalSchema,
  contentHash,
  selectParameters,
  type CatalogSnapshot,
} from "../../src/domain/thermo/data";
import {
  type ModelId,
  type ThermoSettings,
} from "../../src/domain/thermo/registry";
export const referenceChemicals = chemicalSchema
  .array()
  .parse(fixture.chemicals);
export const referenceParameters = activityDatasetSchema.parse(
  fixture.parameters,
);
export function settingsFor(
  ids: string[],
  modelId: ModelId = "ideal-gas",
): ThermoSettings {
  const chemicals = ids.map((id) =>
    referenceChemicals.find((c) => c.id === id)!,
  ) as CatalogSnapshot["chemicals"];
  const dataset = selectParameters(
    chemicals.filter((c) => c.groups),
    referenceParameters,
  );
  const catalog: CatalogSnapshot = {
    release: "a".repeat(64),
    chemicals,
    recordHashes: chemicals.map(contentHash) as [string, string],
    ...(modelId === "modified-unifac-2.0"
      ? {
          parameters: {
            dataset,
            hash: contentHash(dataset),
            sourceHash: contentHash(referenceParameters),
          },
        }
      : {}),
  };
  return { mixture: "catalog", modelId, extrapolate: false, catalog };
}

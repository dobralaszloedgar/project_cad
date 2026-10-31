import { validateSnapshot, type ActivityDataset, type Chemical } from "./data";
import type { ThermoSettings } from "./registry";
export type { Chemical } from "./data";
const nist = (cas: string) =>
  `https://webbook.nist.gov/cgi/cbook.cgi?ID=${cas}&Mask=4&Type=ANTOINE`;
export const sampleChemicals: readonly Chemical[] = [
  { id: "A", name: "Synthetic A", molecularWeight: 0.028, cp: 30, antoine: [] },
  {
    id: "B",
    name: "Synthetic B",
    molecularWeight: 0.028,
    cp: 30,
    formationEnthalpy: -20000,
    antoine: [],
  },
  {
    id: "benzene",
    name: "Benzene",
    molecularWeight: 0.0781118,
    cp: 82,
    groups: { "9": 6 },
    antoine: [
      {
        a: 4.01814,
        b: 1203.835,
        c: -53.226,
        min: 287.7,
        max: 354.07,
        source: nist("C71432"),
      },
      {
        a: 4.72583,
        b: 1660.652,
        c: -1.461,
        min: 333.4,
        max: 373.5,
        source: nist("C71432"),
      },
    ],
  },
  {
    id: "toluene",
    name: "Toluene",
    molecularWeight: 0.0921384,
    cp: 104,
    groups: { "9": 5, "11": 1 },
    antoine: [
      {
        a: 4.07827,
        b: 1343.943,
        c: -53.773,
        min: 308.52,
        max: 384.66,
        source: nist("C108883"),
      },
    ],
  },
  {
    id: "ethanol",
    name: "Ethanol",
    molecularWeight: 0.0460684,
    cp: 65,
    groups: { "1": 1, "2": 1, "14": 1 },
    antoine: [
      {
        a: 5.24677,
        b: 1598.673,
        c: -46.424,
        min: 292.77,
        max: 366.63,
        source: nist("C64175"),
      },
    ],
  },
  {
    id: "water",
    name: "Water",
    molecularWeight: 0.0180153,
    cp: 34,
    groups: { "16": 1 },
    antoine: [],
    vaporPressure: {
      model: "iapws-1992",
      source: "https://iapws.org/public/documents/6dGkr/Supp-sat.pdf",
    },
  },
];
export interface ChemicalProvider {
  version: string;
  activityParameters?: ActivityDataset;
  parameterHash?: string;
  get(id: string): Chemical;
  search(query: string, limit?: number): readonly Chemical[];
}
const byId = new Map(sampleChemicals.map((c) => [c.id, c]));
export const sampleCatalog: ChemicalProvider = {
  version: "sample-2026-10-28",
  get(id) {
    const chemical = byId.get(id);
    if (!chemical)
      throw new Error(`Chemical ${id} is not in the sample catalog.`);
    return chemical;
  },
  search(query, limit = 20) {
    return sampleChemicals
      .filter((c) =>
        `${c.id} ${c.name}`.toLowerCase().includes(query.toLowerCase()),
      )
      .slice(0, limit);
  },
};
export const sampleMixtures = {
  demo: { name: "Synthetic A / B", ids: ["A", "B"] },
  aromatics: { name: "Benzene / toluene", ids: ["benzene", "toluene"] },
  aqueous: { name: "Ethanol / water", ids: ["ethanol", "water"] },
} as const;

export function thermoContext(settings: ThermoSettings) {
  if (settings.mixture !== "catalog")
    return {
      catalog: sampleCatalog,
      ids: sampleMixtures[settings.mixture].ids,
    };
  const snapshot = settings.catalog;
  if (!snapshot)
    throw new Error("Select and load chemicals from the catalog first.");
  validateSnapshot(snapshot);
  if (settings.modelId === "modified-unifac-2.0" && !snapshot.parameters)
    throw new Error(
      "Reload the selected chemicals for Modified UNIFAC 2.0 parameters.",
    );
  const catalog: ChemicalProvider = {
    version: snapshot.release,
    activityParameters: snapshot.parameters?.dataset,
    parameterHash: snapshot.parameters?.hash,
    get(id) {
      const c = snapshot.chemicals.find((c) => c.id === id);
      if (!c)
        throw new Error(
          `Chemical ${id} is absent from the saved catalog selection.`,
        );
      return c;
    },
    search: (query, limit = 20) =>
      snapshot.chemicals
        .filter((c) =>
          `${c.id} ${c.name}`.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, limit),
  };
  const context = { catalog, ids: snapshot.chemicals.map((c) => c.id) };
  return context;
}
export function mixtureName(settings: ThermoSettings) {
  return settings.mixture === "catalog"
    ? (settings.catalog?.chemicals.map((c) => c.name).join(" / ") ??
        "Catalog selection required")
    : sampleMixtures[settings.mixture].name;
}

/** Display real identities while retaining legacy labels for teaching projects. */
export function componentNames(settings: ThermoSettings): string[] {
  if (settings.mixture === "demo") return ["A", "B"];
  if (settings.mixture === "catalog")
    return (
      settings.catalog?.chemicals.map((c) => c.name) ?? [
        "Component 1",
        "Component 2",
      ]
    );
  const { catalog, ids } = thermoContext(settings);
  return ids.map((id) => catalog.get(id).name);
}

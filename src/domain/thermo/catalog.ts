// Small replaceable sample provider. Database size is independent of the model registry.
export interface AntoineRecord {
  a: number;
  b: number;
  c: number;
  min: number;
  max: number;
  source: string;
}
export interface Chemical {
  id: string;
  name: string;
  molecularWeight: number; // kg/mol
  cp: number; // sample constant ideal-gas Cp, J/(mol K)
  formationEnthalpy?: number; // J/mol at 298.15 K
  antoine: AntoineRecord[]; // log10(P/bar) = a - b/(T/K+c)
  groups?: Record<string, number>;
}
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
    antoine: [
      {
        a: 5.40221,
        b: 1838.675,
        c: -31.737,
        min: 273,
        max: 303,
        source: nist("C7732185"),
      },
      {
        a: 5.20389,
        b: 1733.926,
        c: -39.485,
        min: 304,
        max: 333,
        source: nist("C7732185"),
      },
      {
        a: 5.0768,
        b: 1659.793,
        c: -45.854,
        min: 334,
        max: 363,
        source: nist("C7732185"),
      },
      {
        a: 5.08354,
        b: 1663.125,
        c: -45.622,
        min: 344,
        max: 373,
        source: nist("C7732185"),
      },
    ],
  },
];
export interface ChemicalProvider {
  version: string;
  get(id: string): Chemical;
  search(query: string, limit?: number): readonly Chemical[];
}
const byId = new Map(sampleChemicals.map((c) => [c.id, c]));
export const sampleCatalog: ChemicalProvider = {
  version: "sample-2026-10-27",
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

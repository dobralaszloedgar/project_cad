// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { projectSchema, type Project } from "./schema";
import { templateUnit } from "./template-presets";
import { catalogSnapshotSchema } from "./thermo/data";
import { defaultRateLaw } from "./reactions/rateLaw";
import type { RateLaw } from "./reactions/rateLawSchema";
import {
  packedBedSchema,
  reactionSchema,
  type Reaction,
} from "./reactions/schema";
import { templateChemicalJson } from "./reactions/template-chemicals";

// Verified, unchanged records from the published catalog. Bundle the snapshot
// so templates, exports and offline calculations need no database connection.
const snapshot = catalogSnapshotSchema.parse(JSON.parse(templateChemicalJson));
const CO = "630-08-0",
  WATER = "7732-18-5",
  CO2 = "124-38-9";
const H2 = "1333-74-0",
  METHANOL = "67-56-1",
  ARGON = "7440-37-1";
const R = 8.31446261815324;
// Pin derived preset values across JS engines whose exp can differ by one ULP.
const referenceValue = (value: number) => Number(value.toPrecision(15));

function pressureLaw(
  species: Record<string, string>,
  unit: "atm" | "bar",
  expression: string,
  parameters: RateLaw["parameters"],
): RateLaw {
  return {
    ...defaultRateLaw(Object.values(species)[0], true),
    mode: "custom",
    reversible: true,
    variables: Object.entries(species).map(([symbol, componentId]) => ({
      symbol,
      componentId,
      basis: "partial-pressure",
      unit,
    })),
    parameters,
    forward: [],
    expression,
  };
}

function reactorProject(
  name: string,
  temperature: number,
  pressure: number,
  composition: Record<string, number>,
  catalystMass: number,
  reactions: Reaction[],
): Project {
  const ids = Object.keys(composition);
  const indices = ids.map((id) =>
    snapshot.chemicals.findIndex((c) => c.id === id),
  );
  const feed = templateUnit("Feed", "F-101", 60, 100, {
    temperature,
    pressure,
    flow: 0.01,
    composition,
  });
  feed.name = "Reactor feed";
  const reactor = templateUnit("PBR", "R-101", 280, 100, {
    temperature,
    pressure,
    packedBed: packedBedSchema.parse({
      reactions,
      conversionComponentId: reactions[0].basisComponentId,
      catalystMass,
      flowModel: "ideal-gas",
      pressureDrop: 0,
    }),
  });
  const product = templateUnit("Product", "P-101", 500, 100);
  product.name = "Reactor effluent";
  return projectSchema.parse({
    version: 1,
    name,
    thermo: {
      modelId: "ideal-gas",
      mixture: "catalog",
      extrapolate: false,
      catalog: {
        release: snapshot.release,
        chemicals: indices.map((i) => structuredClone(snapshot.chemicals[i])),
        recordHashes: indices.map((i) => snapshot.recordHashes[i]),
      },
    },
    units: [feed, reactor, product],
    edges: [
      {
        id: "feed",
        source: feed.id,
        target: reactor.id,
        sourcePort: "out",
        targetPort: "in",
      },
      {
        id: "product",
        source: reactor.id,
        target: product.id,
        sourcePort: "out",
        targetPort: "in",
      },
    ],
  });
}

export function waterGasShiftTemplate(sizeCatalyst = false): Project {
  const temperature = 493.15;
  const reaction = reactionSchema.parse({
    id: "wgs",
    name: "Water–gas shift",
    basisComponentId: CO,
    stoichiometry: [
      { componentId: CO, coefficient: -1 },
      { componentId: WATER, coefficient: -1 },
      { componentId: CO2, coefficient: 1 },
      { componentId: H2, coefficient: 1 },
    ],
    rateLaw: pressureLaw(
      { pCO: CO, pH2O: WATER, pCO2: CO2, pH2: H2 },
      "atm",
      "kf * (pCO * pH2O - pCO2 * pH2 / exp(4577.8 / T - 4.33))",
      [
        {
          symbol: "kf",
          // Choi & Stenger eq. 14: mol/(g-cat h atm²) -> mol/(kg-cat s atm²).
          value: referenceValue(
            (2.96e5 * Math.exp(-47400 / (R * temperature)) * 1000) / 3600,
          ),
          activationEnergy: 47400,
          referenceTemperature: temperature,
        },
      ],
    ),
    kineticsSource: {
      citation: "Choi & Stenger (2003), Journal of Power Sources 124, 432–439",
      url: "https://doi.org/10.1016/S0378-7753(03)00614-1",
      locator: "Equations 12 and 14; nomenclature on p. 433",
      catalyst: "Sud-Chemie EX-2248 Cu/ZnO/Al₂O₃",
      temperatureRange: [393.15, 523.15],
      pressureRange: [101325, 101325],
      rateBasis:
        "CO disappearance; partial pressures in atm. Source rate in mol/(g-cat·h) is multiplied by 1000/3600 for mol/(kg-cat·s).",
      notes:
        "Reversible empirical fit, Ea = 47.4 kJ/mol; Keq = exp(4577.8/T − 4.33). Feed H₂/CO = 2 and H₂O/CO = 2. Flow and bed mass are example specifications, not a reproduction of an experimental run. Isothermal, without transport resistance or deactivation.",
    },
  });
  const project = reactorProject(
    sizeCatalyst ? "Water–gas shift catalyst sizing" : "Water–gas shift PBR",
    temperature,
    101325,
    { [CO]: 0.2, [WATER]: 0.4, [CO2]: 0, [H2]: 0.4 },
    0.1,
    [reaction],
  );
  if (sizeCatalyst) {
    const bed = project.units[1].params.packedBed!;
    bed.sizingMode = "target-conversion";
    bed.targetConversion = 0.9;
  }
  return project;
}

export function methanolSynthesisTemplate(): Project {
  const temperature = 493.2;
  // Original paper eq. 3 and Table 2, A exp(B/RT). Negative apparent
  // activation energies for adsorption/grouped constants are intentional.
  const arrhenius = (symbol: string, a: number, b: number) => ({
    symbol,
    value: referenceValue(a * Math.exp(b / (R * temperature))),
    activationEnergy: -b,
    referenceTemperature: temperature,
  });
  const adsorption = [
    arrhenius("KH", 0.499, 17197),
    arrhenius("KW", 6.62e-11, 124119),
    { symbol: "ratio", value: 3453.38 },
  ];
  const denominator = "(1 + ratio * pH2O / pH2 + KH * sqrt(pH2) + KW * pH2O)";
  const species = { pCO2: CO2, pH2: H2, pCO: CO, pH2O: WATER, pMeOH: METHANOL };
  const kineticsSource = {
    citation: "Vanden Bussche & Froment (1996), Journal of Catalysis 161, 1–10",
    url: "https://doi.org/10.1006/jcat.1996.0156",
    locator: "Equation 3, Table 2 and equilibrium correlations on p. 5",
    catalyst: "ICI 51-2 Cu/ZnO/Al₂O₃",
    temperatureRange: [453.15, 553.15],
    pressureRange: [1500000, 5100000],
    rateBasis:
      "CO₂ disappearance in each reaction; pressures in bar and rates in mol/(kg-cat·s). Table 2 uses A·exp(B/RT); the editor stores k(Tref) with Ea = −B.",
    notes:
      "Coupled reversible methanol and reverse water–gas shift laws with a shared adsorption denominator. Requires positive hydrogen partial pressure. Feed fractions follow Table 3; 15 bar, 0.01 mol/s and 0.0348 kg are the example operating specification. Isothermal ideal gas, no transport resistance or deactivation; this is not the paper’s 50 bar benchmark.",
  };
  const methanol = reactionSchema.parse({
    id: "methanol",
    name: "Methanol synthesis",
    basisComponentId: CO2,
    stoichiometry: [
      { componentId: CO2, coefficient: -1 },
      { componentId: H2, coefficient: -3 },
      { componentId: METHANOL, coefficient: 1 },
      { componentId: WATER, coefficient: 1 },
    ],
    rateLaw: pressureLaw(
      species,
      "bar",
      `kf * (pCO2 * pH2 - pMeOH * pH2O / (10^(3066 / T - 10.592) * pH2^2)) / ${denominator}^3`,
      [arrhenius("kf", 1.07, 36696), ...adsorption],
    ),
    kineticsSource,
  });
  const shift = reactionSchema.parse({
    id: "rwgs",
    name: "Reverse water–gas shift",
    basisComponentId: CO2,
    stoichiometry: [
      { componentId: CO2, coefficient: -1 },
      { componentId: H2, coefficient: -1 },
      { componentId: CO, coefficient: 1 },
      { componentId: WATER, coefficient: 1 },
    ],
    rateLaw: pressureLaw(
      species,
      "bar",
      // K is the RWGS equilibrium constant. H₂ has power ONE in this law.
      `kf * (pCO2 - pCO * pH2O / (10^(-2073 / T + 2.029) * pH2)) / ${denominator}`,
      [arrhenius("kf", 1.22e10, -94765), ...adsorption],
    ),
    kineticsSource,
  });
  return reactorProject(
    "Methanol synthesis PBR",
    temperature,
    1500000,
    {
      [CO2]: 0.03,
      [H2]: 0.82,
      [CO]: 0.04,
      [WATER]: 0,
      [METHANOL]: 0,
      [ARGON]: 0.11,
    },
    0.0348,
    [methanol, shift],
  );
}

/** Three coupled Graaf pathways, kept separate from the two-law VBF model. */
export function methanolNetworkTemplate(): Project {
  const temperature = 503.15;
  const parameter = (symbol: string, a: number, energy: number) => ({
    symbol,
    value: referenceValue(a * Math.exp(-energy / (R * temperature))),
    activationEnergy: energy,
    referenceTemperature: temperature,
  });
  const adsorption = [
    parameter("KCO", 2.16e-5, -46800),
    parameter("KCO2", 7.05e-7, -61700),
    parameter("KW", 6.37e-9, -84000),
  ];
  const denominator =
    "((1 + KCO * pCO + KCO2 * pCO2) * (sqrt(pH2) + KW * pH2O))";
  const species = { pCO: CO, pCO2: CO2, pH2: H2, pH2O: WATER, pMeOH: METHANOL };
  const source = {
    citation:
      "Graaf et al. (1988); implementation in Terreni et al. (2020), ChemEngineering 4, 62",
    url: "https://doi.org/10.3390/chemengineering4040062",
    locator: "Equations 12–17 and Table 2; Graaf A3B2C3 kinetics",
    catalyst: "Cu/ZnO/Al₂O₃",
    temperatureRange: [483.15, 518.15],
    pressureRange: [1500000, 5000000],
    rateBasis:
      "Reaction extent in mol/(kg-cat·s), partial pressures in bar; ideal-gas fugacity approximation.",
    notes:
      "Three reversible pathways: CO hydrogenation, reverse water–gas shift, and CO₂ hydrogenation. Positive H₂ is required. Isothermal gas-phase example at 503.15 K and 15 bar; no transport resistance or deactivation.",
  };
  const reaction = (
    id: string,
    name: string,
    basisComponentId: string,
    coefficients: Record<string, number>,
    expression: string,
    a: number,
    energy: number,
  ) =>
    reactionSchema.parse({
      id,
      name,
      basisComponentId,
      stoichiometry: Object.entries(coefficients).map(
        ([componentId, coefficient]) => ({ componentId, coefficient }),
      ),
      rateLaw: pressureLaw(species, "bar", `${expression} / ${denominator}`, [
        parameter("kf", a, energy),
        ...adsorption,
      ]),
      kineticsSource: source,
    });
  return reactorProject(
    "Methanol · three reaction pathways",
    temperature,
    1500000,
    {
      [CO2]: 0.08,
      [H2]: 0.72,
      [CO]: 0.15,
      [WATER]: 0,
      [METHANOL]: 0,
      [ARGON]: 0.05,
    },
    0.5,
    [
      reaction(
        "co-methanol",
        "CO hydrogenation",
        CO,
        { [CO]: -1, [H2]: -2, [METHANOL]: 1 },
        "kf * KCO * (pCO * pH2^1.5 - pMeOH / (sqrt(pH2) * 10^(5139 / T - 12.621)))",
        4.89e7,
        113000,
      ),
      reaction(
        "rwgs",
        "Reverse water–gas shift",
        CO2,
        { [CO2]: -1, [H2]: -1, [CO]: 1, [WATER]: 1 },
        "kf * KCO2 * (pCO2 * pH2 - pH2O * pCO / 10^(-2073 / T + 2.029))",
        9.64e11,
        152900,
      ),
      reaction(
        "co2-methanol",
        "CO₂ hydrogenation",
        CO2,
        { [CO2]: -1, [H2]: -3, [METHANOL]: 1, [WATER]: 1 },
        "kf * KCO2 * (pCO2 * pH2^1.5 - pMeOH * pH2O / (pH2^1.5 * 10^(3066 / T - 10.592)))",
        1.09e5,
        87500,
      ),
    ],
  );
}

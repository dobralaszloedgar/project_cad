// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import {
  projectSchema,
  type Connection,
  type Kind,
  type Project,
  type Unit,
} from "./schema";
import { templateUnit } from "./template-presets";
import {
  methanolNetworkTemplate,
  waterGasShiftTemplate,
} from "./reaction-templates";
import { defaultDistillation } from "./equipment/distillation-schema";
import { defaultTrayHydraulics } from "./equipment/tray-hydraulics-schema";

const connect = (
  source: string,
  target: string,
  sourcePort: Connection["sourcePort"] = "out",
  targetPort: Connection["targetPort"] = "in",
) => ({
  id: `${source}-${sourcePort}-${target}`,
  source,
  target,
  sourcePort,
  targetPort,
});

export function stagedShiftTemplate(): Project {
  const project = waterGasShiftTemplate();
  const bed = project.units[1].params.packedBed!;
  const feed = project.units[0];
  feed.position = { x: 0, y: 80 };
  feed.params.flow = 1;
  const first = templateUnit("PBR", "R-101", 240, 80, {
    temperature: 513.15,
    packedBed: { ...structuredClone(bed), catalystMass: 4 },
  });
  first.name = "First shift bed";
  const cooler = templateUnit("Cooler", "C-101", 480, 80, {
    temperature: 473.15,
  });
  cooler.name = "Interstage cooling";
  const second = templateUnit("PBR", "R-102", 720, 80, {
    temperature: 473.15,
    packedBed: { ...structuredClone(bed), catalystMass: 10 },
  });
  second.name = "Hydrogen polishing bed";
  const product = templateUnit("Product", "P-101", 960, 80);
  product.name = "Hydrogen-rich product";
  return projectSchema.parse({
    ...project,
    name: "Two-stage hydrogen production",
    units: [feed, first, cooler, second, product],
    edges: [
      connect(feed.id, first.id),
      connect(first.id, cooler.id),
      connect(cooler.id, second.id),
      connect(second.id, product.id),
    ],
  });
}

/** Gas-phase synthesis and recycle, specified condensate recovery, and two
 * liquid-phase MESH columns. Recovery is imposed, not a high-pressure flash. */
export function methanolRecycleTemplate(): Project {
  const base = methanolNetworkTemplate();
  const bed = base.units[1].params.packedBed!;
  const units: Unit[] = [];
  const add = (
    kind: Kind,
    id: string,
    name: string,
    x: number,
    y: number,
    params: Partial<Unit["params"]> = {},
  ) => {
    const unit = templateUnit(kind, id, x, y, {
      temperature: 400,
      pressure: 1500000,
      ...params,
    });
    unit.name = name;
    units.push(unit);
  };
  const CO2 = "124-38-9",
    H2 = "1333-74-0",
    CO = "630-08-0",
    WATER = "7732-18-5",
    MEOH = "67-56-1",
    AR = "7440-37-1";
  add("Feed", "F-701", "Carbon oxides feed", 0, 40, {
    flow: 23,
    composition: { [CO2]: 8 / 23, [CO]: 15 / 23 },
  });
  add("Feed", "F-702", "Hydrogen makeup", 0, 260, {
    flow: 77,
    composition: { [H2]: 72 / 77, [AR]: 5 / 77 },
  });
  add("Mixer", "M-701", "Fresh syngas blend", 220, 150);
  add("Mixer", "M-702", "Recycle mixing", 440, 150);
  add("Heater", "H-701", "Feed preheater", 660, 150, { temperature: 503.15 });
  add("PBR", "R-701", "CO + CO₂ hydrogenation", 880, 150, {
    temperature: 503.15,
    packedBed: { ...structuredClone(bed), catalystMass: 3000 },
  });
  add("Cooler", "C-701", "Interstage cooler", 1100, 150, {
    temperature: 493.15,
  });
  add("PBR", "R-702", "Second synthesis bed", 1320, 150, {
    temperature: 493.15,
    packedBed: { ...structuredClone(bed), catalystMass: 4000 },
  });
  add("Cooler", "C-702", "Effluent cooling", 1320, 410, { temperature: 430 });
  add("Splitter", "S-703", "Condensate recovery · specified", 880, 450, {
    componentSplit: {
      recoveries: {
        [CO2]: 1,
        [H2]: 1,
        [CO]: 1,
        [AR]: 1,
        [MEOH]: 0.01,
        [WATER]: 0.01,
      },
      outlets: [
        { temperature: 330, pressure: 1500000, modelId: "ideal-gas" },
        { temperature: 330, pressure: 180000, modelId: "ideal-solution" },
      ],
    },
  });
  add("Splitter", "S-701", "Recycle and purge", 1100, 620, {
    splitFractions: [0.4, 0.6],
  });
  add("Product", "P-701", "Inert purge", 1320, 620);
  add("Cooler", "C-703", "Recycle cooling", 660, 450, { temperature: 320 });
  add("Distillation", "D-701", "Crude methanol tower · MESH", 880, 850, {
    pressure: 150000,
    trayCount: 16,
    distillation: {
      ...defaultDistillation([MEOH, WATER]),
      method: "mesh",
      feedTray: 9,
      refluxRatio: 2.5,
      distillateFlow: 3.9,
      pressureDrop: 8000,
      tolerance: 1e-11,
      hydraulics: {
        ...defaultTrayHydraulics(),
        diameter: 0.45,
        liquidDensity: 850,
        surfaceTension: 0.028,
      },
    },
  });
  add("Cooler", "C-704", "Intercolumn cooling", 1100, 850, {
    temperature: 330,
  });
  add("Distillation", "D-702", "Methanol polishing tower · MESH", 1320, 850, {
    pressure: 101325,
    trayCount: 20,
    distillation: {
      ...defaultDistillation([MEOH, WATER]),
      method: "mesh",
      feedTray: 11,
      refluxRatio: 3,
      distillateFlow: 3.4,
      pressureDrop: 10000,
      tolerance: 1e-11,
      hydraulics: {
        ...defaultTrayHydraulics(),
        diameter: 0.55,
        liquidDensity: 800,
        surfaceTension: 0.025,
      },
    },
  });
  add("Cooler", "C-705", "Methanol product cooling", 1540, 842, {
    temperature: 320,
  });
  add("Product", "P-702", "Methanol product", 1760, 800);
  add("Product", "P-703", "Polishing bottoms", 1540, 1180);
  add("Cooler", "C-706", "Water-rich bottoms cooling", 1100, 1380, {
    temperature: 320,
  });
  add("Product", "P-704", "Water-rich bottoms", 1320, 1380);
  const edges = [
    connect("F-701", "M-701"),
    connect("F-702", "M-701", "out", "in2"),
    connect("M-701", "M-702"),
    connect("M-702", "H-701"),
    connect("H-701", "R-701"),
    connect("R-701", "C-701"),
    connect("C-701", "R-702"),
    connect("R-702", "C-702"),
    connect("C-702", "S-703"),
    connect("S-703", "S-701"),
    connect("S-701", "P-701"),
    connect("S-701", "C-703", "out2"),
    connect("C-703", "M-702", "out", "in2"),
    connect("S-703", "D-701", "out2"),
    connect("D-701", "C-704"),
    connect("C-704", "D-702"),
    connect("D-702", "C-705"),
    connect("C-705", "P-702"),
    connect("D-702", "P-703", "out2"),
    connect("D-701", "C-706", "out2"),
    connect("C-706", "P-704"),
  ];
  return projectSchema.parse({
    ...base,
    name: "Methanol synthesis and recycle plant",
    units,
    edges,
  });
}

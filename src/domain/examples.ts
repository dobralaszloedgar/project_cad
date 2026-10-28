import { newUnit, type Project, type Connection } from "./schema";
const edge = (
  id: string,
  source: string,
  target: string,
  sourcePort: Connection["sourcePort"] = "out",
  targetPort: Connection["targetPort"] = "in",
): Connection => ({
  id,
  source,
  target,
  sourcePort,
  targetPort,
  color: sourcePort === "out2" ? "blue" : "teal",
});
export function reactorExample(): Project {
  const units = [
    newUnit("Feed", "F-101", 0, 100),
    newUnit("Mixer", "M-101", 185, 100),
    newUnit("Heater", "H-101", 370, 100),
    newUnit("PBR", "R-101", 555, 100),
    newUnit("Splitter", "S-101", 740, 100),
    newUnit("Product", "P-101", 925, 100),
  ];
  // Keep the original residence-time benchmark stable for saved demos.
  units.find((unit) => unit.kind === "PBR")!.params.reactorMode =
    "residence-time";
  return {
    version: 1,
    name: "Heated reactor with recycle",
    units,
    edges: [
      edge("s1", "F-101", "M-101"),
      edge("s2", "M-101", "H-101"),
      edge("s3", "H-101", "R-101"),
      edge("s4", "R-101", "S-101"),
      edge("s5", "S-101", "P-101"),
      edge("recycle", "S-101", "M-101", "out2", "in2"),
    ],
  };
}
export function distillationExample(): Project {
  const feed = newUnit("Feed", "F-201", 0, 100);
  feed.params.fractionA = 0.5;
  feed.params.temperature = 350;
  return {
    version: 1,
    name: "Ideal binary separation",
    units: [
      feed,
      newUnit("Distillation", "D-201", 240, 100),
      newUnit("Product", "P-201", 500, 0),
      newUnit("Product", "P-202", 500, 240),
    ],
    edges: [
      edge("s1", "F-201", "D-201"),
      edge("distillate", "D-201", "P-201"),
      edge("bottoms", "D-201", "P-202", "out2"),
    ],
  };
}

export function heatingExample(): Project {
  const heater = newUnit("Heater", "H-301", 260, 100);
  heater.params.temperature = 400;
  return {
    version: 1,
    name: "Simple heating",
    units: [
      newUnit("Feed", "F-301", 0, 100),
      heater,
      newUnit("Product", "P-301", 520, 100),
    ],
    edges: [edge("s1", "F-301", "H-301"), edge("s2", "H-301", "P-301")],
  };
}

export function solutionExample(): Project {
  const project = distillationExample();
  project.name = "Benzene / toluene TP separation";
  project.thermo = {
    modelId: "ideal-solution",
    mixture: "aromatics",
    extrapolate: false,
  };
  project.units[0].params.temperature = 350;
  project.units[0].params.pressure = 55000;
  return project;
}

export function thermalCycleExample(): Project {
  const heater = newUnit("Heater", "H-401", 200, 100);
  heater.params.thermalMode = "duty";
  heater.params.heatDuty = 30000;
  const cooler = newUnit("Cooler", "C-401", 400, 100);
  return {
    version: 1,
    name: "Heating and cooling",
    units: [
      newUnit("Feed", "F-401", 0, 100),
      heater,
      cooler,
      newUnit("Product", "P-401", 600, 100),
    ],
    edges: [
      edge("feed", "F-401", "H-401"),
      edge("heated", "H-401", "C-401"),
      edge("cooled", "C-401", "P-401"),
    ],
  };
}

export function mixingExample(): Project {
  const first = newUnit("Feed", "F-501", 0, 0);
  const second = newUnit("Feed", "F-502", 0, 220);
  second.params.fractionA = 0;
  second.params.flow = 5;
  second.params.temperature = 450;
  const splitter = newUnit("Splitter", "S-501", 420, 100);
  splitter.params.recycleFraction = 0.25;
  return {
    version: 1,
    name: "Mixing and splitting",
    units: [
      first,
      second,
      newUnit("Mixer", "M-501", 210, 100),
      splitter,
      newUnit("Product", "P-501", 650, 0),
      newUnit("Product", "P-502", 650, 220),
    ],
    edges: [
      edge("feed-a", "F-501", "M-501"),
      edge("feed-b", "F-502", "M-501", "out", "in2"),
      edge("mixed", "M-501", "S-501"),
      edge("primary", "S-501", "P-501"),
      edge("secondary", "S-501", "P-502", "out2"),
    ],
  };
}

export function catalystExample(): Project {
  const first = newUnit("Feed", "F-601", 0, 0);
  first.params.temperature = 450;
  const second = newUnit("Feed", "F-602", 0, 240);
  second.params.fractionA = 0;
  second.params.flow = 5;
  second.params.temperature = 350;
  return {
    version: 1,
    name: "Catalyst-weight reactor",
    units: [
      first,
      second,
      newUnit("PBR", "R-601", 240, 100),
      newUnit("Product", "P-601", 500, 240),
    ],
    edges: [
      edge("feed-a", "F-601", "R-601"),
      edge("feed-b", "F-602", "R-601", "out", "in2"),
      edge("reacted", "R-601", "P-601"),
    ],
  };
}

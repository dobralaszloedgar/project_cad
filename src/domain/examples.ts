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

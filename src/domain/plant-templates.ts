import { newUnit, type Kind, type Project, type Connection } from "./schema";

const feed = "#008f88",
  warm = "#d18416",
  cool = "#168bb9";
const place = (
  id: string,
  kind: Kind,
  column: number,
  row: number,
  tag: string,
  title: string,
  color = feed,
) => ({
  id,
  kind,
  position: [(column - 2) * 5.5, 0, (row - 2) * 5.5] as [
    number,
    number,
    number,
  ],
  tag,
  title,
  color,
});
const pipe = (from: string, to: string, color = feed) => ({
  id: `${from}-${to}`,
  from: from.split(".") as [string, string],
  to: to.split(".") as [string, string],
  color,
});

function reactionCore(series: number) {
  const equipment = [
    place("feed", "Feed", 0, 0, `F-${series}01`, "Main feed"),
    place("additive", "Feed", 1, 0, `F-${series}02`, "Additive", cool),
    place("blend", "Mixer", 2, 0, `M-${series}01`, "Feed blender"),
    place("preheat", "Heater", 3, 0, `H-${series}01`, "Feed preheater"),
    place(
      "split",
      "Splitter",
      4,
      0,
      `S-${series}01`,
      "Reactor distribution",
      warm,
    ),
    place("reactorA", "PBR", 0, 1, `R-${series}01`, "Reactor A", warm),
    place("coolerA", "Cooler", 1, 1, `C-${series}01`, "Reactor A cooler", warm),
    place("merge", "Mixer", 2, 1, `M-${series}02`, "Effluent blender", cool),
    place("reactorB", "PBR", 3, 1, `R-${series}02`, "Reactor B", warm),
    place("coolerB", "Cooler", 4, 1, `C-${series}02`, "Reactor B cooler", warm),
  ];
  const connections = [
    pipe("feed.out", "blend.in"),
    pipe("additive.out", "blend.dose", cool),
    pipe("blend.out", "preheat.in"),
    pipe("preheat.out", "split.in", warm),
    pipe("split.a", "reactorA.in", warm),
    pipe("split.b", "reactorB.in", warm),
    pipe("reactorA.out", "coolerA.in", warm),
    pipe("reactorB.out", "coolerB.in", warm),
    pipe("coolerA.out", "merge.in", cool),
    pipe("coolerB.out", "merge.dose", cool),
  ];
  return { equipment, connections };
}

function parallel() {
  const core = reactionCore(6);
  return {
    id: "parallel",
    title: "Parallel reaction & finishing",
    description:
      "17 assemblies: two feed tanks, parallel reactor branches, blending and product separation.",
    operation:
      "Two feeds blend and preheat before the manifold divides the flow between two fixed-bed reactors. Each branch is cooled, then the effluents recombine. A finishing column supplies an overhead product and a bottoms stream distributed to two receivers.",
    equipment: [
      ...core.equipment,
      place("finishHeat", "Heater", 0, 2, "H-602", "Finishing preheater", cool),
      place("column", "Distillation", 1, 2, "D-601", "Finishing column", warm),
      place("overheadCool", "Cooler", 2, 2, "C-603", "Overhead cooler", cool),
      place("light", "Product", 3, 2, "P-601", "Overhead product", cool),
      place(
        "bottomSplit",
        "Splitter",
        2,
        3,
        "S-602",
        "Bottoms distribution",
        warm,
      ),
      place("bottomA", "Product", 3, 3, "P-602", "Bottoms receiver A", warm),
      place("bottomB", "Product", 4, 3, "P-603", "Bottoms receiver B", warm),
    ],
    connections: [
      ...core.connections,
      pipe("merge.out", "finishHeat.in", cool),
      pipe("finishHeat.out", "column.in", warm),
      pipe("column.top", "overheadCool.in", cool),
      pipe("overheadCool.out", "light.in", cool),
      pipe("column.bottom", "bottomSplit.in", warm),
      pipe("bottomSplit.a", "bottomA.in", warm),
      pipe("bottomSplit.b", "bottomB.in", warm),
    ],
  };
}

function integrated() {
  const core = reactionCore(7);
  return {
    id: "integrated",
    title: "Integrated process plant",
    description:
      "25 assemblies: feed blending, parallel reaction, two separation columns and five product receivers.",
    operation:
      "Blended feed divides into two reactor trains, cools, and recombines. The first column supplies an overhead cut to two receivers. Its bottoms feed a second heated column, which delivers another overhead product and a bottoms stream split through two final coolers. The layout illustrates process connectivity; operating pressures and transfer machinery are outside this preview.",
    equipment: [
      ...core.equipment,
      place(
        "firstHeat",
        "Heater",
        0,
        2,
        "H-702",
        "First-column preheater",
        cool,
      ),
      place("firstColumn", "Distillation", 1, 2, "D-701", "First column", warm),
      place(
        "firstCool",
        "Cooler",
        2,
        2,
        "C-703",
        "First overhead cooler",
        cool,
      ),
      place(
        "firstSplit",
        "Splitter",
        3,
        2,
        "S-702",
        "First-cut distribution",
        cool,
      ),
      place("lightA", "Product", 4, 2, "P-701", "First cut · receiver A", cool),
      place(
        "secondHeat",
        "Heater",
        0,
        3,
        "H-703",
        "Second-column preheater",
        warm,
      ),
      place(
        "secondColumn",
        "Distillation",
        1,
        3,
        "D-702",
        "Second column",
        warm,
      ),
      place(
        "secondCool",
        "Cooler",
        2,
        3,
        "C-704",
        "Second overhead cooler",
        cool,
      ),
      place("lightB", "Product", 3, 3, "P-702", "First cut · receiver B", cool),
      place("middle", "Product", 4, 3, "P-703", "Second overhead cut", cool),
      place(
        "bottomSplit",
        "Splitter",
        0,
        4,
        "S-703",
        "Bottoms distribution",
        warm,
      ),
      place("bottomCoolA", "Cooler", 1, 4, "C-705", "Bottoms cooler A", warm),
      place("bottomA", "Product", 2, 4, "P-704", "Bottoms receiver A", cool),
      place("bottomCoolB", "Cooler", 3, 4, "C-706", "Bottoms cooler B", warm),
      place("bottomB", "Product", 4, 4, "P-705", "Bottoms receiver B", cool),
    ],
    connections: [
      ...core.connections,
      pipe("merge.out", "firstHeat.in", cool),
      pipe("firstHeat.out", "firstColumn.in", warm),
      pipe("firstColumn.top", "firstCool.in", cool),
      pipe("firstCool.out", "firstSplit.in", cool),
      pipe("firstSplit.a", "lightA.in", cool),
      pipe("firstSplit.b", "lightB.in", cool),
      pipe("firstColumn.bottom", "secondHeat.in", warm),
      pipe("secondHeat.out", "secondColumn.in", warm),
      pipe("secondColumn.top", "secondCool.in", cool),
      pipe("secondCool.out", "middle.in", cool),
      pipe("secondColumn.bottom", "bottomSplit.in", warm),
      pipe("bottomSplit.a", "bottomCoolA.in", warm),
      pipe("bottomCoolA.out", "bottomA.in", cool),
      pipe("bottomSplit.b", "bottomCoolB.in", warm),
      pipe("bottomCoolB.out", "bottomB.in", cool),
    ],
  };
}

function fractionation() {
  return {
    id: "fractionation",
    title: "Three-column fractionation",
    description:
      "21 assemblies: three heated columns, four cooling duties and seven receiving vessels.",
    operation:
      "Three columns process the successive bottoms streams. Each overhead cut is cooled and collected; distribution manifolds send selected cuts to paired receivers. The final heavy cut passes through its own cooler and distribution manifold. Paired receivers collect the same cut, rather than representing additional separations.",
    equipment: [
      place("feed", "Feed", 0, 0, "F-801", "Mixed feed"),
      place("heatA", "Heater", 1, 0, "H-801", "First preheater"),
      place("columnA", "Distillation", 2, 0, "D-801", "First column", warm),
      place("coolA", "Cooler", 3, 0, "C-801", "First-cut cooler", cool),
      place(
        "splitA",
        "Splitter",
        4,
        0,
        "S-801",
        "First-cut distribution",
        cool,
      ),
      place("heatB", "Heater", 0, 1, "H-802", "Second preheater", warm),
      place("columnB", "Distillation", 1, 1, "D-802", "Second column", warm),
      place("coolB", "Cooler", 2, 1, "C-802", "Second-cut cooler", cool),
      place("firstA", "Product", 3, 1, "P-801", "First cut · receiver A", cool),
      place("firstB", "Product", 4, 1, "P-802", "First cut · receiver B", cool),
      place("heatC", "Heater", 0, 2, "H-803", "Third preheater", warm),
      place("columnC", "Distillation", 1, 2, "D-803", "Third column", warm),
      place("coolC", "Cooler", 2, 2, "C-803", "Third-cut cooler", cool),
      place(
        "splitC",
        "Splitter",
        3,
        2,
        "S-802",
        "Third-cut distribution",
        cool,
      ),
      place("second", "Product", 4, 2, "P-803", "Second cut", cool),
      place("coolHeavy", "Cooler", 0, 3, "C-804", "Heavy-cut cooler", warm),
      place(
        "splitHeavy",
        "Splitter",
        1,
        3,
        "S-803",
        "Heavy-cut distribution",
        cool,
      ),
      place("thirdA", "Product", 2, 3, "P-804", "Third cut · receiver A", cool),
      place("thirdB", "Product", 3, 3, "P-805", "Third cut · receiver B", cool),
      place("heavyA", "Product", 4, 3, "P-806", "Heavy cut · receiver A", cool),
      place("heavyB", "Product", 4, 4, "P-807", "Heavy cut · receiver B", cool),
    ],
    connections: [
      pipe("feed.out", "heatA.in"),
      pipe("heatA.out", "columnA.in", warm),
      pipe("columnA.top", "coolA.in", cool),
      pipe("coolA.out", "splitA.in", cool),
      pipe("splitA.a", "firstA.in", cool),
      pipe("splitA.b", "firstB.in", cool),
      pipe("columnA.bottom", "heatB.in", warm),
      pipe("heatB.out", "columnB.in", warm),
      pipe("columnB.top", "coolB.in", cool),
      pipe("coolB.out", "second.in", cool),
      pipe("columnB.bottom", "heatC.in", warm),
      pipe("heatC.out", "columnC.in", warm),
      pipe("columnC.top", "coolC.in", cool),
      pipe("coolC.out", "splitC.in", cool),
      pipe("splitC.a", "thirdA.in", cool),
      pipe("splitC.b", "thirdB.in", cool),
      pipe("columnC.bottom", "coolHeavy.in", warm),
      pipe("coolHeavy.out", "splitHeavy.in", cool),
      pipe("splitHeavy.a", "heavyA.in", cool),
      pipe("splitHeavy.b", "heavyB.in", cool),
    ],
  };
}

export const plantTemplates = [integrated(), parallel(), fractionation()];

/** Lightweight project data; loading the template picker never loads WebGL. */
export function plantTemplate(id: string): Project | undefined {
  const definition = plantTemplates.find((item) => item.id === id);
  if (!definition) return undefined;
  const tags = new Map(definition.equipment.map((item) => [item.id, item.tag]));
  const units = definition.equipment.map((item) => {
    const unit = newUnit(
      item.kind,
      item.tag,
      (item.position[0] / 5.5 + 2) * 220,
      (item.position[2] / 5.5 + 2) * 200,
    );
    unit.name = item.title;
    if (unit.kind === "Feed") unit.params.fractionA = 0.65;
    return unit;
  });
  const edges: Connection[] = definition.connections.map((stream, i) => ({
    id: `s${i + 1}`,
    source: tags.get(stream.from[0])!,
    target: tags.get(stream.to[0])!,
    sourcePort:
      stream.from[1] === "b" || stream.from[1] === "bottom" ? "out2" : "out",
    targetPort: stream.to[1] === "dose" ? "in2" : "in",
    color:
      stream.color === warm ? "amber" : stream.color === cool ? "blue" : "teal",
  }));
  return { version: 1, name: definition.title, units, edges };
}

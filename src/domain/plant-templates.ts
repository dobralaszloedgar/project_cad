import {
  newUnit,
  paramsSchema,
  type Kind,
  type Project,
  type Connection,
  type Unit,
} from "./schema";

export type PlantTemplateEquipment = {
  id: string;
  kind: Kind;
  position: [number, number, number];
  tag: string;
  title: string;
  color: string;
  params?: Partial<Unit["params"]>;
};

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
  params?: Partial<Unit["params"]>,
): PlantTemplateEquipment => ({
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
  params,
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

/** Authoring helpers keep the larger examples as lightweight, editable data.
 * Column trays describe visible internals; each solver column is still one contact. */
function advancedPlant() {
  const equipment: PlantTemplateEquipment[] = [];
  const connections: ReturnType<typeof pipe>[] = [];
  const add = (
    id: string,
    kind: Kind,
    tag: string,
    title: string,
    params: Partial<Unit["params"]> = {},
    color = feed,
  ) => {
    const index = equipment.length;
    equipment.push(
      place(
        id,
        kind,
        index % 6,
        Math.floor(index / 6),
        tag,
        title,
        color,
        params,
      ),
    );
  };
  const link = (from: string, to: string, color = feed) => {
    connections.push(pipe(from, to, color));
  };
  return { equipment, connections, add, link };
}

function recycleComplex() {
  const { equipment, connections, add, link } = advancedPlant();
  add("feed", "Feed", "F-901", "Fresh process feed", {
    flow: 18,
    fractionA: 0.8,
  });
  add(
    "additive",
    "Feed",
    "F-902",
    "Blend feed",
    { flow: 4, fractionA: 0.35 },
    cool,
  );
  add("blend", "Mixer", "M-901", "Fresh-feed blender");
  add("recycleMix", "Mixer", "M-902", "Fresh and recycle mixer");
  add("preheat", "Heater", "H-901", "First reactor preheater", {
    temperature: 430,
  });
  add(
    "reactorA",
    "PBR",
    "R-901",
    "First reactor",
    { temperature: 430, residenceTime: 5 },
    warm,
  );
  add(
    "intercool",
    "Cooler",
    "C-901",
    "Interstage cooler",
    { temperature: 340 },
    warm,
  );
  add("trimHeat", "Heater", "H-902", "Second reactor trim heater", {
    temperature: 465,
  });
  add(
    "reactorB",
    "PBR",
    "R-902",
    "Second reactor",
    { temperature: 465, residenceTime: 4 },
    warm,
  );
  add(
    "effluentCool",
    "Cooler",
    "C-902",
    "Effluent cooler",
    { temperature: 330 },
    warm,
  );
  add("recycleSplit", "Splitter", "S-901", "Product and recycle split", {
    recycleFraction: 0.25,
  });
  add(
    "returnCool",
    "Cooler",
    "C-903",
    "Recycle return cooler",
    { temperature: 300 },
    cool,
  );
  add("heatA", "Heater", "H-903", "First recovery preheater", {
    temperature: 400,
  });
  add(
    "columnA",
    "Distillation",
    "D-901",
    "First recovery column",
    { trayCount: 12, distillateFraction: 0.35 },
    warm,
  );
  add("coolA", "Cooler", "C-904", "First-cut cooler", {}, cool);
  add("splitA", "Splitter", "S-902", "First-cut distribution", {}, cool);
  add("lightA", "Product", "P-901", "First cut receiver A", {}, cool);
  add("lightB", "Product", "P-902", "First cut receiver B", {}, cool);
  add(
    "heatB",
    "Heater",
    "H-904",
    "Second recovery preheater",
    { temperature: 430 },
    warm,
  );
  add(
    "columnB",
    "Distillation",
    "D-902",
    "Second recovery column",
    { trayCount: 10, distillateFraction: 0.4 },
    warm,
  );
  add("coolB", "Cooler", "C-905", "Second-cut cooler", {}, cool);
  add(
    "splitB",
    "Splitter",
    "S-903",
    "Second-cut distribution",
    { recycleFraction: 0.4 },
    cool,
  );
  add("middleA", "Product", "P-903", "Second cut receiver A", {}, cool);
  add("middleB", "Product", "P-904", "Second cut receiver B", {}, cool);
  add(
    "heatC",
    "Heater",
    "H-905",
    "Final recovery preheater",
    { temperature: 460 },
    warm,
  );
  add(
    "columnC",
    "Distillation",
    "D-903",
    "Final recovery column",
    { trayCount: 8, distillateFraction: 0.45 },
    warm,
  );
  add("coolC", "Cooler", "C-906", "Final overhead cooler", {}, cool);
  add("third", "Product", "P-905", "Final overhead receiver", {}, cool);
  add("heavyCool", "Cooler", "C-907", "Heavy-product cooler", {}, warm);
  add(
    "heavySplit",
    "Splitter",
    "S-904",
    "Heavy-product distribution",
    {},
    cool,
  );
  add("heavyA", "Product", "P-906", "Heavy receiver A", {}, cool);
  add("heavyB", "Product", "P-907", "Heavy receiver B", {}, cool);

  link("feed.out", "blend.in");
  link("additive.out", "blend.dose", cool);
  link("blend.out", "recycleMix.in");
  link("recycleMix.out", "preheat.in");
  link("preheat.out", "reactorA.in", warm);
  link("reactorA.out", "intercool.in", warm);
  link("intercool.out", "trimHeat.in", cool);
  link("trimHeat.out", "reactorB.in", warm);
  link("reactorB.out", "effluentCool.in", warm);
  link("effluentCool.out", "recycleSplit.in", cool);
  link("recycleSplit.b", "returnCool.in", cool);
  link("returnCool.out", "recycleMix.dose", cool);
  link("recycleSplit.a", "heatA.in");
  link("heatA.out", "columnA.in", warm);
  link("columnA.top", "coolA.in", cool);
  link("coolA.out", "splitA.in", cool);
  link("splitA.a", "lightA.in", cool);
  link("splitA.b", "lightB.in", cool);
  link("columnA.bottom", "heatB.in", warm);
  link("heatB.out", "columnB.in", warm);
  link("columnB.top", "coolB.in", cool);
  link("coolB.out", "splitB.in", cool);
  link("splitB.a", "middleA.in", cool);
  link("splitB.b", "middleB.in", cool);
  link("columnB.bottom", "heatC.in", warm);
  link("heatC.out", "columnC.in", warm);
  link("columnC.top", "coolC.in", cool);
  link("coolC.out", "third.in", cool);
  link("columnC.bottom", "heavyCool.in", warm);
  link("heavyCool.out", "heavySplit.in", cool);
  link("heavySplit.a", "heavyA.in", cool);
  link("heavySplit.b", "heavyB.in", cool);
  return {
    id: "recycle-complex",
    title: "Recycle recovery plant",
    description:
      "32 assemblies: two reactors, a cooled recycle loop, three recovery columns and seven product receivers.",
    operation:
      "Fresh feeds blend with a cooled return stream before two reaction stages. A quarter of the cooled effluent returns to the feed mixer; the remainder enters three successive recovery columns. Each overhead cut and the final heavy cut is cooled and collected. The splitter returns both teaching species in the same proportions.",
    equipment,
    connections,
  };
}

function parallelComplex() {
  const { equipment, connections, add, link } = advancedPlant();
  add("feed", "Feed", "F-1001", "Main process feed", {
    flow: 24,
    fractionA: 0.8,
  });
  add(
    "additive",
    "Feed",
    "F-1002",
    "Feed blend component",
    { flow: 6, fractionA: 0.4 },
    cool,
  );
  add("blend", "Mixer", "M-1001", "Feed blender");
  add("preheat", "Heater", "H-1001", "Common feed preheater", {
    temperature: 360,
  });
  add(
    "splitA",
    "Splitter",
    "S-1001",
    "Train A distribution",
    { recycleFraction: 2 / 3 },
    warm,
  );
  add("splitBC", "Splitter", "S-1002", "Trains B and C distribution", {}, warm);
  for (const [letter, suffix, temperature] of [
    ["A", 2, 425],
    ["B", 3, 450],
    ["C", 4, 475],
  ] as const) {
    add(
      `heat${letter}`,
      "Heater",
      `H-100${suffix}`,
      `Train ${letter} trim heater`,
      { temperature },
      warm,
    );
    add(
      `reactor${letter}`,
      "PBR",
      `R-100${suffix - 1}`,
      `Train ${letter} reactor`,
      { temperature, residenceTime: 5 },
      warm,
    );
    add(
      `cool${letter}`,
      "Cooler",
      `C-100${suffix - 1}`,
      `Train ${letter} cooler`,
      { temperature: 320 },
      warm,
    );
  }
  add("mergeAB", "Mixer", "M-1002", "Trains A and B merge", {}, cool);
  add("mergeABC", "Mixer", "M-1003", "Three-train effluent merge", {}, cool);
  add(
    "conditioningFeed",
    "Feed",
    "F-1003",
    "Finishing blend component",
    { flow: 3, fractionA: 0.2 },
    cool,
  );
  add("finishBlend", "Mixer", "M-1004", "Finishing feed blender", {}, cool);
  add("finishHeat", "Heater", "H-1005", "First finishing preheater", {
    temperature: 390,
  });
  add(
    "columnA",
    "Distillation",
    "D-1001",
    "First finishing column",
    { trayCount: 12, distillateFraction: 0.3 },
    warm,
  );
  add("lightCool", "Cooler", "C-1004", "First-cut cooler", {}, cool);
  add("lightSplit", "Splitter", "S-1003", "First-cut distribution", {}, cool);
  add("lightA", "Product", "P-1001", "First cut receiver A", {}, cool);
  add("lightB", "Product", "P-1002", "First cut receiver B", {}, cool);
  add(
    "secondHeat",
    "Heater",
    "H-1006",
    "Second finishing preheater",
    { temperature: 420 },
    warm,
  );
  add(
    "columnB",
    "Distillation",
    "D-1002",
    "Second finishing column",
    { trayCount: 10, distillateFraction: 0.4 },
    warm,
  );
  add("middleCool", "Cooler", "C-1005", "Second-cut cooler", {}, cool);
  add(
    "productAdditive",
    "Feed",
    "F-1004",
    "Product blend component",
    { flow: 2, fractionA: 0.1 },
    cool,
  );
  add(
    "productBlend",
    "Mixer",
    "M-1005",
    "Second-cut product blender",
    {},
    cool,
  );
  add("middle", "Product", "P-1003", "Blended second-cut receiver", {}, cool);
  add(
    "thirdHeat",
    "Heater",
    "H-1007",
    "Final finishing preheater",
    { temperature: 450 },
    warm,
  );
  add(
    "columnC",
    "Distillation",
    "D-1003",
    "Final finishing column",
    { trayCount: 8, distillateFraction: 0.45 },
    warm,
  );
  add("thirdCool", "Cooler", "C-1006", "Final overhead cooler", {}, cool);
  add("third", "Product", "P-1004", "Final overhead receiver", {}, cool);
  add("heavyCool", "Cooler", "C-1007", "Heavy-product cooler", {}, warm);
  add(
    "heavySplit",
    "Splitter",
    "S-1004",
    "Heavy-product distribution",
    {},
    cool,
  );
  add("heavyA", "Product", "P-1005", "Heavy receiver A", {}, cool);
  add("heavyB", "Product", "P-1006", "Heavy receiver B", {}, cool);

  link("feed.out", "blend.in");
  link("additive.out", "blend.dose", cool);
  link("blend.out", "preheat.in");
  link("preheat.out", "splitA.in", warm);
  link("splitA.a", "heatA.in", warm);
  link("splitA.b", "splitBC.in", warm);
  link("splitBC.a", "heatB.in", warm);
  link("splitBC.b", "heatC.in", warm);
  for (const letter of ["A", "B", "C"]) {
    link(`heat${letter}.out`, `reactor${letter}.in`, warm);
    link(`reactor${letter}.out`, `cool${letter}.in`, warm);
  }
  link("coolA.out", "mergeAB.in", cool);
  link("coolB.out", "mergeAB.dose", cool);
  link("mergeAB.out", "mergeABC.in", cool);
  link("coolC.out", "mergeABC.dose", cool);
  link("mergeABC.out", "finishBlend.in", cool);
  link("conditioningFeed.out", "finishBlend.dose", cool);
  link("finishBlend.out", "finishHeat.in");
  link("finishHeat.out", "columnA.in", warm);
  link("columnA.top", "lightCool.in", cool);
  link("lightCool.out", "lightSplit.in", cool);
  link("lightSplit.a", "lightA.in", cool);
  link("lightSplit.b", "lightB.in", cool);
  link("columnA.bottom", "secondHeat.in", warm);
  link("secondHeat.out", "columnB.in", warm);
  link("columnB.top", "middleCool.in", cool);
  link("middleCool.out", "productBlend.in", cool);
  link("productAdditive.out", "productBlend.dose", cool);
  link("productBlend.out", "middle.in", cool);
  link("columnB.bottom", "thirdHeat.in", warm);
  link("thirdHeat.out", "columnC.in", warm);
  link("columnC.top", "thirdCool.in", cool);
  link("thirdCool.out", "third.in", cool);
  link("columnC.bottom", "heavyCool.in", warm);
  link("heavyCool.out", "heavySplit.in", cool);
  link("heavySplit.a", "heavyA.in", cool);
  link("heavySplit.b", "heavyB.in", cool);
  return {
    id: "parallel-complex",
    title: "Three-train processing plant",
    description:
      "39 assemblies: three parallel reactor trains, effluent recombination, three finishing columns and product blending.",
    operation:
      "Two fresh feeds blend and divide into three equal branches. Each train has its own trim heater, reactor and cooler. Their effluents recombine, receive a finishing blend component, and pass through three successive columns. A separate product blender conditions the second cut before collection. The branches use different illustrative reactor temperatures.",
    equipment,
    connections,
  };
}

function fractionationComplex() {
  const { equipment, connections, add, link } = advancedPlant();
  add("feed", "Feed", "F-1101", "Main recovery feed", {
    flow: 18,
    fractionA: 0.8,
  });
  add(
    "secondary",
    "Feed",
    "F-1102",
    "Secondary recovery feed",
    { flow: 6, fractionA: 0.45 },
    cool,
  );
  add("blendA", "Mixer", "M-1101", "Primary feed blender");
  add(
    "thirdFeed",
    "Feed",
    "F-1103",
    "Trim feed",
    { flow: 4, fractionA: 0.25 },
    cool,
  );
  add("blendB", "Mixer", "M-1102", "Column-feed blender");
  const cuts = ["First", "Second", "Third", "Fourth"];
  for (const [i, letter] of ["A", "B", "C", "D"].entries()) {
    add(
      `heat${letter}`,
      "Heater",
      `H-110${i + 1}`,
      `${cuts[i]} column preheater`,
      { temperature: 380 + i * 30 },
      i ? warm : feed,
    );
    add(
      `column${letter}`,
      "Distillation",
      `D-110${i + 1}`,
      `${cuts[i]} recovery column`,
      { trayCount: 14 - i * 2, distillateFraction: 0.3 + i * 0.05 },
      warm,
    );
    add(
      `cool${letter}`,
      "Cooler",
      `C-110${i + 1}`,
      `${cuts[i]}-cut cooler`,
      {},
      cool,
    );
    add(
      `split${letter}`,
      "Splitter",
      `S-110${i + 1}`,
      `${cuts[i]}-cut distribution`,
      {},
      cool,
    );
    add(
      `${cuts[i].toLowerCase()}A`,
      "Product",
      `P-110${i * 2 + 1}`,
      `${cuts[i]} cut receiver A`,
      {},
      cool,
    );
    add(
      `${cuts[i].toLowerCase()}B`,
      "Product",
      `P-110${i * 2 + 2}`,
      `${cuts[i]} cut receiver B`,
      {},
      cool,
    );
  }
  add(
    "heavyFeed",
    "Feed",
    "F-1104",
    "Heavy-product blend component",
    { flow: 2, fractionA: 0.1 },
    cool,
  );
  add("heavyBlend", "Mixer", "M-1103", "Heavy-product blender", {}, warm);
  add("heavyCool", "Cooler", "C-1105", "Heavy-blend cooler", {}, warm);
  add("heavySplit", "Splitter", "S-1105", "Heavy-blend distribution", {}, cool);
  add("heavyA", "Product", "P-1109", "Heavy blend receiver A", {}, cool);
  add("heavyB", "Product", "P-1110", "Heavy blend receiver B", {}, cool);

  link("feed.out", "blendA.in");
  link("secondary.out", "blendA.dose", cool);
  link("blendA.out", "blendB.in");
  link("thirdFeed.out", "blendB.dose", cool);
  link("blendB.out", "heatA.in");
  for (const [i, letter] of ["A", "B", "C", "D"].entries()) {
    link(`heat${letter}.out`, `column${letter}.in`, warm);
    link(`column${letter}.top`, `cool${letter}.in`, cool);
    link(`cool${letter}.out`, `split${letter}.in`, cool);
    link(`split${letter}.a`, `${cuts[i].toLowerCase()}A.in`, cool);
    link(`split${letter}.b`, `${cuts[i].toLowerCase()}B.in`, cool);
    link(
      `column${letter}.bottom`,
      i < 3 ? `heat${["B", "C", "D"][i]}.in` : "heavyBlend.in",
      warm,
    );
  }
  link("heavyFeed.out", "heavyBlend.dose", cool);
  link("heavyBlend.out", "heavyCool.in", warm);
  link("heavyCool.out", "heavySplit.in", cool);
  link("heavySplit.a", "heavyA.in", cool);
  link("heavySplit.b", "heavyB.in", cool);
  return {
    id: "fractionation-complex",
    title: "Four-column recovery plant",
    description:
      "35 assemblies: four successive recovery columns, staged feed blending, five cooled cuts and ten receivers.",
    operation:
      "Three feed components blend before four columns process successive bottoms streams. Each overhead cut passes through a cooler and distribution manifold to paired receivers. The final heavy cut receives a separate blend component, then cools and divides between two receivers. Paired receivers store the same cut; they do not represent additional separations.",
    equipment,
    connections,
  };
}

export const plantTemplates = [
  integrated(),
  parallel(),
  fractionation(),
  recycleComplex(),
  parallelComplex(),
  fractionationComplex(),
];

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
    unit.params = paramsSchema.parse({ ...unit.params, ...item.params });
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

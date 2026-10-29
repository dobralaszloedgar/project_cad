import { complexSystems, getComplexSystem } from "./complex-systems";
import { columnLayout } from "./column-layout";
import {
  connect,
  flowColors,
  unit,
  worldPort,
  type SystemExample,
} from "./system-geometry";
export { flowColors, equipmentPorts, worldPort } from "./system-geometry";
export type {
  EquipmentInstance,
  ProcessStream,
  SystemExample,
} from "./system-geometry";
import type { Point } from "./operation";
const heating = [
  unit("feed", "Feed", [-4, 0, 0], "F-101"),
  unit("heater", "Heater", [0, 0, 0], "H-101"),
  unit("product", "Product", [4, 0, 0], "P-101", "Product", flowColors.warm),
];
const mixing = [
  unit("feed", "Feed", [-5.6, 0, -1.8], "F-201", "Main feed"),
  unit("dose", "Feed", [-5.6, 0, 1.8], "F-202", "Additive", flowColors.cool),
  unit("mixer", "Mixer", [-1.3, 0, 0], "M-201"),
  unit("cooler", "Cooler", [3, 0, 0], "C-201"),
  unit("product", "Product", [7.2, 0, 0], "P-201", "Blend", flowColors.cool),
];
const reaction = [
  unit("feed", "Feed", [-8, 0, 0], "F-301"),
  unit("heater", "Heater", [-4, 0, 0], "H-301"),
  unit(
    "reactor",
    "PBR",
    [0, 0, 0],
    "R-301",
    "Packed-bed reactor",
    flowColors.warm,
  ),
  unit("cooler", "Cooler", [4, 0, 0], "C-301", "Cooler", flowColors.warm),
  unit("product", "Product", [8, 0, 0], "P-301", "Product", flowColors.cool),
];
const distillation = [
  unit("feed", "Feed", [-5.6, 0, 0], "F-401"),
  unit("heater", "Heater", [-1.5, 0, 0], "H-401"),
  unit(
    "column",
    "Distillation",
    [3.1, 0, 0],
    "D-401",
    "Distillation",
    flowColors.warm,
  ),
  unit(
    "top",
    "Product",
    [7.7, 0, -1.9],
    "P-401",
    "Distillate",
    flowColors.cool,
  ),
  unit("bottom", "Product", [7.7, 0, 1.9], "P-402", "Bottoms", flowColors.warm),
];
const splitting = [
  unit("feed", "Feed", [-4, 0, 0], "F-501"),
  unit("splitter", "Splitter", [0, 0, 0], "S-501"),
  unit("a", "Product", [4.5, 0, -1.6], "P-501", "Branch A"),
  unit("b", "Product", [4.5, 0, 1.6], "P-502", "Branch B"),
];

export const systemExamples: SystemExample[] = [
  ...complexSystems,
  {
    id: "heating",
    title: "Simple heating",
    description:
      "Follow the liquid from the supply tank, through the tube bundle, into the receiver.",
    operation:
      "Liquid travels through the heater tubes while a separate shell-side utility supplies heat. The warmed stream collects in the receiver.",
    equipment: heating,
    streams: [
      connect(
        heating,
        "feed-heater",
        ["feed", "out"],
        ["heater", "in"],
        [
          [-2.25, 0.35, 0.33],
          [-2.25, 1.14, 0.33],
          [-2.25, 1.14, 0],
        ],
      ),
      connect(
        heating,
        "heater-product",
        ["heater", "out"],
        ["product", "in"],
        [
          [2.12, 1.14, 0],
          [2.3, 1.08, 0],
        ],
        flowColors.warm,
      ),
    ],
  },
  {
    id: "mixing",
    title: "Mixing & cooling",
    description:
      "Two feeds meet in a centrifugal mixer, then pass through an air cooler.",
    operation:
      "The main feed and additive enter the rotating bowl. Its stationary pickup sends the blend to the finned tube bank, where two fans move air across the tubes.",
    equipment: mixing,
    streams: [
      connect(
        mixing,
        "main-mixer",
        ["feed", "out"],
        ["mixer", "in"],
        [
          [-3.75, 0.35, -1.47],
          [-3.75, 2.75, -1.47],
          [0.52, 2.75, -1.47],
          [0.52, 2.75, 0],
        ],
      ),
      connect(
        mixing,
        "dose-mixer",
        ["dose", "out"],
        ["mixer", "dose"],
        [
          [-3.5, 0.35, 2.13],
          [-3.5, 1.65, 2.13],
          [0.09, 1.65, 2.13],
          [0.09, 1.65, 0],
        ],
        flowColors.cool,
        0.04,
      ),
      connect(
        mixing,
        "mixer-cooler",
        ["mixer", "out"],
        ["cooler", "in"],
        [
          [-0.57, 3.1, 0],
          [1.1, 3.1, 0],
          [1.1, 3.1, 1.35],
          [1.1, 1.5, 1.35],
          [1.62, 1.5, 1.35],
        ],
      ),
      connect(
        mixing,
        "cooler-product",
        ["cooler", "out"],
        ["product", "in"],
        [
          [4.38, 1.5, 1.35],
          [5.15, 1.5, 1.35],
          [5.15, 1.08, 1.35],
          [5.15, 1.08, 0],
        ],
        flowColors.cool,
      ),
    ],
  },
  {
    id: "reaction",
    title: "Heated reactor train",
    description:
      "Preheat the feed, wet two fixed catalyst beds, then cool and collect the product.",
    operation:
      "The heated feed enters the top distributor, travels down through stationary packing, and exits below the beds. Downstream fans cool the product before collection.",
    equipment: reaction,
    streams: [
      connect(
        reaction,
        "feed-heater",
        ["feed", "out"],
        ["heater", "in"],
        [
          [-6.2, 0.35, 0.33],
          [-6.2, 1.14, 0.33],
          [-6.2, 1.14, 0],
        ],
      ),
      connect(
        reaction,
        "heater-reactor",
        ["heater", "out"],
        ["reactor", "in"],
        [
          [-1.65, 1.14, 0],
          [-1.65, 3.05, 0],
          [-0.99, 3.05, 0],
        ],
        flowColors.warm,
      ),
      connect(
        reaction,
        "reactor-cooler",
        ["reactor", "out"],
        ["cooler", "in"],
        [
          [1.65, 0.48, 0.08],
          [1.65, 0.48, 1.35],
          [1.65, 1.5, 1.35],
          [2.62, 1.5, 1.35],
        ],
        flowColors.warm,
      ),
      connect(
        reaction,
        "cooler-product",
        ["cooler", "out"],
        ["product", "in"],
        [
          [5.38, 1.5, 1.35],
          [6.05, 1.5, 1.35],
          [6.05, 1.08, 1.35],
          [6.05, 1.08, 0],
        ],
        flowColors.cool,
      ),
    ],
  },
  {
    id: "distillation",
    title: "Distillation train",
    description:
      "A preheated feed separates into overhead distillate and a bottoms stream.",
    operation:
      "Vapor rises through the trays as liquid cascades down the downcomers. The overhead condenser supplies reflux and distillate; the reboiler drives boil-up from the sump.",
    equipment: distillation,
    streams: [
      connect(
        distillation,
        "feed-heater",
        ["feed", "out"],
        ["heater", "in"],
        [
          [-3.8, 0.35, 0.33],
          [-3.8, 1.14, 0.33],
          [-3.8, 1.14, 0],
        ],
      ),
      connect(
        distillation,
        "heater-column",
        ["heater", "out"],
        ["column", "in"],
        [
          [0.95, 1.14, 0],
          [0.95, 2.97, 0],
        ],
        flowColors.warm,
      ),
      connect(
        distillation,
        "distillate",
        ["column", "top"],
        ["top", "in"],
        [
          [5.75, 5.06, 0],
          [5.75, 5.06, -1.9],
          [5.75, 1.08, -1.9],
        ],
        flowColors.cool,
        0.05,
      ),
      connect(
        distillation,
        "bottoms",
        ["column", "bottom"],
        ["bottom", "in"],
        [
          [5.65, 0.42, 0.1],
          [5.65, 0.42, 1.9],
          [5.65, 1.08, 1.9],
        ],
        flowColors.warm,
      ),
    ],
  },
  {
    id: "splitting",
    title: "Flow distribution",
    description:
      "One supply feeds a branching manifold and two separate receivers.",
    operation:
      "The manifold divides the incoming liquid between two valved branches. Both streams retain the same composition; the valves remain fixed during this steady-flow illustration.",
    equipment: splitting,
    streams: [
      connect(
        splitting,
        "feed-splitter",
        ["feed", "out"],
        ["splitter", "in"],
        [
          [-2.1, 0.35, 0.33],
          [-2.1, 1.1, 0.33],
          [-2.1, 1.1, 0],
        ],
      ),
      connect(
        splitting,
        "branch-a",
        ["splitter", "a"],
        ["a", "in"],
        [
          [2.2, 1.1, -0.62],
          [2.2, 1.08, -1.6],
        ],
      ),
      connect(
        splitting,
        "branch-b",
        ["splitter", "b"],
        ["b", "in"],
        [
          [2.2, 1.1, 0.62],
          [2.2, 1.08, 1.6],
        ],
      ),
    ],
  },
];

export function getSystem(id: string, trayCount?: number): SystemExample {
  const complex = getComplexSystem(id, trayCount);
  if (complex) return complex;
  const system =
    systemExamples.find((item) => item.id === id) ?? systemExamples[0];
  if (id !== "distillation") return system;
  const layout = columnLayout({ trayCount });
  const equipment = system.equipment.map((item) =>
    item.kind === "Distillation"
      ? { ...item, trayCount: layout.trayCount }
      : item,
  );
  const streams = system.streams.map((stream) => {
    const points = stream.points.map((p) => [...p] as Point);
    if (stream.id === "heater-column") points[2][1] = layout.feedY;
    if (stream.id === "distillate") {
      points[1][1] = layout.distillateY;
      points[2][1] = layout.distillateY;
    }
    points[0] = worldPort(equipment, stream.from);
    points[points.length - 1] = worldPort(equipment, stream.to);
    return { ...stream, points };
  });
  return { ...system, equipment, streams };
}

import type { Kind } from "@/domain/schema";

/** The same illustrative process drives the drawing and the 3D reveal. */
export const storyEquipment: {
  id: string;
  kind: Kind;
  tag: string;
  name: string;
  position: [number, number, number];
  turn?: 0 | 1 | 2 | 3;
  color: string;
}[] = [
  {
    id: "feed",
    kind: "Feed",
    tag: "F-101",
    name: "Feed",
    position: [-7, 0, -5.5],
    color: "#37c6a0",
  },
  {
    id: "mixer",
    kind: "Mixer",
    tag: "M-101",
    name: "Blend",
    position: [-7, 0, 3.7],
    turn: 1,
    color: "#37c6a0",
  },
  {
    id: "heater",
    kind: "Heater",
    tag: "H-101",
    name: "Preheat",
    position: [-4, 0, 3.7],
    turn: 1,
    color: "#e7ad49",
  },
  {
    id: "reactor",
    kind: "PBR",
    tag: "R-101",
    name: "React",
    position: [-3.9, 0, -6],
    color: "#e7ad49",
  },
  {
    id: "cooler",
    kind: "Cooler",
    tag: "C-101",
    name: "Cool",
    position: [-0.8, 0, 3.8],
    turn: 1,
    color: "#3ebfb5",
  },
  {
    id: "column",
    kind: "Distillation",
    tag: "D-101",
    name: "Separate",
    position: [3.1, 0, -6],
    color: "#e7ad49",
  },
  {
    id: "light",
    kind: "Product",
    tag: "P-101",
    name: "Distillate",
    position: [7.5, 0, 3.8],
    turn: 1,
    color: "#37c6a0",
  },
  {
    id: "splitter",
    kind: "Splitter",
    tag: "S-101",
    name: "Recycle",
    position: [4.6, 0, -2.7],
    color: "#e7ad49",
  },
  {
    id: "bottom",
    kind: "Product",
    tag: "P-102",
    name: "Product",
    position: [7.8, 0, -5.9],
    turn: 1,
    color: "#e7ad49",
  },
];

export const storyStreams: {
  id: string;
  from: [string, string];
  to: [string, string];
  color: string;
}[] = [
  {
    id: "feed-blend",
    from: ["feed", "out"],
    to: ["mixer", "in"],
    color: "#a9f4cd",
  },
  {
    id: "blend-heat",
    from: ["mixer", "out"],
    to: ["heater", "in"],
    color: "#a9f4cd",
  },
  {
    id: "heat-react",
    from: ["heater", "out"],
    to: ["reactor", "in"],
    color: "#d8c598",
  },
  {
    id: "react-cool",
    from: ["reactor", "out"],
    to: ["cooler", "in"],
    color: "#d8c598",
  },
  {
    id: "cool-separate",
    from: ["cooler", "out"],
    to: ["column", "in"],
    color: "#a9f4cd",
  },
  {
    id: "distillate",
    from: ["column", "top"],
    to: ["light", "in"],
    color: "#a9f4cd",
  },
  {
    id: "bottoms",
    from: ["column", "bottom"],
    to: ["splitter", "in"],
    color: "#d8c598",
  },
  {
    id: "product",
    from: ["splitter", "a"],
    to: ["bottom", "in"],
    color: "#d8c598",
  },
  {
    id: "recycle",
    from: ["splitter", "b"],
    to: ["mixer", "dose"],
    color: "#a9f4cd",
  },
];

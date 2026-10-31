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
    position: [-11, 0, -2],
    color: "#37c6a0",
  },
  {
    id: "mixer",
    kind: "Mixer",
    tag: "M-101",
    name: "Blend",
    position: [-7.5, 0, -2],
    turn: 1,
    color: "#37c6a0",
  },
  {
    id: "heater",
    kind: "Heater",
    tag: "H-101",
    name: "Preheat",
    position: [-4, 0, -2],
    turn: 1,
    color: "#e7ad49",
  },
  {
    id: "reactor",
    kind: "PBR",
    tag: "R-101",
    name: "React",
    position: [-0.5, 0, -2],
    color: "#e7ad49",
  },
  {
    id: "cooler",
    kind: "Cooler",
    tag: "C-101",
    name: "Cool",
    position: [3, 0, -2],
    turn: 1,
    color: "#3ebfb5",
  },
  {
    id: "column",
    kind: "Distillation",
    tag: "D-101",
    name: "Separate",
    position: [6.5, 0, -2],
    color: "#e7ad49",
  },
  {
    id: "light",
    kind: "Product",
    tag: "P-101",
    name: "Distillate",
    position: [10.5, 0, -5.5],
    turn: 1,
    color: "#37c6a0",
  },
  {
    id: "splitter",
    kind: "Splitter",
    tag: "S-101",
    name: "Recycle",
    position: [6.5, 0, 3],
    color: "#e7ad49",
  },
  {
    id: "bottom",
    kind: "Product",
    tag: "P-102",
    name: "Product",
    position: [10.5, 0, 3],
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
    color: "#b43f44",
  },
  {
    id: "blend-heat",
    from: ["mixer", "out"],
    to: ["heater", "in"],
    color: "#985500",
  },
  {
    id: "heat-react",
    from: ["heater", "out"],
    to: ["reactor", "in"],
    color: "#8f6f00",
  },
  {
    id: "react-cool",
    from: ["reactor", "out"],
    to: ["cooler", "in"],
    color: "#167848",
  },
  {
    id: "cool-separate",
    from: ["cooler", "out"],
    to: ["column", "in"],
    color: "#087b89",
  },
  {
    id: "distillate",
    from: ["column", "top"],
    to: ["light", "in"],
    color: "#345fb4",
  },
  {
    id: "bottoms",
    from: ["column", "bottom"],
    to: ["splitter", "in"],
    color: "#7646a7",
  },
  {
    id: "product",
    from: ["splitter", "a"],
    to: ["bottom", "in"],
    color: "#a13c7d",
  },
  {
    id: "recycle",
    from: ["splitter", "b"],
    to: ["mixer", "dose"],
    color: "#b43f44",
  },
];

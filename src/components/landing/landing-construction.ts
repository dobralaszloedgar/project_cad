import { storyEquipment, storyStreams } from "./landing-process";
import { reveal } from "./landing-motion";

export function unitUnfold(progress: number, index: number) {
  const start = 0.56 + index * 0.012;
  return {
    height: reveal(progress, start, start + 0.17),
    solid: reveal(progress, start + 0.03, start + 0.09),
    drawing: 1 - reveal(progress, start + 0.015, start + 0.095),
  };
}

// The DOM canvas uses 64 CSS pixels per world unit. Its node centers, material
// handles and the Three.js equipment consequently share the same coordinates.
export const CAD_SCALE = 64;
export const CAD_WIDTH = 1792;
export const CAD_HEIGHT = 960;
export const CAD_HEADER = 76;
// Center the actual graph (including labels and overhead routes) in the sheet.
export const CAD_CENTER_Z = -1.75;
export const ROUTE_SAMPLES = 64;

// Interleave placement and connection so the process is built as a connected
// graph, rather than drawing a page of isolated symbols first.
export const constructionSteps = [
  ["unit", "F-101"],
  ["unit", "M-101"],
  ["stream", "feed-blend"],
  ["unit", "H-101"],
  ["stream", "blend-heat"],
  ["unit", "R-101"],
  ["stream", "heat-react"],
  ["unit", "C-101"],
  ["stream", "react-cool"],
  ["unit", "D-101"],
  ["stream", "cool-separate"],
  ["unit", "P-101"],
  ["stream", "distillate"],
  ["unit", "S-101"],
  ["stream", "bottoms"],
  ["unit", "P-102"],
  ["stream", "product"],
  ["stream", "recycle"],
] as const;

export function stepProgress(
  progress: number,
  type: "unit" | "stream",
  id: string,
) {
  const index = constructionSteps.findIndex(
    (step) => step[0] === type && step[1] === id,
  );
  return Math.max(0, Math.min(1, progress * constructionSteps.length - index));
}

export function constructionLabel(progress: number) {
  if (progress >= 0.999) return "9 units connected · Ready to explore";
  const [type, id] =
    constructionSteps[
      Math.min(
        constructionSteps.length - 1,
        Math.floor(progress * constructionSteps.length),
      )
    ];
  if (type === "unit") {
    const unit = storyEquipment.find((item) => item.tag === id)!;
    return `Placing ${unit.tag} · ${unit.name}`;
  }
  const stream = storyStreams.find((item) => item.id === id)!;
  const from = storyEquipment.find((item) => item.id === stream.from[0])!;
  const to = storyEquipment.find((item) => item.id === stream.to[0])!;
  return `Connecting ${from.tag} → ${to.tag}`;
}

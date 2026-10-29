import type { Project } from "../domain/schema";
import { simulate, type Result, type Stream } from "../domain/solver";

export const streamColors = {
  teal: "#7f8e87",
  blue: "#367c6c",
  amber: "#b47b1e",
};

export function compositionColor(stream?: Pick<Stream, "a" | "b">): string {
  if (
    !stream ||
    !Number.isFinite(stream.a + stream.b) ||
    stream.a < 0 ||
    stream.b < 0 ||
    stream.a + stream.b <= 0
  )
    return streamColors.teal;
  // A single hue per binary mixture, from B-rich red to A-rich violet.
  // Quantize numerical solver noise so equal compositions share a color.
  const fraction =
    Math.round((stream.a / (stream.a + stream.b)) * 10000) / 10000;
  return `hsl(${Math.round(fraction * 2800) / 10} 65% 48%)`;
}

export function projectStreamColors(project: Project, result: Result | null) {
  let streams = result?.streams;
  if (!streams) {
    try {
      const preview = simulate(project);
      if (preview.converged) streams = preview.streams;
    } catch {
      // An unfinished flowsheet may still have known feed compositions.
    }
  }
  const compositions: Record<string, Pick<Stream, "a" | "b">> = {};
  for (const edge of project.edges) {
    const source = project.units.find((unit) => unit.id === edge.source);
    if (streams?.[edge.id]) compositions[edge.id] = streams[edge.id];
    else if (source?.kind === "Feed")
      compositions[edge.id] = {
        a: source.params.fractionA,
        b: 1 - source.params.fractionA,
      };
  }
  // Only propagate through operations that preserve composition. Unknown
  // reaction/separation/mixing outputs stay neutral until they can be solved.
  for (let pass = 0; pass < project.units.length; pass++) {
    let changed = false;
    for (const edge of project.edges) {
      if (compositions[edge.id]) continue;
      const source = project.units.find((unit) => unit.id === edge.source);
      if (!source || !["Heater", "Cooler", "Splitter"].includes(source.kind))
        continue;
      const input = project.edges.find((inlet) => inlet.target === source.id);
      if (input && compositions[input.id]) {
        compositions[edge.id] = compositions[input.id];
        changed = true;
      }
    }
    if (!changed) break;
  }
  return Object.fromEntries(
    project.edges.map((edge) => [
      edge.id,
      compositionColor(compositions[edge.id]),
    ]),
  );
}

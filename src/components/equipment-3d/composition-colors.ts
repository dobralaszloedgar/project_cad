import { Color } from "three";
import type { Connection, Project, Unit } from "../../domain/schema";
import { simulate, type Result } from "../../domain/solver";
import {
  componentFlows,
  feedComposition,
} from "../../domain/stream-composition";
import { sampleCatalog, sampleMixtures } from "../../domain/thermo/catalog";
import { defaultThermo } from "../../domain/thermo/registry";

export const UNKNOWN_COMPOSITION_COLOR = "#94a3ab";
const componentColors = [
  "#e53950", // Red + blue make a purple binary mixture.
  "#3569ef",
  "#e5b82e",
  "#12b886",
  "#f08235",
  "#2db7ce",
  "#bf4bc7",
  "#8c6d4f",
] as const;

export type ComponentColor = { id: string; name: string; color: string };
type Composition = Record<string, number>;
type Port = Connection["sourcePort"] | Connection["targetPort"];
export type EquipmentCompositionColors = {
  color: string;
  ports: Partial<Record<Port, string>>;
};
export type PlantCompositionColors = {
  components: ComponentColor[];
  streams: Record<string, string>;
  equipment: Record<string, EquipmentCompositionColors>;
};

/** Palette assignment depends on component identity, never its concentration or
 * catalog selection order. Keep the original order for legacy a/b stream data. */
export function componentPalette(project: Project): ComponentColor[] {
  const settings = project.thermo ?? defaultThermo;
  const chemicals =
    settings.mixture === "catalog"
      ? (settings.catalog?.chemicals ?? [])
      : sampleMixtures[settings.mixture].ids.map((id) => sampleCatalog.get(id));
  const sorted = chemicals.map(({ id }) => id).sort();
  return chemicals.map(({ id, name }) => {
    const index = sorted.indexOf(id);
    return {
      id,
      name: settings.mixture === "demo" ? id : name,
      color:
        componentColors[index] ??
        `#${new Color().setHSL((index * 0.61803398875) % 1, 0.66, 0.48).getHexString()}`,
    };
  });
}

/** A schematic sRGB mixture, weighted by moles (not physical pigment optics).
 * Pure streams retain their swatch; trace impurities change it continuously. */
export function blendColors(
  parts: { color: string; amount: number }[],
): string {
  const total = parts.reduce((sum, part) => sum + part.amount, 0);
  if (
    !Number.isFinite(total) ||
    total <= 0 ||
    parts.some(({ amount }) => !Number.isFinite(amount) || amount < 0)
  )
    return UNKNOWN_COMPOSITION_COLOR;
  const rgb = [0, 0, 0];
  for (const { color, amount } of parts) {
    const value = Number.parseInt(color.slice(1), 16);
    for (let i = 0; i < 3; i++)
      rgb[i] += (((value >> (16 - i * 8)) & 255) * amount) / total;
  }
  return `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

export function compositionColor(
  values: Composition | undefined,
  palette: ComponentColor[],
): string {
  if (
    !values ||
    Object.keys(values).some((id) => !palette.some((c) => c.id === id))
  )
    return UNKNOWN_COMPOSITION_COLOR;
  return blendColors(
    palette.map(({ id, color }) => ({ color, amount: values[id] ?? 0 })),
  );
}

function feedValues(unit: Unit, ids: string[]): Composition | undefined {
  try {
    return Object.fromEntries(
      Object.entries(feedComposition(unit.params, ids)).map(
        ([id, fraction]) => [id, fraction * unit.params.flow],
      ),
    );
  } catch {
    return undefined;
  }
}

// Reusing previews avoids running the solver again for 2D drags or name edits.
const previews = new Map<string, Result["streams"] | undefined>();
const appearances = new Map<string, PlantCompositionColors>();
function previewStreams(project: Project) {
  const key = JSON.stringify([
    project.thermo,
    project.units.map(({ id, kind, params }) => [id, kind, params]),
    project.edges.map(({ id, source, target, sourcePort, targetPort }) => [
      id,
      source,
      target,
      sourcePort,
      targetPort,
    ]),
  ]);
  if (previews.has(key)) return previews.get(key);
  let streams: Result["streams"] | undefined;
  try {
    const result = simulate(project);
    if (result.converged) streams = result.streams;
  } catch {
    // An unfinished graph still has known feeds and composition-preserving paths.
  }
  if (previews.size >= 8) previews.delete(previews.keys().next().value!);
  previews.set(key, streams);
  return streams;
}

export function projectCompositionColors(
  project: Project,
  result: Result | null = null,
): PlantCompositionColors {
  const components = componentPalette(project);
  const ids = components.map(({ id }) => id);
  const solved = result
    ? result.converged
      ? result.streams
      : undefined
    : previewStreams(project);
  const values = new Map<string, Composition>();
  const feeds = new Map(
    project.units
      .filter((unit) => unit.kind === "Feed")
      .map((unit) => [unit.id, feedValues(unit, ids)]),
  );
  for (const edge of project.edges) {
    if (solved?.[edge.id]) {
      try {
        values.set(edge.id, componentFlows(solved[edge.id], ids));
      } catch {
        // Unknown/removed components must not appear to be a pure known chemical.
      }
    } else {
      const feed = feeds.get(edge.source);
      if (feed) values.set(edge.id, feed);
    }
  }
  // Propagate only where composition is known to be preserved. Never invent a
  // separation or reaction result when the solver has failed or not converged.
  for (let pass = 0; pass < project.units.length; pass++) {
    let changed = false;
    for (const unit of project.units) {
      if (!["Heater", "Cooler", "Splitter"].includes(unit.kind)) continue;
      const incoming = project.edges.filter((edge) => edge.target === unit.id);
      if (incoming.length !== 1) continue;
      const input = values.get(incoming[0].id);
      if (!input) continue;
      for (const edge of project.edges.filter(
        (edge) => edge.source === unit.id,
      )) {
        if (values.has(edge.id) || solved?.[edge.id]) continue;
        const fraction =
          unit.kind === "Splitter"
            ? edge.sourcePort === "out2"
              ? unit.params.recycleFraction
              : 1 - unit.params.recycleFraction
            : 1;
        values.set(
          edge.id,
          Object.fromEntries(
            Object.entries(input).map(([id, value]) => [id, value * fraction]),
          ),
        );
        changed = true;
      }
    }
    if (!changed) break;
  }
  const streams = Object.fromEntries(
    project.edges.map((edge) => [
      edge.id,
      compositionColor(values.get(edge.id), components),
    ]),
  );
  const equipment = Object.fromEntries(
    project.units.map((unit) => {
      const ports: EquipmentCompositionColors["ports"] = {};
      for (const port of ["in", "in2", "out", "out2"] as const) {
        const incoming = port === "in" || port === "in2";
        const edges = project.edges.filter((edge) =>
          incoming
            ? edge.target === unit.id && edge.targetPort === port
            : edge.source === unit.id && edge.sourcePort === port,
        );
        if (!edges.length) continue;
        // Multiple connections can share a mixer inlet. Mix component flows,
        // rather than averaging stream colors and losing the flow ratios.
        const combined = edges.every((edge) => values.has(edge.id))
          ? Object.fromEntries(
              ids.map((id) => [
                id,
                edges.reduce(
                  (sum, edge) => sum + (values.get(edge.id)![id] ?? 0),
                  0,
                ),
              ]),
            )
          : undefined;
        ports[port] = compositionColor(combined, components);
      }
      const color =
        unit.kind === "Feed"
          ? compositionColor(feeds.get(unit.id), components)
          : unit.kind === "Mixer"
            ? (ports.out ?? UNKNOWN_COMPOSITION_COLOR)
            : (ports.in ?? ports.out ?? UNKNOWN_COMPOSITION_COLOR);
      return [unit.id, { color, ports }];
    }),
  );
  const appearance = { components, streams, equipment };
  const key = JSON.stringify(appearance);
  const previous = appearances.get(key);
  if (previous) return previous;
  if (appearances.size >= 8)
    appearances.delete(appearances.keys().next().value!);
  appearances.set(key, appearance);
  return appearance;
}

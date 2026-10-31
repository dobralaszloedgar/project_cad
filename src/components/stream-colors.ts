import type { Project } from "../domain/schema";
import { simulate, type Result, type Stream } from "../domain/solver";

export const STREAM_COLOR_LABELS = [
  "Red",
  "Orange",
  "Yellow",
  "Green",
  "Cyan",
  "Blue",
  "Violet",
  "Pink",
] as const;
export const STREAM_COLOR_COUNT = STREAM_COLOR_LABELS.length;

function signature(stream?: Pick<Stream, "a" | "b" | "components">) {
  if (!stream) return null;
  const values = stream.components ?? { a: stream.a, b: stream.b };
  const total = Object.values(values).reduce((sum, n) => sum + n, 0);
  if (
    !(total > 0) ||
    Object.values(values).some((n) => !Number.isFinite(n) || n < 0)
  )
    return null;
  return Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, value]) => value > 0)
    .map(([id, value]) => `${id}:${(value / total).toFixed(6)}`)
    .join("|");
}

function hashColor(key: string) {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % STREAM_COLOR_COUNT;
}

/** Share colors across equal compositions and composition-preserving units. */
export function streamColorIndices(
  project: Project,
  result: Result | null = null,
) {
  let streams = result?.streams;
  if (!streams) {
    try {
      const preview = simulate(project);
      if (preview.converged) streams = preview.streams;
    } catch {
      // Unfinished flowsheets still have feed compositions and connected groups.
    }
  }
  const parent = new Map(project.edges.map((edge) => [edge.id, edge.id]));
  const root = (id: string): string => {
    const next = parent.get(id)!;
    if (next === id) return id;
    const resolved = root(next);
    parent.set(id, resolved);
    return resolved;
  };
  for (const unit of project.units) {
    if (!["Heater", "Cooler", "Splitter"].includes(unit.kind)) continue;
    const incoming = project.edges.filter((edge) => edge.target === unit.id);
    if (incoming.length !== 1) continue;
    for (const edge of project.edges.filter((edge) => edge.source === unit.id))
      parent.set(root(edge.id), root(incoming[0].id));
  }
  const groupSignature = new Map<string, string>();
  for (const edge of project.edges) {
    const source = project.units.find((unit) => unit.id === edge.source);
    const known =
      signature(streams?.[edge.id]) ??
      (source?.kind === "Feed"
        ? signature({
            components: source.params.composition,
            a: source.params.fractionA,
            b: 1 - source.params.fractionA,
          })
        : null);
    if (known) groupSignature.set(root(edge.id), known);
  }
  const groups = new Map<string, number>();
  const counts = Array<number>(STREAM_COLOR_COUNT).fill(0);
  const colors = new Map<string, number>();
  for (const edge of project.edges) {
    const group = root(edge.id);
    const key = groupSignature.has(group)
      ? `composition:${groupSignature.get(group)}`
      : `unknown:${group}`;
    let color = groups.get(key);
    if (color === undefined) {
      const start = hashColor(key);
      color = start;
      for (let offset = 1; offset < STREAM_COLOR_COUNT; offset++) {
        const candidate = (start + offset) % STREAM_COLOR_COUNT;
        if (counts[candidate] < counts[color]) color = candidate;
      }
      counts[color]++;
      groups.set(key, color);
    }
    colors.set(edge.id, edge.colorIndex ?? color);
  }
  return colors;
}

export function streamColor(index: number) {
  return `var(--stream-rainbow-${index})`;
}

export function projectStreamColors(project: Project, result: Result | null) {
  return Object.fromEntries(
    [...streamColorIndices(project, result)].map(([id, index]) => [
      id,
      streamColor(index),
    ]),
  );
}

import {
  type Project,
  type Unit,
  type Connection,
  projectSchema,
  validateGraph,
} from "./schema";
import { availableStreamName } from "./stream-names";

export type SelectionCopy = { units: Unit[]; edges: Connection[] };

export function copySelection(
  project: Project,
  selection: string[],
): SelectionCopy {
  const ids = new Set(selection);
  return structuredClone({
    units: project.units.filter((unit) => ids.has(unit.id)),
    edges: project.edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    ),
  });
}

export function deleteSelection(
  project: Project,
  selection: string[],
): Project {
  const ids = new Set(selection);
  return {
    ...project,
    units: project.units.filter((unit) => !ids.has(unit.id)),
    edges: project.edges.filter(
      (edge) =>
        !ids.has(edge.id) && !ids.has(edge.source) && !ids.has(edge.target),
    ),
  };
}

export function pasteSelection(
  project: Project,
  copy: SelectionCopy,
  offset = 40,
) {
  const ids = new Map(
    copy.units.map((unit) => [
      unit.id,
      `${unit.kind}-${crypto.randomUUID().slice(0, 8)}`,
    ]),
  );
  const units = copy.units.map((unit) => ({
    ...structuredClone(unit),
    id: ids.get(unit.id)!,
    position: { x: unit.position.x + offset, y: unit.position.y + offset },
  }));
  const edges = [...project.edges];
  for (const edge of copy.edges)
    edges.push({
      ...structuredClone(edge),
      id: crypto.randomUUID(),
      name: availableStreamName(edges),
      source: ids.get(edge.source)!,
      target: ids.get(edge.target)!,
    });
  const next = projectSchema.parse({
    ...project,
    units: [...project.units, ...units],
    edges,
  });
  const errors = validateGraph(next);
  if (errors.length) throw new Error(errors[0]);
  return { project: next, selection: units.map((unit) => unit.id) };
}

import type { Project } from "./schema";
import { columnDiagramLayout } from "./column-geometry";

type Viewport = { width: number; height: number };
const columnGap = 240;
const rowGap = 260;

/** Stable process order, with recycle edges excluded only from the layout ranking. */
function processOrder(project: Project): string[] {
  const ids = new Set(project.units.map((unit) => unit.id));
  const outgoing = new Map(
    project.units.map((unit) => [unit.id, [] as string[]]),
  );
  for (const edge of project.edges) {
    if (ids.has(edge.source) && ids.has(edge.target))
      outgoing.get(edge.source)!.push(edge.target);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const forward = new Map(
    project.units.map((unit) => [unit.id, [] as string[]]),
  );
  function visit(id: string) {
    if (visited.has(id)) return;
    visiting.add(id);
    for (const target of outgoing.get(id)!) {
      if (visiting.has(target)) continue;
      forward.get(id)!.push(target);
      visit(target);
    }
    visiting.delete(id);
    visited.add(id);
  }
  // Start at feeds so that an arbitrary array order cannot reverse a recycle.
  for (const unit of [
    ...project.units.filter((unit) => unit.kind === "Feed"),
    ...project.units,
  ])
    visit(unit.id);
  const indegree = new Map(project.units.map((unit) => [unit.id, 0]));
  for (const targets of forward.values())
    for (const target of targets)
      indegree.set(target, indegree.get(target)! + 1);
  const order: string[] = [];
  const remaining = new Set(ids);
  while (remaining.size) {
    const next = project.units.find(
      (unit) => remaining.has(unit.id) && indegree.get(unit.id) === 0,
    )!;
    order.push(next.id);
    remaining.delete(next.id);
    for (const target of forward.get(next.id)!)
      indegree.set(target, indegree.get(target)! - 1);
  }
  return order;
}

/** Fit a process into rows sized for the actual canvas, without changing its graph. */
export function arrangeFlowsheet(
  project: Project,
  viewport: Viewport = { width: 1440, height: 900 },
): Project {
  if (!project.units.length) return project;
  const width = Math.max(
    240,
    Number.isFinite(viewport.width) ? viewport.width - 100 : 1340,
  );
  const height = Math.max(
    240,
    Number.isFinite(viewport.height) ? viewport.height - 160 : 740,
  );
  const order = processOrder(project);
  const unitHeights = new Map(
    project.units.map((unit) => [
      unit.id,
      unit.kind === "Distillation"
        ? columnDiagramLayout(unit.params.trayCount).height
        : 128,
    ]),
  );
  const rowHeights = (columns: number) =>
    Array.from({ length: Math.ceil(order.length / columns) }, (_, row) =>
      Math.max(
        ...order
          .slice(row * columns, (row + 1) * columns)
          .map((id) => unitHeights.get(id)!),
      ),
    );
  let columns = order.length;
  if (order.length > 6 || (columns - 1) * columnGap + 192 > width / 0.8) {
    let best = -Infinity;
    // Taller columns should add row clearance, not force the entire flowsheet
    // into an excessively wide row just to improve its bounding-box ratio.
    const maxColumns = Math.max(
      1,
      Math.floor((width / 0.6 - 192) / columnGap) + 1,
    );
    for (let count = 1; count <= Math.min(order.length, maxColumns); count++) {
      const rows = Math.ceil(order.length / count);
      const scale = Math.min(
        width / ((count - 1) * columnGap + 192),
        height /
          (rowHeights(count).reduce(
            (sum, h) => sum + Math.max(rowGap, h + 96),
            0,
          ) -
            64),
      );
      // Prefer equally readable layouts with fewer empty slots.
      const score = scale - (rows * count - order.length) * 0.001;
      if (score > best) {
        best = score;
        columns = count;
      }
    }
  }
  let nextY = 60;
  const rowPositions = rowHeights(columns).map((h) => {
    const y = nextY;
    nextY += Math.max(rowGap, h + 96);
    return y;
  });
  const positions = new Map(
    order.map((id, index) => [
      id,
      {
        x: 40 + (index % columns) * columnGap,
        y: rowPositions[Math.floor(index / columns)],
      },
    ]),
  );
  return {
    ...project,
    units: project.units.map((unit) => ({
      ...unit,
      position: positions.get(unit.id)!,
    })),
  };
}

// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

export const mixerInlets = ["in", "in2", "in3", "in4"] as const;
export const splitterOutlets = ["out", "out2", "out3", "out4"] as const;

export function normalizeBranchCount(count = 2) {
  return Number.isFinite(count)
    ? Math.max(2, Math.min(4, Math.round(count)))
    : 2;
}

/** Saved counts reserve spare fittings; connected streams always keep theirs. */
export function junctionBranchCount(
  unit: {
    kind: string;
    params: { branchCount?: number; splitFractions?: number[] };
  },
  connected: readonly string[] = [],
) {
  const branches = unit.kind === "Mixer" ? mixerInlets : splitterOutlets;
  return normalizeBranchCount(
    Math.max(
      unit.params.branchCount ?? 2,
      ...branches.map((port, index) =>
        connected.includes(port) ||
        (unit.kind === "Splitter" &&
          (unit.params.splitFractions?.[index] ?? 0) > 0)
          ? index + 1
          : 0,
      ),
    ),
  );
}

export function connectedUnitPorts(
  unit: { id: string },
  edges: readonly {
    source: string;
    target: string;
    sourcePort: string;
    targetPort: string;
  }[],
) {
  return edges.flatMap((edge) => [
    ...(edge.source === unit.id ? [edge.sourcePort] : []),
    ...(edge.target === unit.id ? [edge.targetPort] : []),
  ]);
}

export function portIndex(port: string) {
  return Number(port.match(/[2-4]$/)?.[0] ?? 1) - 1;
}

/** Older mixers allowed several streams on the same inlet. Preserve every
 * stream and already distinct port, assigning duplicates to unused fittings. */
export function separateMixerInlets<
  T extends {
    units: { id: string; kind: string }[];
    edges: { target: string; targetPort: string }[];
  },
>(project: T): T {
  const replacements = new Map<T["edges"][number], string>();
  for (const unit of project.units) {
    if (unit.kind !== "Mixer") continue;
    const incoming = project.edges.filter((edge) => edge.target === unit.id);
    const reserved = new Set(incoming.map((edge) => edge.targetPort));
    const used = new Set<string>();
    for (const edge of incoming) {
      if (used.has(edge.targetPort)) {
        const free = mixerInlets.find((port) => !reserved.has(port));
        if (free) {
          replacements.set(edge, free);
          reserved.add(free);
        }
      }
      used.add(edge.targetPort);
    }
  }
  return replacements.size
    ? {
        ...project,
        edges: project.edges.map((edge) =>
          replacements.has(edge)
            ? { ...edge, targetPort: replacements.get(edge)! }
            : edge,
        ),
      }
    : project;
}

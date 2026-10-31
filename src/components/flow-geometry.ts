import { getSmoothStepPath, Position } from "@xyflow/react";
import type { Connection, Kind, Unit } from "@/domain/schema";

export function equipmentPort(kind: Kind, output: boolean, index: number) {
  let x = output ? 120 : 8,
    y = 64;
  let position = output ? Position.Right : Position.Left;
  if (kind === "Mixer" && !output) y = index ? 88 : 40;
  if (kind === "Splitter" && output) y = index ? 88 : 40;
  if (kind === "PBR" || (kind === "Distillation" && output)) {
    const bottom = kind === "PBR" ? output : index > 0;
    x = 64;
    y = bottom ? 120 : 8;
    position = bottom ? Position.Bottom : Position.Top;
  }
  return { x, y, position };
}

export function streamPath(geometry: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  sourceHandleId?: string | null;
  targetHandleId?: string | null;
}) {
  const { sourceX, sourceY, targetX, targetY } = geometry;
  if (
    geometry.sourceHandleId === "out2" &&
    geometry.targetHandleId === "in2" &&
    geometry.sourcePosition === Position.Right &&
    geometry.targetPosition === Position.Left
  ) {
    const y = Math.max(sourceY, targetY) + 115;
    return `M ${sourceX} ${sourceY} H ${sourceX + 24} V ${y} H ${targetX - 24} V ${targetY} H ${targetX}`;
  }
  return getSmoothStepPath({
    ...geometry,
    // Leave room for the equipment name below bottom-facing nozzles.
    offset:
      geometry.sourcePosition === Position.Bottom ||
      geometry.targetPosition === Position.Bottom
        ? 56
        : 20,
    borderRadius: 2,
  })[0];
}

export type Point3 = [number, number, number];

export const plantPosition = (unit: Unit): Point3 => [
  unit.position.x / 100,
  0,
  unit.position.y / 100,
];

export function plantHeight(kind: Kind) {
  return kind === "Distillation" ? 2.7 : kind === "PBR" ? 2.1 : 1.05;
}

// The 3D sketch uses the same material-port identities as the flowsheet.
// Positions are illustrative, independent of process or mechanical sizing.
export function plantPort(
  unit: Unit,
  port: Connection["sourcePort"] | Connection["targetPort"],
): {
  point: Point3;
  direction: Point3;
} {
  const output = port === "out" || port === "out2";
  const point = plantPosition(unit);
  const local: Point3 = [output ? 0.7 : -0.7, 0.7, 0];
  let direction: Point3 = [output ? 1 : -1, 0, 0];
  if (unit.kind === "Mixer" && !output)
    local[2] = port === "in2" ? 0.34 : -0.34;
  if (unit.kind === "Splitter" && output)
    local[2] = port === "out2" ? 0.34 : -0.34;
  if (unit.kind === "PBR") {
    local[0] = 0;
    local[1] = output ? 0.25 : plantHeight(unit.kind);
    direction = [0, output ? -1 : 1, 0];
  }
  if (unit.kind === "Distillation") {
    local[1] = 1.3;
    if (output) {
      local[0] = 0;
      local[1] = port === "out2" ? 0.25 : plantHeight(unit.kind);
      direction = [0, port === "out2" ? -1 : 1, 0];
    }
  }
  return {
    point: point.map((value, axis) => value + local[axis]) as Point3,
    direction,
  };
}

export function plantStreamPath(
  source: Unit,
  target: Unit,
  edge: Pick<Connection, "sourcePort" | "targetPort">,
): Point3[] {
  const from = plantPort(source, edge.sourcePort);
  const to = plantPort(target, edge.targetPort);
  const extend = (port: ReturnType<typeof plantPort>): Point3 =>
    port.point.map(
      (value, axis) => value + 0.18 * port.direction[axis],
    ) as Point3;
  const a = extend(from);
  const b = extend(to);
  const routeHeight = Math.max(a[1], b[1], 0.7);
  const midX = (a[0] + b[0]) / 2;
  const bends: Point3[] =
    edge.targetPort === "in2"
      ? [
          [a[0], routeHeight, Math.max(a[2], b[2]) + 1],
          [b[0], routeHeight, Math.max(a[2], b[2]) + 1],
        ]
      : [
          [midX, routeHeight, a[2]],
          [midX, routeHeight, b[2]],
        ];
  const path: Point3[] = [
    from.point,
    a,
    [a[0], routeHeight, a[2]],
    ...bends,
    [b[0], routeHeight, b[2]],
    b,
    to.point,
  ];
  return path.filter(
    (point, index) =>
      index === 0 ||
      point.some(
        (value, axis) => Math.abs(value - path[index - 1][axis]) > 1e-9,
      ),
  );
}

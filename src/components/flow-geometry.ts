import { getSmoothStepPath, Position } from "@xyflow/react";
import type { Kind } from "@/domain/schema";

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
  if (geometry.sourceHandleId === "out2" && geometry.targetHandleId === "in2") {
    const y = Math.max(sourceY, targetY) + 115;
    return `M ${sourceX} ${sourceY} H ${sourceX + 24} V ${y} H ${targetX - 24} V ${targetY} H ${targetX}`;
  }
  return getSmoothStepPath({ ...geometry, borderRadius: 2 })[0];
}

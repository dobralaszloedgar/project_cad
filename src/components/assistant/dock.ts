export type DockCorner =
  "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type DockPoint = { x: number; y: number };
export type CanvasBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export const dockCorners: DockCorner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];
export const dockSize = 44;

export function dockPoint(bounds: CanvasBounds, corner: DockCorner): DockPoint {
  return {
    x: corner.endsWith("left")
      ? bounds.left + 20
      : Math.max(bounds.left + 20, bounds.right - 64),
    y: corner.startsWith("top")
      ? bounds.top + 20
      : Math.max(bounds.top + 20, bounds.bottom - 64),
  };
}

export function dockPanel(bounds: CanvasBounds, corner: DockCorner) {
  const point = dockPoint(bounds, corner);
  const width = Math.max(0, Math.min(840, bounds.right - bounds.left - 40));
  const height = Math.max(0, Math.min(720, bounds.bottom - bounds.top - 40));
  return {
    width,
    height,
    left: corner.endsWith("left") ? point.x : point.x + dockSize - width,
    top: corner.startsWith("top") ? point.y : point.y + dockSize - height,
  };
}

export function nearestDock(
  bounds: CanvasBounds,
  point: DockPoint,
  velocity: DockPoint = { x: 0, y: 0 },
) {
  const projected = {
    x: point.x + velocity.x * 220,
    y: point.y + velocity.y * 220,
  };
  return dockCorners.reduce((best, corner) => {
    const candidate = dockPoint(bounds, corner),
      previous = dockPoint(bounds, best);
    return Math.hypot(candidate.x - projected.x, candidate.y - projected.y) <
      Math.hypot(previous.x - projected.x, previous.y - projected.y)
      ? corner
      : best;
  }, "bottom-right");
}

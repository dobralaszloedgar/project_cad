// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { dockSize, type DockCorner, type DockPoint } from "./dock";

export const morphProperties = [
  "width",
  "height",
  "radius",
  "docking",
  "offset",
] as const;
type Property = (typeof morphProperties)[number];
export type MorphTargets = Record<Property, number>;
export type MorphSprings = Record<
  Property,
  { value: number; velocity: number }
>;
export type MorphPanel = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function morphTargets(
  panel: MorphPanel,
  mode: "bubble" | "activity" | "panel",
  activityWidth: number,
): MorphTargets {
  return {
    width:
      mode === "panel"
        ? panel.width
        : mode === "activity"
          ? activityWidth
          : dockSize,
    height:
      mode === "panel" ? panel.height : mode === "activity" ? 48 : dockSize,
    radius: mode === "panel" ? 20 : mode === "activity" ? 24 : 14,
    docking: mode === "panel" ? 1 : 0,
    offset: mode === "activity" ? -2 : 0,
  };
}

export function createMorphSprings(targets: MorphTargets): MorphSprings {
  return Object.fromEntries(
    morphProperties.map((key) => [key, { value: targets[key], velocity: 0 }]),
  ) as MorphSprings;
}

export function settleMorph(springs: MorphSprings, targets: MorphTargets) {
  for (const key of morphProperties)
    springs[key] = { value: targets[key], velocity: 0 };
}

export function morphSettled(springs: MorphSprings, targets: MorphTargets) {
  return morphProperties.every(
    (key) =>
      Math.abs(springs[key].value - targets[key]) < 0.1 &&
      Math.abs(springs[key].velocity) < 0.5,
  );
}

/** Exact critically damped integration, shared by live motion and authored capture. */
export function advanceMorph(
  springs: MorphSprings,
  targets: MorphTargets,
  dt: number,
) {
  const frequency = 30,
    decay = Math.exp(-frequency * dt);
  for (const key of morphProperties) {
    const spring = springs[key],
      distance = spring.value - targets[key];
    const c = spring.velocity + frequency * distance;
    spring.value = targets[key] + (distance + c * dt) * decay;
    spring.velocity = (spring.velocity - frequency * c * dt) * decay;
  }
}

export function morphGeometry(
  springs: MorphSprings,
  panel: MorphPanel,
  point: DockPoint,
  corner: DockCorner,
) {
  const w = Math.max(dockSize, springs.width.value),
    h = Math.max(dockSize, springs.height.value);
  const r = Math.min(springs.radius.value, w / 2, h / 2);
  const x = corner.endsWith("left") ? 0 : dockSize - w;
  const y = corner.startsWith("top")
    ? springs.offset.value
    : dockSize - h - springs.offset.value;
  const sx = w / panel.width,
    sy = h / panel.height;
  const docking = Math.min(1, Math.max(0, springs.docking.value));
  const insetX = Math.min(8, (w - dockSize) / 2),
    insetY = Math.min(4, (h - dockSize) / 2);
  const cx =
    (corner.endsWith("left") ? w - dockSize - insetX : -insetX) * docking;
  const cy =
    (corner.startsWith("top") ? insetY : dockSize - h + insetY) * docking;
  return {
    width: w,
    height: h,
    left: point.x + x,
    top: point.y + y,
    surfaceTransform: `translate3d(${x}px,${y}px,0) scale(${sx},${sy})`,
    surfaceRadius: `${r / sx}px / ${r / sy}px`,
    controlTransform: `translate3d(${cx}px,${cy}px,0)`,
    clipPath: `inset(${Math.max(0, point.y + y - panel.top)}px ${Math.max(0, panel.left + panel.width - point.x - x - w)}px ${Math.max(0, panel.top + panel.height - point.y - y - h)}px ${Math.max(0, point.x + x - panel.left)}px round ${r}px)`,
  };
}

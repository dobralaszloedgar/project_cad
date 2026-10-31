"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { dockSize, type DockCorner, type DockPoint } from "./dock";

const properties = ["width", "height", "radius", "docking", "offset"] as const;
type Property = (typeof properties)[number];
type Spring = { value: number; velocity: number };
type Options = {
  surface: RefObject<HTMLDivElement | null>;
  content: RefObject<HTMLElement | null>;
  control: RefObject<HTMLDivElement | null>;
  activity: RefObject<HTMLDivElement | null>;
  point: DockPoint;
  panel: { left: number; top: number; width: number; height: number };
  corner: DockCorner;
  mode: "bubble" | "activity" | "panel";
  activityWidth: number;
  ready: boolean;
  immediate: boolean;
};

export function useAssistantMorph({
  surface: surfaceRef,
  content: contentRef,
  control: controlRef,
  activity: activityRef,
  point,
  panel,
  corner,
  mode,
  activityWidth,
  ready,
  immediate,
}: Options) {
  const state = useRef<Record<Property, Spring> | null>(null);
  const width =
    mode === "panel"
      ? panel.width
      : mode === "activity"
        ? activityWidth
        : dockSize;
  const height =
    mode === "panel" ? panel.height : mode === "activity" ? 48 : dockSize;
  const radius = mode === "panel" ? 20 : mode === "activity" ? 24 : 14;

  useLayoutEffect(() => {
    const skin = surfaceRef.current,
      text = contentRef.current;
    if (!ready || !skin || !text || !panel.width || !panel.height) return;
    const targets = {
      width,
      height,
      radius,
      docking: mode === "panel" ? 1 : 0,
      offset: mode === "activity" ? -2 : 0,
    };
    const first = !state.current;
    const springs = (state.current ??= Object.fromEntries(
      properties.map((key) => [key, { value: targets[key], velocity: 0 }]),
    ) as Record<Property, Spring>);
    const settled = () =>
      properties.every(
        (key) =>
          Math.abs(springs[key].value - targets[key]) < 0.1 &&
          Math.abs(springs[key].velocity) < 0.5,
      );
    const finish = () => {
      for (const key of properties)
        springs[key] = { value: targets[key], velocity: 0 };
    };
    const paint = () => {
      const w = Math.max(dockSize, springs.width.value),
        h = Math.max(dockSize, springs.height.value);
      const r = Math.min(springs.radius.value, w / 2, h / 2);
      const x = corner.endsWith("left") ? 0 : dockSize - w;
      const y = corner.startsWith("top")
        ? springs.offset.value
        : dockSize - h - springs.offset.value;
      const sx = w / panel.width,
        sy = h / panel.height;
      skin.style.transform = `translate3d(${x}px,${y}px,0) scale(${sx},${sy})`;
      // Keep the visible corners round while scaling only the empty surface.
      skin.style.borderRadius = `${r / sx}px / ${r / sy}px`;
      const docking = Math.min(1, Math.max(0, springs.docking.value));
      const insetX = Math.min(8, (w - dockSize) / 2);
      const insetY = Math.min(4, (h - dockSize) / 2);
      const cx =
        (corner.endsWith("left") ? w - dockSize - insetX : -insetX) * docking;
      const cy =
        (corner.startsWith("top") ? insetY : dockSize - h + insetY) * docking;
      if (controlRef.current)
        controlRef.current.style.transform = `translate3d(${cx}px,${cy}px,0)`;
      text.style.clipPath = `inset(${Math.max(0, point.y + y - panel.top)}px ${Math.max(0, panel.left + panel.width - point.x - x - w)}px ${Math.max(0, panel.top + panel.height - point.y - y - h)}px ${Math.max(0, point.x + x - panel.left)}px round ${r}px)`;
      if (mode === "activity" && activityRef.current) {
        activityRef.current.style.width = `${w}px`;
        activityRef.current.style.left = `${point.x + x}px`;
        activityRef.current.style.top = `${point.y + y}px`;
      }
    };
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    skin.dataset.neutralizing = "false";
    if (first || immediate || reducedMotion.matches || settled()) {
      finish();
      skin.dataset.animating = "false";
      paint();
      return;
    }
    let frame = 0,
      cancelled = false,
      previous = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.064);
      previous = now;
      const frequency = 30,
        decay = Math.exp(-frequency * dt);
      // Integrate a critically damped spring without resetting reversal velocity.
      for (const key of properties) {
        const spring = springs[key],
          distance = spring.value - targets[key];
        const c = spring.velocity + frequency * distance;
        spring.value = targets[key] + (distance + c * dt) * decay;
        spring.velocity = (spring.velocity - frequency * c * dt) * decay;
      }
      const done = reducedMotion.matches || settled();
      if (done) finish();
      paint();
      skin.dataset.animating = String(!done);
      if (!done) frame = requestAnimationFrame(tick);
    };
    skin.dataset.animating = "true";
    paint();
    const begin = () => {
      if (cancelled) return;
      const color = skin
        .getAnimations()
        .find(
          (animation) =>
            animation instanceof CSSTransition &&
            animation.transitionProperty === "background-color" &&
            animation.playState !== "finished",
        );
      if (color && !reducedMotion.matches) {
        skin.dataset.neutralizing = "true";
        void color.finished.then(begin, begin);
      } else {
        skin.dataset.neutralizing = "false";
        previous = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    // Turn neutral before expanding; restore the bubble color after shrinking.
    if (
      mode !== "bubble" &&
      Math.abs(springs.width.value - dockSize) < 0.1 &&
      Math.abs(springs.height.value - dockSize) < 0.1
    )
      begin();
    else frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [
    width,
    height,
    radius,
    mode,
    ready,
    immediate,
    corner,
    point.x,
    point.y,
    panel.width,
    panel.height,
    panel.left,
    panel.top,
    surfaceRef,
    contentRef,
    controlRef,
    activityRef,
  ]);
}

// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { dockSize, type DockCorner, type DockPoint } from "./dock";
import {
  advanceMorph,
  createMorphSprings,
  morphGeometry,
  morphSettled,
  morphTargets,
  settleMorph,
  type MorphSprings,
} from "./assistant-morph-motion";
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
  const state = useRef<MorphSprings | null>(null);
  const {
    left: panelLeft,
    top: panelTop,
    width: panelWidth,
    height: panelHeight,
  } = panel;
  const { x: pointX, y: pointY } = point;
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
    const panel = {
      left: panelLeft,
      top: panelTop,
      width: panelWidth,
      height: panelHeight,
    };
    const point = { x: pointX, y: pointY };
    const skin = surfaceRef.current,
      text = contentRef.current;
    if (!ready || !skin || !text || !panel.width || !panel.height) return;
    const targets = morphTargets(panel, mode, activityWidth);
    const first = !state.current;
    const springs = (state.current ??= createMorphSprings(targets));
    const settled = () => morphSettled(springs, targets);
    const finish = () => settleMorph(springs, targets);
    const paint = () => {
      const geometry = morphGeometry(springs, panel, point, corner);
      skin.style.transform = geometry.surfaceTransform;
      // Keep the visible corners round while scaling only the empty surface.
      skin.style.borderRadius = geometry.surfaceRadius;
      if (controlRef.current)
        controlRef.current.style.transform = geometry.controlTransform;
      text.style.clipPath = geometry.clipPath;
      if (mode === "activity" && activityRef.current) {
        activityRef.current.style.width = `${geometry.width}px`;
        activityRef.current.style.left = `${geometry.left}px`;
        activityRef.current.style.top = `${geometry.top}px`;
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
      // Integrate a critically damped spring without resetting reversal velocity.
      advanceMorph(springs, targets, dt);
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
    pointX,
    pointY,
    panelWidth,
    panelHeight,
    panelLeft,
    panelTop,
    surfaceRef,
    contentRef,
    controlRef,
    activityRef,
    activityWidth,
  ]);
}

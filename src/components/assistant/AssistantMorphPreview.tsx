// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import AssistantToggleIcon from "./AssistantToggleIcon";
import {
  advanceMorph,
  createMorphSprings,
  morphGeometry,
  morphSettled,
  morphTargets,
  settleMorph,
} from "./assistant-morph-motion";
import { dockSize } from "./dock";
import styles from "../AssistantPanel.module.css";

/** Scrubs the application's spring and CSS transitions using the authored clock. */
export default function AssistantMorphPreview({
  rootRef,
  seconds,
  openAt,
  children,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  seconds: number;
  openAt: number;
  children: ReactNode;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const buttonAnchor = useRef<HTMLDivElement>(null);
  const control = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const transitions = useRef<{
    color: Animation;
    icon: Animation;
    content: Animation;
    closedGlyph: Animation;
    openGlyph: Animation;
    colorDuration: number;
  } | null>(null);
  const open = seconds >= openAt;

  useLayoutEffect(
    () => () => {
      if (transitions.current) {
        transitions.current.color.cancel();
        transitions.current.icon.cancel();
        transitions.current.content.cancel();
        transitions.current.closedGlyph.cancel();
        transitions.current.openGlyph.cancel();
        transitions.current = null;
      }
    },
    [],
  );

  useLayoutEffect(() => {
    const root = rootRef.current,
      skin = surface.current,
      text = panel.current,
      toggle = button.current;
    if (!root || !skin || !text || !toggle) return;
    const update = () => {
      const width = root.clientWidth,
        height = root.clientHeight;
      if (!width || !height) return;
      const point = { x: width - dockSize, y: height - dockSize };
      const bounds = { left: 0, top: 0, width, height };
      const origin = `translate3d(${point.x}px,${point.y}px,0)`;
      if (anchor.current) anchor.current.style.transform = origin;
      if (buttonAnchor.current) buttonAnchor.current.style.transform = origin;
      skin.style.width = `${width}px`;
      skin.style.height = `${height}px`;
      if (!transitions.current) {
        const css = getComputedStyle(root);
        const ms = (key: string) => parseFloat(css.getPropertyValue(key));
        const easing = css
          .getPropertyValue("--assistant-morph-color-easing")
          .trim();
        const mode = root.dataset.mode;
        skin.dataset.animating = "false";
        root.dataset.mode = "bubble";
        const closed = getComputedStyle(skin);
        const from = {
          backgroundColor: closed.backgroundColor,
          borderColor: closed.borderColor,
          boxShadow: closed.boxShadow,
        };
        const fromIcon = getComputedStyle(toggle).color;
        root.dataset.mode = "panel";
        const expanded = getComputedStyle(skin);
        const to = {
          backgroundColor: expanded.backgroundColor,
          borderColor: expanded.borderColor,
          boxShadow: expanded.boxShadow,
        };
        const toIcon = getComputedStyle(toggle).color;
        root.dataset.mode = mode;
        const colorDuration = ms("--assistant-morph-color-duration");
        const color = skin.animate([from, to], {
          duration: colorDuration,
          easing,
          fill: "both",
        });
        const icon = toggle.animate([{ color: fromIcon }, { color: toIcon }], {
          duration: colorDuration,
          easing,
          fill: "both",
        });
        const content = text.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: ms("--assistant-morph-content-duration"),
          delay: ms("--assistant-morph-content-delay"),
          easing: css
            .getPropertyValue("--assistant-morph-content-easing")
            .trim(),
          fill: "both",
        });
        const glyphTiming: KeyframeAnimationOptions = {
          duration: ms("--assistant-morph-content-duration"),
          easing: css
            .getPropertyValue("--assistant-morph-content-easing")
            .trim(),
          fill: "both",
        };
        const closedGlyph = toggle
          .querySelector<HTMLElement>('[data-toggle-icon="chat"]')!
          .animate([{ opacity: 1 }, { opacity: 0 }], glyphTiming);
        const openGlyph = toggle
          .querySelector<HTMLElement>('[data-toggle-icon="minimize"]')!
          .animate([{ opacity: 0 }, { opacity: 1 }], glyphTiming);
        color.pause();
        icon.pause();
        content.pause();
        closedGlyph.pause();
        openGlyph.pause();
        transitions.current = {
          color,
          icon,
          content,
          closedGlyph,
          openGlyph,
          colorDuration,
        };
      }
      const motion = transitions.current;
      const elapsed = (seconds - openAt) * 1000;
      motion.color.currentTime = Math.max(
        0,
        Math.min(motion.colorDuration, elapsed),
      );
      motion.icon.currentTime = motion.color.currentTime;
      const growthSeconds = Math.max(
        0,
        (elapsed - motion.colorDuration) / 1000,
      );
      motion.content.currentTime = Math.max(0, elapsed - motion.colorDuration);
      motion.closedGlyph.currentTime = motion.content.currentTime;
      motion.openGlyph.currentTime = motion.content.currentTime;
      const targets = morphTargets(bounds, "panel", 0);
      const springs = createMorphSprings(morphTargets(bounds, "bubble", 0));
      advanceMorph(springs, targets, growthSeconds);
      const settled = morphSettled(springs, targets);
      if (settled) settleMorph(springs, targets);
      const geometry = morphGeometry(springs, bounds, point, "bottom-right");
      skin.style.transform = geometry.surfaceTransform;
      skin.style.borderRadius = geometry.surfaceRadius;
      skin.dataset.animating = String(open && !settled);
      skin.dataset.neutralizing = String(
        open && elapsed < motion.colorDuration,
      );
      text.style.clipPath = geometry.clipPath;
      if (control.current)
        control.current.style.transform = geometry.controlTransform;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef, seconds, openAt, open]);

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-ready
      data-mode={open ? "panel" : "bubble"}
      data-corner="bottom-right"
      data-example-assistant
      data-assistant-morph
      inert
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        visibility: "visible",
      }}
    >
      <div ref={anchor} className={styles.dockAnchor}>
        <div ref={surface} className={styles.material} aria-hidden />
      </div>
      <section
        ref={panel}
        className={styles.drawer}
        data-open={open || undefined}
        aria-hidden={!open}
        style={{
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          visibility: "visible",
          transition: "none",
        }}
      >
        {children}
      </section>
      <div
        ref={buttonAnchor}
        className={`${styles.dockAnchor} ${styles.buttonAnchor}`}
      >
        <div ref={control} className={styles.morphControl}>
          <button
            ref={button}
            type="button"
            className={styles.bubble}
            aria-label={open ? "Close assistant panel" : "Open assistant"}
            tabIndex={-1}
          >
            <AssistantToggleIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

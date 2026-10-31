"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { MessageCircle, Minus } from "lucide-react";
import {
  motion,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useAssistantMorph } from "@/components/assistant/useAssistantMorph";
import assistant from "@/components/AssistantPanel.module.css";
import DesignChatPanel from "./DesignChatPanel";
import styles from "./DesignChat.module.css";

const pointerOutline =
  "M4.2 3.5 23.1 11.8Q25 12.6 23 13.5L15.3 15.7 12.9 24.1Q12.3 26.1 11.4 24.2L3.2 5.2Q2.3 3.1 4.2 3.5Z";

export default function DesignChat({
  design,
  reduced,
  onReplay,
  onSend,
  onBuild,
}: {
  design: MotionValue<number>;
  reduced: boolean;
  onReplay: () => void;
  onSend: () => void;
  onBuild: () => void;
}) {
  const [time, setTime] = useState(design.get());
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const [size, setSize] = useState({
    width: 44,
    height: 44,
    centerX: 0,
    centerY: 0,
    ready: false,
  });
  const host = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const control = useRef<HTMLDivElement>(null);
  const activity = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  useMotionValueEvent(design, "change", (value) =>
    setTime(Math.floor(value * 160) / 160),
  );
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const viewport = window.visualViewport;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: rect.width,
        height: rect.height,
        // Convert the visible page center into the demo's local coordinates.
        centerX:
          (viewport?.offsetLeft ?? 0) +
          (viewport?.width ?? innerWidth) / 2 -
          rect.left,
        centerY:
          (viewport?.offsetTop ?? 0) +
          (viewport?.height ?? innerHeight) / 2 -
          rect.top,
        ready: true,
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
    };
  }, []);
  const open = openOverride ?? time >= 0.2;
  const point = {
    x: Math.max(0, size.width - 44),
    y: Math.max(0, size.height - 44),
  };
  const bounds = { left: 0, top: 0, width: size.width, height: size.height };
  useAssistantMorph({
    surface,
    content: panel,
    control,
    activity,
    point,
    panel: bounds,
    corner: "bottom-right",
    mode: open ? "panel" : "bubble",
    activityWidth: 0,
    ready: size.ready,
    immediate: false,
  });
  // Hold at the center, accelerate into a gentle arc, then settle before clicking.
  const travel = useTransform(design, [0.05, 0.16], [0, 1], {
    ease: (value) => value ** 3 * (value * (6 * value - 15) + 10),
  });
  const dx = point.x + 22 - size.centerX;
  const dy = point.y + 22 - size.centerY;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const bend = Math.min(28, distance * 0.055);
  const cursorX = useTransform(
    travel,
    (value) =>
      size.centerX +
      dx * value -
      (dy / distance) * bend * 4 * value * (1 - value),
  );
  const cursorY = useTransform(
    travel,
    (value) =>
      size.centerY +
      dy * value +
      (dx / distance) * bend * 4 * value * (1 - value),
  );
  const cursorOpacity = useTransform(
    design,
    [0, 0.025, 0.22, 0.27],
    [0, 1, 1, 0],
  );
  const cursorScale = useTransform(
    design,
    [0.18, 0.195, 0.205, 0.23],
    [1, 0.82, 0.82, 1],
  );
  const clickOpacity = useTransform(design, [0.185, 0.2, 0.26], [0, 0.45, 0]);
  const clickScale = useTransform(design, [0.185, 0.26], [0.7, 1.6]);
  const anchor: CSSProperties = size.ready
    ? {
        transform: `translate3d(${point.x}px,${point.y}px,0)`,
        transition: "none",
      }
    : { top: "auto", left: "auto", right: 0, bottom: 0, transition: "none" };
  function close() {
    setOpenOverride(false);
    if (panel.current?.contains(document.activeElement))
      launcher.current?.focus({ preventScroll: true });
  }
  return (
    <div
      ref={host}
      className={styles.demo}
      data-design-chat
      data-phase={time >= 0.7 ? "working" : time >= 0.64 ? "sent" : "typing"}
      data-intro={
        time < 0.2 ? "cursor" : time < 0.32 ? "opening" : "conversation"
      }
      data-expanded={open}
      onKeyDown={(event) => {
        if (
          open &&
          event.key === "Escape" &&
          !event.defaultPrevented &&
          !panel.current?.querySelector("[data-assistant-popover]")
        ) {
          event.preventDefault();
          close();
        }
      }}
    >
      <div
        className={assistant.root}
        data-ready
        data-animated
        data-mode={open ? "panel" : "bubble"}
        data-corner="bottom-right"
      >
        <div className={assistant.dockAnchor} style={anchor}>
          <div
            ref={surface}
            aria-hidden
            className={assistant.material}
            data-animating="false"
            style={{ width: size.width, height: size.height }}
          />
        </div>
        <section
          id="landing-assistant"
          ref={panel}
          className={assistant.drawer}
          style={
            {
              ...bounds,
              "--assistant-panel-height": `${size.height}px`,
            } as CSSProperties
          }
          data-open={open || undefined}
          role="dialog"
          aria-modal="false"
          aria-labelledby="landing-assistant-title"
          aria-hidden={!open}
          inert={!open}
        >
          <DesignChatPanel
            time={time}
            reduced={reduced}
            onReplay={() => {
              setOpenOverride(null);
              launcher.current?.focus({ preventScroll: true });
              onReplay();
            }}
            onSend={onSend}
            onBuild={onBuild}
          />
        </section>
        <div
          className={`${assistant.dockAnchor} ${assistant.buttonAnchor}`}
          style={anchor}
        >
          <div ref={control} className={assistant.morphControl}>
            <button
              ref={launcher}
              className={assistant.bubble}
              aria-label={
                open ? "Minimize assistant demo" : "Open assistant demo"
              }
              aria-expanded={open}
              aria-controls="landing-assistant"
              onClick={() => (open ? close() : setOpenOverride(true))}
            >
              {open ? (
                <Minus size={18} strokeWidth={1.8} />
              ) : (
                <MessageCircle size={18} strokeWidth={1.9} />
              )}
            </button>
          </div>
        </div>
      </div>
      {!reduced && openOverride === null && size.ready ? (
        <div aria-hidden className={styles.cursorLayer} data-demo-cursor>
          <motion.div
            className={styles.click}
            style={{
              left: point.x,
              top: point.y,
              opacity: clickOpacity,
              scale: clickScale,
            }}
          />
          <motion.div
            className={styles.cursor}
            style={{
              left: 0,
              top: 0,
              x: cursorX,
              y: cursorY,
              opacity: cursorOpacity,
              scale: cursorScale,
            }}
          >
            <svg width="28" height="30" viewBox="0 0 28 30" aria-hidden="true">
              <path
                d={pointerOutline}
                fill="none"
                stroke="#173b2b66"
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <path
                d={pointerOutline}
                fill="#111713"
                stroke="#f8fff9"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </motion.div>
        </div>
      ) : null}
    </div>
  );
}

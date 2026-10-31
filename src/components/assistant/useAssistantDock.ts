"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
import {
  dockCorners,
  dockPanel,
  dockPoint,
  nearestDock,
  type CanvasBounds,
  type DockCorner,
  type DockPoint,
} from "./dock";

const cornerKey = "project-cad.assistant-corner.v1";
export function useAssistantDock(
  container: RefObject<HTMLElement | null>,
  close: () => void,
  hide: () => void,
) {
  const [corner, setCorner] = useState<DockCorner>("bottom-right");
  const [bounds, setBounds] = useState<CanvasBounds>({
    left: 40,
    top: 52,
    right: 40,
    bottom: 52,
  });
  const [ready, setReady] = useState(false);
  const [dragPoint, setDragPoint] = useState<DockPoint | null>(null);
  const suppress = useRef(false);
  const drag = useRef<{
    id: number;
    start: DockPoint;
    origin: DockPoint;
    current: DockPoint;
    samples: { x: number; y: number; t: number }[];
    moved: boolean;
  } | null>(null);
  useEffect(() => {
    const host = container.current;
    if (!host) return;
    const measure = () => {
      const rect = host.getBoundingClientRect(),
        view = window.visualViewport;
      setBounds({
        left: Math.max(0, (view?.offsetLeft ?? 0) - rect.left) + 40,
        top: Math.max(0, (view?.offsetTop ?? 0) - rect.top) + 52,
        right: Math.min(
          rect.width,
          (view?.offsetLeft ?? 0) + (view?.width ?? innerWidth) - rect.left,
        ),
        bottom: Math.min(
          rect.height,
          (view?.offsetTop ?? 0) + (view?.height ?? innerHeight) - rect.top,
        ),
      });
      if (drag.current?.moved) suppress.current = true;
      drag.current = null;
      setDragPoint(null);
      setReady(true);
    };
    try {
      const saved = localStorage.getItem(cornerKey) as DockCorner;
      if (dockCorners.includes(saved)) queueMicrotask(() => setCorner(saved));
    } catch {
      /* Storage is optional. */
    }
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    queueMicrotask(measure);
    window.addEventListener("resize", measure);
    const scroll = (event: Event) => {
      if (event.target instanceof Node && event.target.contains(host))
        queueMicrotask(measure);
    };
    window.addEventListener("scroll", scroll, true);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", scroll, true);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [container]);
  const snap = useCallback((next: DockCorner) => {
    setCorner(next);
    setDragPoint(null);
    try {
      localStorage.setItem(cornerKey, next);
    } catch {
      /* Storage is optional. */
    }
  }, []);
  const point = dragPoint ?? dockPoint(bounds, corner);
  const hidePoint = {
    x: (bounds.left - 40 + bounds.right) / 2,
    y: bounds.bottom - 48,
  };
  const overHide = (value: DockPoint) =>
    Math.hypot(value.x + 22 - hidePoint.x, value.y + 22 - hidePoint.y) <= 48;
  function finish(event: PointerEvent<HTMLElement>, cancel = false) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    event.stopPropagation();
    drag.current = null;
    if (current.moved) {
      suppress.current = true;
      if (!cancel && overHide(current.current)) {
        setDragPoint(null);
        hide();
      } else {
        const recent = current.samples.filter(
          (sample) => event.timeStamp - sample.t < 100,
        );
        const start = recent[0],
          end = recent.at(-1);
        const dt = start && end ? end.t - start.t : 0;
        const velocity =
          !cancel && start && end && dt >= 8
            ? {
                x: Math.max(-3, Math.min(3, (end.x - start.x) / dt)),
                y: Math.max(-3, Math.min(3, (end.y - start.y) / dt)),
              }
            : { x: 0, y: 0 };
        snap(nearestDock(bounds, current.current, velocity));
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return {
    ready,
    corner,
    bounds,
    point,
    panel: dockPanel(bounds, corner),
    dragging: !!dragPoint,
    hidePoint,
    overHide: !!dragPoint && overHide(dragPoint),
    suppressClick: () => {
      const value = suppress.current;
      suppress.current = false;
      return value;
    },
    handlers: {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (!event.isPrimary || event.button !== 0) return;
        event.stopPropagation();
        suppress.current = false;
        const rect = event.currentTarget.getBoundingClientRect(),
          host = container.current!.getBoundingClientRect();
        const origin = { x: rect.left - host.left, y: rect.top - host.top };
        drag.current = {
          id: event.pointerId,
          start: { x: event.clientX, y: event.clientY },
          origin,
          current: origin,
          samples: [],
          moved: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        event.stopPropagation();
        const dx = event.clientX - current.start.x,
          dy = event.clientY - current.start.y;
        if (!current.moved && Math.hypot(dx, dy) < 5) return;
        if (!current.moved) {
          current.moved = true;
          close();
        }
        current.current = {
          x: Math.max(
            bounds.left,
            Math.min(bounds.right - 44, current.origin.x + dx),
          ),
          y: Math.max(
            bounds.top,
            Math.min(bounds.bottom - 44, current.origin.y + dy),
          ),
        };
        current.samples = [
          ...current.samples.filter(
            (sample) => event.timeStamp - sample.t < 100,
          ),
          { x: event.clientX, y: event.clientY, t: event.timeStamp },
        ];
        setDragPoint(current.current);
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => finish(event),
      onPointerCancel: (event: PointerEvent<HTMLElement>) =>
        finish(event, true),
      onKeyDown(event: KeyboardEvent<HTMLElement>) {
        if (!event.key.startsWith("Arrow")) return;
        event.preventDefault();
        event.stopPropagation();
        const vertical =
          event.key === "ArrowUp"
            ? "top"
            : event.key === "ArrowDown"
              ? "bottom"
              : corner.split("-")[0];
        const horizontal =
          event.key === "ArrowLeft"
            ? "left"
            : event.key === "ArrowRight"
              ? "right"
              : corner.split("-")[1];
        snap(`${vertical}-${horizontal}` as DockCorner);
      },
    },
  };
}

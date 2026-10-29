"use client";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type PointerEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
type Point = { x: number; y: number };
type Corner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
export function useFloatingDrag(
  containerRef: RefObject<HTMLElement | null>,
  elementRef: RefObject<HTMLElement | null>,
  active: boolean,
  snapToCorners = false,
) {
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const moved = useRef(false),
    dock = useRef<Corner | null>(snapToCorners ? "topRight" : null);
  const drag = useRef<{
    pointer: number;
    clientX: number;
    clientY: number;
    offset: Point;
    current: Point;
    rect: DOMRect;
    bounds: DOMRect;
  } | null>(null);
  const corners = useCallback(
    (rect: DOMRect, bounds: DOMRect): Record<Corner, Point> => {
      const toolbar = containerRef.current
        ?.querySelector(".canvas-toolbar")
        ?.getBoundingClientRect();
      const controls = containerRef.current
        ?.querySelector(".react-flow__controls")
        ?.getBoundingClientRect();
      const left = bounds.left + 20,
        right = bounds.right - 20 - rect.width;
      const top = Math.min(
        bounds.bottom - rect.height - 20,
        Math.max(bounds.top + 20, (toolbar?.bottom ?? bounds.top) + 16),
      );
      const bottom = bounds.bottom - 20 - rect.height;
      return {
        topLeft: { x: left, y: top },
        topRight: { x: right, y: top },
        bottomLeft: {
          x: Math.min(right, controls ? controls.right + 12 : left),
          y: bottom,
        },
        bottomRight: { x: right, y: bottom },
      };
    },
    [containerRef],
  );
  function bound(
    next: Point,
    origin = offset,
    rect = elementRef.current?.getBoundingClientRect(),
    bounds = containerRef.current?.getBoundingClientRect(),
  ) {
    if (!rect || !bounds) return next;
    return {
      x: Math.max(
        origin.x + bounds.left + 8 - rect.left,
        Math.min(next.x, origin.x + bounds.right - 8 - rect.right),
      ),
      y: Math.max(
        origin.y + bounds.top + 8 - rect.top,
        Math.min(next.y, origin.y + bounds.bottom - 8 - rect.bottom),
      ),
    };
  }
  useEffect(() => {
    const element = elementRef.current,
      container = containerRef.current;
    if (!active || !element || !container) return;
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect(),
        bounds = container.getBoundingClientRect();
      let dx =
        rect.left < bounds.left + 8
          ? bounds.left + 8 - rect.left
          : rect.right > bounds.right - 8
            ? bounds.right - 8 - rect.right
            : 0;
      let dy =
        rect.top < bounds.top + 8
          ? bounds.top + 8 - rect.top
          : rect.bottom > bounds.bottom - 8
            ? bounds.bottom - 8 - rect.bottom
            : 0;
      if (snapToCorners && dock.current) {
        const locations = corners(rect, bounds);
        dx = locations[dock.current].x - rect.left;
        dy = locations[dock.current].y - rect.top;
      }
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)
        setOffset((previous) => ({ x: previous.x + dx, y: previous.y + dy }));
    });
    observer.observe(container);
    observer.observe(element);
    const toolbar = container.querySelector(".canvas-toolbar");
    if (toolbar) observer.observe(toolbar);
    return () => observer.disconnect();
  }, [active, containerRef, elementRef, snapToCorners, corners]);
  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || !elementRef.current || !containerRef.current)
      return;
    if (
      event.target !== event.currentTarget &&
      (event.target as HTMLElement).closest(
        "button,input,textarea,summary,a",
      ) &&
      event.currentTarget.tagName !== "BUTTON"
    )
      return;
    moved.current = false;
    drag.current = {
      pointer: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      offset,
      current: offset,
      rect: elementRef.current.getBoundingClientRect(),
      bounds: containerRef.current.getBoundingClientRect(),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const start = drag.current;
    if (!start || start.pointer !== event.pointerId) return;
    const dx = event.clientX - start.clientX,
      dy = event.clientY - start.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true;
    if (moved.current) {
      dock.current = null;
      start.current = bound(
        { x: start.offset.x + dx, y: start.offset.y + dy },
        start.offset,
        start.rect,
        start.bounds,
      );
      setOffset(start.current);
    }
  }
  function finish(event: PointerEvent<HTMLElement>) {
    const start = drag.current;
    if (!start || start.pointer !== event.pointerId) return;
    drag.current = null;
    if (snapToCorners && moved.current) {
      const rect = new DOMRect(
        start.rect.x + start.current.x - start.offset.x,
        start.rect.y + start.current.y - start.offset.y,
        start.rect.width,
        start.rect.height,
      );
      const locations = corners(rect, start.bounds);
      const nearest = (Object.entries(locations) as [Corner, Point][]).sort(
        (a, b) =>
          Math.hypot(a[1].x - rect.x, a[1].y - rect.y) -
          Math.hypot(b[1].x - rect.x, b[1].y - rect.y),
      )[0];
      dock.current = nearest[0];
      setOffset({
        x: start.current.x + nearest[1].x - rect.x,
        y: start.current.y + nearest[1].y - rect.y,
      });
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!event.shiftKey) return;
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-10, 0],
      ArrowRight: [10, 0],
      ArrowUp: [0, -10],
      ArrowDown: [0, 10],
    };
    const delta = directions[event.key];
    if (!delta) return;
    event.preventDefault();
    const rect = elementRef.current?.getBoundingClientRect(),
      bounds = containerRef.current?.getBoundingClientRect();
    if (snapToCorners && rect && bounds) {
      const current = dock.current ?? "bottomRight";
      const vertical =
        delta[1] < 0
          ? "top"
          : delta[1] > 0
            ? "bottom"
            : current.startsWith("top")
              ? "top"
              : "bottom";
      const horizontal =
        delta[0] < 0
          ? "Left"
          : delta[0] > 0
            ? "Right"
            : current.endsWith("Left")
              ? "Left"
              : "Right";
      dock.current = `${vertical}${horizontal}` as Corner;
      const target = corners(rect, bounds)[dock.current];
      setOffset({
        x: offset.x + target.x - rect.x,
        y: offset.y + target.y - rect.y,
      });
    } else setOffset(bound({ x: offset.x + delta[0], y: offset.y + delta[1] }));
  }
  return {
    style: { transform: `translate(${offset.x}px, ${offset.y}px)` },
    dragProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
      onKeyDown,
    },
    suppressClick: () => {
      const result = moved.current;
      moved.current = false;
      return result;
    },
  };
}

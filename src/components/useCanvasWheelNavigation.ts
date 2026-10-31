import { useEffect, type RefObject } from "react";
import { useReactFlow, useStoreApi } from "@xyflow/react";
import { wheelNavigation } from "./canvas-navigation";
export { ZOOM_STEP } from "./canvas-navigation";

export const CANVAS_MIN_ZOOM = 0.05;
export const CANVAS_MAX_ZOOM = 3;

export function useCanvasWheelNavigation(
  area: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  const flow = useReactFlow();
  const store = useStoreApi();
  useEffect(() => {
    const canvas = area.current;
    if (!canvas || !enabled) return;
    let frame: number | undefined;
    let pending: ReturnType<typeof flow.getViewport> | undefined;
    const navigate = (event: WheelEvent) => {
      if (
        event.defaultPrevented ||
        !(event.target instanceof Element) ||
        !event.target.closest(".react-flow") ||
        event.target.closest(".nowheel")
      )
        return;
      const { domNode, userSelectionActive, connection } = store.getState();
      if (!domNode || userSelectionActive || connection.inProgress) return;
      event.preventDefault();
      event.stopPropagation();
      // Accumulate both axes without dropping fractional trackpad movement.
      const before = pending ?? flow.getViewport();
      const gesture = wheelNavigation(event, /Mac/.test(navigator.userAgent));
      if (event.ctrlKey || event.metaKey) {
        const zoom = Math.min(
          CANVAS_MAX_ZOOM,
          Math.max(CANVAS_MIN_ZOOM, before.zoom * gesture.zoom),
        );
        const bounds = domNode.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;
        const ratio = zoom / before.zoom;
        pending = {
          x: x - (x - before.x) * ratio,
          y: y - (y - before.y) * ratio,
          zoom,
        };
      } else {
        pending = {
          x: before.x - gesture.x,
          y: before.y - gesture.y,
          zoom: before.zoom,
        };
      }
      frame ??= requestAnimationFrame(() => {
        const viewport = pending;
        pending = undefined;
        frame = undefined;
        if (viewport) void flow.setViewport(viewport, { duration: 0 });
      });
    };
    canvas.addEventListener("wheel", navigate, {
      capture: true,
      passive: false,
    });
    return () => {
      canvas.removeEventListener("wheel", navigate, true);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [area, enabled, flow, store]);
}

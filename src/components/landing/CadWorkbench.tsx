"use client";

import {
  createRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import { Workflow } from "lucide-react";
import type { MotionValue } from "motion/react";
import { Vector3 } from "three";
import ProcessCanvas from "@/components/ProcessCanvas";
import {
  CAD_WIDTH,
  CAD_HEIGHT,
  CAD_HEADER,
  CAD_SCALE,
  CAD_CENTER_Z,
  makeLandingProject,
  stepProgress,
  unitUnfold,
} from "./landing-construction";
import { reveal } from "./landing-system";
import styles from "./LandingPage.module.css";

export type CadRoutes = Map<string, Vector3[]>;
export type CadBridge = {
  viewport: RefObject<HTMLDivElement | null>;
  camera: RefObject<HTMLDivElement | null>;
  surface: RefObject<HTMLDivElement | null>;
  routes: CadRoutes;
};
export function createCadBridge(): CadBridge {
  return {
    viewport: createRef(),
    camera: createRef(),
    surface: createRef(),
    routes: new Map(),
  };
}
const noop = () => {};
const presentation = {
  viewport: { x: 0, y: 0, zoom: 1 },
  colorMode: "dark" as const,
};

/** The application's actual React Flow canvas, placed on the 3D workbench.
 * SVG stays vector-sharp. Its real routed paths become the rising 3D pipes. */
export default function CadWorkbench({
  progress,
  construction,
  simulation,
  bridge,
  fallback,
}: {
  progress: MotionValue<number>;
  construction: MotionValue<number>;
  simulation: MotionValue<number>;
  bridge: CadBridge;
  fallback: boolean;
}) {
  const project = useMemo(() => makeLandingProject(), []);
  const refresh = useRef<() => void>(() => {});
  const root = useRef<HTMLDivElement>(null);
  const unitFocus = useRef<SVGGElement>(null);
  const streamFocus = useRef<SVGGElement>(null);
  useEffect(() => {
    if (!fallback) return;
    const resize = () =>
      bridge.viewport.current?.style.setProperty(
        "--fallback-scale",
        String(
          Math.min(
            (window.innerWidth - 48) / CAD_WIDTH,
            (window.innerHeight - 300) / CAD_HEIGHT,
          ),
        ),
      );
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [bridge, fallback]);
  const elements = useRef<{
    nodes: {
      id: string;
      element: HTMLElement;
      symbol: HTMLElement | null;
    }[];
    edges: {
      id: string;
      path: SVGPathElement;
      length: number;
      wrapper: SVGGElement;
    }[];
  }>({ nodes: [], edges: [] });
  useLayoutEffect(() => {
    const host = root.current;
    if (!host) return;
    let frame = 0;
    const collect = () => {
      elements.current.nodes = Array.from(
        host.querySelectorAll<HTMLElement>(".react-flow__node"),
      ).map((element) => ({
        id: element.dataset.id!,
        element,
        symbol: element.querySelector<HTMLElement>(".equipment-node"),
      }));
      elements.current.edges = Array.from(
        host.querySelectorAll<SVGGElement>(".react-flow__edge"),
      ).flatMap((wrapper) => {
        const path = wrapper.querySelector<SVGPathElement>(
          ".react-flow__edge-path",
        );
        if (!path || !path.getAttribute("d")) return [];
        const length = path.getTotalLength();
        const id = wrapper.dataset.id!;
        // Sample only when the application's router changes its path.
        bridge.routes.set(
          id,
          Array.from({ length: 161 }, (_, i) => {
            const point = path.getPointAtLength((length * i) / 160);
            return new Vector3(
              (point.x - CAD_WIDTH / 2) / CAD_SCALE,
              0.18,
              (point.y + CAD_HEADER - CAD_HEIGHT / 2) / CAD_SCALE +
                CAD_CENTER_Z,
            );
          }),
        );
        return [{ id, path, length, wrapper }];
      });
      refresh.current();
    };
    const observer = new MutationObserver((changes) => {
      if (
        !changes.some(
          (change) =>
            change.type === "childList" || change.attributeName === "d",
        )
      )
        return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(collect);
    });
    observer.observe(host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["d"],
    });
    collect();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [bridge]);
  useEffect(() => {
    const update = () => {
      if (!root.current) return;
      const p = progress.get();
      const built = construction.get();
      const simulated = simulation.get();
      const opacity = reveal(p, 0.18, 0.3) * (1 - reveal(p, 0.79, 0.84));
      const paper = 1 - reveal(p, 0.55, 0.65);
      unitFocus.current?.setAttribute("opacity", "0");
      streamFocus.current?.setAttribute("opacity", "0");
      root.current.style.setProperty("--canvas", `rgba(9,27,36,${paper})`);
      root.current.style.setProperty("--symbol-fill", `rgba(9,27,36,${paper})`);
      root.current.style.setProperty(
        "border-color",
        `rgba(49,86,95,${paper * 0.5})`,
      );
      root.current.style.setProperty(
        "box-shadow",
        `0 24px 70px rgba(0,16,24,${paper * 0.15})`,
      );
      root.current
        .querySelector<HTMLElement>(`.${styles.cadToolbar}`)
        ?.style.setProperty("opacity", String(paper));
      root.current
        .querySelector<SVGElement>(".react-flow__background")
        ?.style.setProperty("opacity", String(paper));
      root.current.style.opacity = String(opacity);
      root.current.style.visibility = opacity > 0.001 ? "visible" : "hidden";
      root.current.setAttribute("aria-hidden", String(opacity < 0.01));
      root.current.dataset.simulation =
        simulated === 1 ? "complete" : built === 1 ? "running" : "idle";
      const status =
        root.current.querySelector<HTMLElement>("[data-cad-status]");
      if (status)
        status.textContent =
          simulated === 1
            ? "✓ Simulated"
            : built === 1
              ? "Simulating…"
              : "Building";
      root.current.dataset.builtUnits = String(
        elements.current.nodes.filter(
          (node) => stepProgress(built, "unit", node.id) >= 1,
        ).length,
      );
      for (const [index, node] of elements.current.nodes.entries()) {
        const drawn = stepProgress(built, "unit", node.id);
        node.element.style.setProperty(
          "opacity",
          String(Math.min(1, drawn * 4) * unitUnfold(p, index).drawing),
        );
        node.element.setAttribute(
          "data-constructing",
          String(drawn > 0 && drawn < 1),
        );
        if (drawn > 0 && drawn < 1 && unitFocus.current) {
          const unit = project.units.find((item) => item.id === node.id)!;
          unitFocus.current.setAttribute(
            "transform",
            `translate(${unit.position.x + 64},${unit.position.y + 64})`,
          );
          unitFocus.current.setAttribute("opacity", String(paper));
        }
        // React Flow owns the outer transform; pop the complete inner symbol.
        const pop =
          drawn === 0
            ? 0.68
            : 1 - Math.pow(1 - drawn, 3) + Math.sin(drawn * Math.PI) * 0.14;
        node.symbol?.style.setProperty("scale", String(pop));
      }
      for (const edge of elements.current.edges) {
        const drawn = stepProgress(built, "stream", edge.id);
        edge.wrapper.style.setProperty(
          "opacity",
          drawn === 0 ? "0" : String(1 - reveal(p, 0.56, 0.62)),
        );
        edge.path.style.setProperty("stroke-dasharray", String(edge.length));
        edge.path.style.setProperty(
          "stroke-dashoffset",
          String(edge.length * (1 - drawn)),
        );
        edge.path.style.setProperty("marker-end", drawn < 0.98 ? "none" : "");
        edge.wrapper.setAttribute(
          "data-constructing",
          String(drawn > 0 && drawn < 1),
        );
        edge.path.classList.toggle(
          styles.simulatingStream,
          built === 1 && simulated < 1 && simulated > 0,
        );
        if (built === 1 && simulated > 0 && simulated < 1) {
          edge.path.style.setProperty("stroke-dasharray", "12 7");
          edge.path.style.setProperty(
            "stroke-dashoffset",
            String(-simulated * 240),
          );
        }
        if (drawn > 0 && drawn < 1 && streamFocus.current) {
          const point = edge.path.getPointAtLength(edge.length * drawn);
          streamFocus.current.setAttribute(
            "transform",
            `translate(${point.x},${point.y})`,
          );
          streamFocus.current.setAttribute("opacity", String(paper));
        }
      }
    };
    refresh.current = update;
    update();
    const stopProgress = progress.on("change", update);
    const stopConstruction = construction.on("change", update);
    const stopSimulation = simulation.on("change", update);
    return () => {
      stopProgress();
      stopConstruction();
      stopSimulation();
      refresh.current = () => {};
    };
  }, [progress, construction, simulation, project]);
  // These are forwarded ref objects, never reads of their current values.
  /* eslint-disable react-hooks/refs */
  return (
    <div
      ref={bridge.viewport}
      className={styles.cadProjection}
      data-fallback={fallback}
      aria-label="Live application canvas"
    >
      <div ref={bridge.camera} className={styles.cadCamera}>
        <div ref={bridge.surface} className={styles.cadSurface}>
          <div
            ref={root}
            className={styles.cadWorkbench}
            data-live-cad
            style={{ width: CAD_WIDTH, height: CAD_HEIGHT, opacity: 0 }}
          >
            <div className={styles.cadToolbar} style={{ height: CAD_HEADER }}>
              <span>
                <Workflow size={16} /> Process canvas
              </span>
              <span>{project.name}</span>
              <span className={styles.cadMode} data-cad-status>
                Building
              </span>
            </div>
            <div
              className={styles.cadCanvas}
              style={{ height: CAD_HEIGHT - CAD_HEADER }}
            >
              <ProcessCanvas
                project={project}
                selected={null}
                selection={[]}
                onSelection={noop}
                onInspect={noop}
                onChange={noop}
                onAdd={noop}
                onError={noop}
                result={null}
                compositionColors={false}
                presentation={presentation}
              />
              <svg
                className={styles.constructionCursor}
                viewBox={`0 0 ${CAD_WIDTH} ${CAD_HEIGHT - CAD_HEADER}`}
                aria-hidden="true"
              >
                <g ref={unitFocus} opacity="0">
                  <path
                    d="M-82-50v-32h32 M50-82h32v32 M82 50v32h-32 M-50 82h-32v-32"
                    fill="none"
                    stroke="#99ffed"
                    strokeWidth="3"
                  />
                  <path
                    className={styles.unitScan}
                    d="M-78 0H78"
                    stroke="#99ffed"
                    strokeWidth="2"
                  />
                </g>
                <g ref={streamFocus} opacity="0">
                  <circle
                    r="16"
                    fill="#72f8df"
                    fillOpacity=".08"
                    stroke="#72f8df"
                    strokeWidth="2"
                  />
                  <circle r="5" fill="#effffc" />
                </g>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
/* eslint-enable react-hooks/refs */

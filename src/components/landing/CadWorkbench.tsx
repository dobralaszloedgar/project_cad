"use client";

import { createRef, useEffect, useRef, type RefObject } from "react";
import {
  BarChart3,
  Box,
  Columns2,
  FlaskConical,
  Hand,
  House,
  Maximize,
  Minus,
  Play,
  Plus,
  Settings2,
  Volume2,
} from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { EquipmentIcon, EquipmentPanelIcon } from "@/components/EquipmentIcon";
import type { Kind } from "@/domain/schema";
import type { MotionValue } from "motion/react";
import {
  CAD_WIDTH,
  CAD_HEIGHT,
  CAD_HEADER,
  CAD_SCALE,
  CAD_CENTER_Z,
  ROUTE_SAMPLES,
  stepProgress,
  unitUnfold,
} from "./landing-construction";
import { reveal } from "./landing-motion";
import drawing from "./landing-drawing.json";
import DemoPointer from "./DemoPointer";
import styles from "./LandingPage.module.css";

export type CadRoutes = Map<string, { x: number; y: number; z: number }[]>;
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

/** Fixed worksheet artwork, using the app's symbols and authored connector paths.
 * No React Flow, live routing, simulation, controls or mutation observers. */
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
  const root = useRef<HTMLDivElement>(null);
  const pointer = useRef<SVGGElement>(null);
  useEffect(() => {
    const resize = () =>
      bridge.viewport.current?.style.setProperty(
        "--fallback-scale",
        String(
          Math.max(
            0.1,
            Math.min(
              (innerWidth - 48) / CAD_WIDTH,
              (innerHeight - 300) / CAD_HEIGHT,
            ),
          ),
        ),
      );
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [bridge]);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const units = drawing.units.map((unit) => ({
      ...unit,
      element: host.querySelector<SVGGElement>(
        '[data-unit="' + unit.id + '"]',
      )!,
    }));
    const streams = drawing.streams.map((stream) => {
      const element = host.querySelector<SVGGElement>(
        '[data-stream="' + stream.id + '"]',
      )!;
      const path = element.querySelector<SVGPathElement>("path")!;
      const label = element.querySelector<SVGGElement>("[data-stream-label]")!;
      const length = path.getTotalLength();
      const points = Array.from({ length: ROUTE_SAMPLES + 1 }, (_, index) =>
        path.getPointAtLength((length * index) / ROUTE_SAMPLES),
      );
      bridge.routes.set(
        stream.id,
        points.map((point) => ({
          x: (point.x - CAD_WIDTH / 2) / CAD_SCALE,
          y: 0.18,
          z: (point.y + CAD_HEADER - CAD_HEIGHT / 2) / CAD_SCALE + CAD_CENTER_Z,
        })),
      );
      return { ...stream, element, path, label, length, points };
    });
    const chrome = host.querySelectorAll<HTMLElement>("[data-sheet-chrome]");
    const status = host.querySelector<HTMLElement>("[data-cad-status]")!;
    const grid = host.querySelector<HTMLElement>("[data-sheet-grid]")!;
    const update = () => {
      const p = progress.get(),
        built = construction.get(),
        simulated = simulation.get();
      const opacity = reveal(p, 0.18, 0.3) * (1 - reveal(p, 0.79, 0.84));
      const paper = 1 - reveal(p, 0.55, 0.65);
      host.style.opacity = String(opacity);
      host.style.visibility = opacity > 0.001 ? "visible" : "hidden";
      host.setAttribute("aria-hidden", String(opacity < 0.01));
      if (opacity <= 0.001 && p > 0.84) return;
      host.style.setProperty("--canvas", "rgb(250 251 249 / " + paper + ")");
      host.style.setProperty(
        "--symbol-fill",
        "rgb(250 251 249 / " + paper + ")",
      );
      host.style.borderColor = "rgb(38 55 48 / " + paper * 0.15 + ")";
      host.style.boxShadow = "0 18px 60px rgb(38 55 48 / " + paper * 0.07 + ")";
      chrome.forEach((part) => {
        part.style.opacity = String(paper);
      });
      grid.style.opacity = String(paper);
      host.dataset.simulation =
        simulated === 1 ? "complete" : built === 1 ? "running" : "idle";
      status.textContent =
        simulated === 1
          ? "Simulated"
          : built === 1
            ? "Simulating…"
            : "Simulate";
      host.dataset.builtUnits = String(
        units.filter((unit) => stepProgress(built, "unit", unit.id) >= 1)
          .length,
      );
      pointer.current?.setAttribute("opacity", "0");
      for (const [index, unit] of units.entries()) {
        const drawn = stepProgress(built, "unit", unit.id);
        unit.element.style.opacity = String(
          Math.min(1, drawn * 3) * unitUnfold(p, index).drawing,
        );
        if (drawn > 0 && drawn < 1 && pointer.current) {
          pointer.current.setAttribute(
            "transform",
            "translate(" + (unit.x + 76) + "," + (unit.y + 70) + ")",
          );
          pointer.current.setAttribute("opacity", String(paper));
        }
      }
      for (const stream of streams) {
        const drawn = stepProgress(built, "stream", stream.id);
        stream.element.style.opacity =
          drawn === 0 ? "0" : String(1 - reveal(p, 0.56, 0.62));
        stream.path.style.strokeDasharray = String(stream.length);
        stream.path.style.strokeDashoffset = String(
          stream.length * (1 - drawn),
        );
        stream.path.style.markerEnd = drawn < 0.98 ? "none" : "";
        stream.label.style.opacity = drawn >= 1 ? "1" : "0";
        if (built === 1 && simulated > 0 && simulated < 1) {
          stream.path.style.strokeDasharray = "12 7";
          stream.path.style.strokeDashoffset = String(-simulated * 240);
        }
        if (drawn > 0 && drawn < 1 && pointer.current) {
          const point =
            stream.points[
              Math.min(ROUTE_SAMPLES, Math.round(drawn * ROUTE_SAMPLES))
            ];
          pointer.current.setAttribute(
            "transform",
            "translate(" + point.x + "," + point.y + ")",
          );
          pointer.current.setAttribute("opacity", String(paper));
        }
      }
    };
    update();
    const unsub = [progress, construction, simulation].map((value) =>
      value.on("change", update),
    );
    return () => {
      unsub.forEach((stop) => stop());
      bridge.routes.clear();
    };
  }, [progress, construction, simulation, bridge]);
  /* eslint-disable react-hooks/refs -- these are forwarded ref objects */
  return (
    <div
      ref={bridge.viewport}
      className={styles.cadProjection}
      data-fallback={fallback}
      aria-label="Example process worksheet"
    >
      <div ref={bridge.camera} className={styles.cadCamera}>
        <div ref={bridge.surface} className={styles.cadSurface}>
          <div
            ref={root}
            className={styles.cadWorkbench}
            data-live-cad
            data-demo-worksheet
            style={{ width: CAD_WIDTH, height: CAD_HEIGHT, opacity: 0 }}
            inert
          >
            <div
              className={styles.cadToolbar}
              style={{ height: CAD_HEADER }}
              data-sheet-chrome
            >
              <span>
                <BrandMark size={29} /> Project CAD <i />
                <House size={19} />
              </span>
              <span className={styles.cadProjectName}>
                Reaction, separation &amp; recycle
              </span>
              <span className={styles.cadHeaderTools}>
                <Volume2 size={19} />
                <FlaskConical size={19} /> Ideal mixture{" "}
                <span className={styles.cadMode}>
                  <Play size={15} fill="currentColor" />
                  <span data-cad-status>Simulate</span>
                </span>
              </span>
            </div>
            <div
              className={styles.cadCanvas}
              style={{ height: CAD_HEIGHT - CAD_HEADER }}
            >
              <div className={styles.sheetGrid} data-sheet-grid />
              <div className={styles.sheetPanels} data-sheet-chrome>
                <span>
                  <EquipmentPanelIcon size={19} /> Equipment
                </span>
                <i />
                <span>
                  <BarChart3 size={19} /> Results
                </span>
              </div>
              <div className={styles.sheetViews} data-sheet-chrome>
                <span data-active>
                  <Columns2 size={18} /> 2D
                </span>
                <span>
                  <Box size={18} /> 3D
                </span>
                <i />
                <span>
                  <Maximize size={18} />
                </span>
                <span>
                  <Settings2 size={18} />
                </span>
              </div>
              <div className={styles.sheetZoom} data-sheet-chrome>
                <Plus size={18} />
                <Minus size={18} />
                <Maximize size={17} />
                <Hand size={17} />
              </div>
              <svg
                className={styles.worksheetDrawing}
                viewBox={"0 0 " + CAD_WIDTH + " " + (CAD_HEIGHT - CAD_HEADER)}
                role="img"
                aria-label="Nine equipment units connected by colored material streams, including a recycle loop"
              >
                <defs>
                  {drawing.streams.map((stream) => (
                    <marker
                      key={stream.id}
                      id={"landing-arrow-" + stream.id}
                      viewBox="0 0 12 12"
                      refX="11"
                      refY="6"
                      markerWidth="10"
                      markerHeight="10"
                      orient="auto"
                      markerUnits="userSpaceOnUse"
                    >
                      <path d="M1 1L11 6L1 11Z" fill={stream.color} />
                    </marker>
                  ))}
                </defs>
                {drawing.streams.map((stream) => (
                  <g key={stream.id} data-stream={stream.id}>
                    <path
                      d={stream.path}
                      fill="none"
                      stroke={stream.color}
                      strokeWidth={2.5}
                      strokeLinejoin="round"
                      markerEnd={"url(#landing-arrow-" + stream.id + ")"}
                    />
                    <g data-stream-label>
                      <rect
                        x={stream.label.x - (stream.name.length * 5 + 8)}
                        y={stream.label.y - 13}
                        width={stream.name.length * 10 + 16}
                        height={26}
                        rx={2}
                        fill="var(--canvas)"
                      />
                      <text
                        x={stream.label.x}
                        y={stream.label.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={18}
                        fill={stream.color}
                      >
                        {stream.name}
                      </text>
                    </g>
                  </g>
                ))}
                {drawing.units.map((unit) => (
                  <g
                    key={unit.id}
                    data-unit={unit.id}
                    transform={"translate(" + unit.x + "," + unit.y + ")"}
                    className={styles.sheetUnit}
                  >
                    <text
                      x={64}
                      y={-34}
                      textAnchor="middle"
                      className={styles.sheetTag}
                    >
                      {unit.id}
                    </text>
                    <circle cx={103} cy={-40} r={4.5} fill="#27996b" />
                    <text
                      x={64}
                      y={-13}
                      textAnchor="middle"
                      className={styles.sheetName}
                    >
                      {unit.name}
                    </text>
                    <EquipmentIcon
                      kind={unit.kind as Kind}
                      size={128}
                      trayCount={8}
                    />
                    {unit.ports.map((port) => (
                      <circle
                        key={port.id}
                        cx={port.x}
                        cy={port.y}
                        r={4.5}
                        fill="var(--canvas)"
                        stroke="#578778"
                        strokeWidth={1.5}
                      />
                    ))}
                  </g>
                ))}
                <g ref={pointer} opacity={0} aria-hidden="true">
                  <DemoPointer size={30} />
                </g>
              </svg>
              <div className={styles.sheetStatus} data-sheet-chrome>
                Example worksheet <span>9 units · 9 streams</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  /* eslint-enable react-hooks/refs */
}

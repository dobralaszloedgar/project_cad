// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FlaskConical, Play, Ruler, Volume2 } from "lucide-react";
import type { MotionValue } from "motion/react";
import ProcessCanvas from "../ProcessCanvas";
import CanvasToolbar from "../CanvasToolbar";
import WorkspaceHeader from "../WorkspaceHeader";
import ThermodynamicSelector from "../ThermoSettings";
import { defaultThermo } from "@/domain/thermo/registry";
import { landingExample } from "./landing-example";
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
import styles from "./LandingPage.module.css";

export { createCadBridge } from "./landing-bridge";
import type { CadBridge } from "./landing-bridge";

const noop = () => {};
const presentation = {
  viewport: { x: 0, y: 0, zoom: 1 },
  colorMode: "light" as const,
  showStatus: true,
  showControls: true,
};

/** The application's real read-only canvas and chrome, with authored reveal timing. */
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
  const [calculated, setCalculated] = useState(simulation.get() >= 1);
  const statuses = calculated
    ? landingExample.calculatedStatuses
    : landingExample.readyStatuses;
  const canvas = useMemo(
    () => (
      <ProcessCanvas
        project={landingExample.project}
        selected={null}
        selection={[]}
        onSelection={noop}
        onInspect={noop}
        onChange={noop}
        onAdd={noop}
        onError={noop}
        onNavigateIssue={noop}
        statuses={statuses}
        compositionColors={calculated}
        streamColors={landingExample.colors.streams}
        presentation={presentation}
      />
    ),
    [statuses, calculated],
  );
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
    addEventListener("resize", resize);
    return () => removeEventListener("resize", resize);
  }, [bridge]);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    let frame = 0,
      disposed = false;
    let update = () => {};
    const attach = () => {
      if (disposed) return;
      const units = landingExample.project.units.map((unit) => ({
        ...unit,
        element: host.querySelector<HTMLElement>(
          `.react-flow__node[data-id="${unit.id}"]`,
        ),
      }));
      const streams = landingExample.project.edges.map((stream) => ({
        ...stream,
        element: host.querySelector<SVGGElement>(
          `.react-flow__edge[data-id="${stream.id}"]`,
        ),
      }));
      if (units.some((u) => !u.element) || streams.some((s) => !s.element)) {
        frame = requestAnimationFrame(attach);
        return;
      }
      const paths = streams.map((stream) => {
        const path = stream.element!.querySelector<SVGPathElement>(
          ".react-flow__edge-path",
        )!;
        const length = path.getTotalLength();
        bridge.routes.set(
          stream.id,
          Array.from({ length: ROUTE_SAMPLES + 1 }, (_, i) => {
            const point = path.getPointAtLength((length * i) / ROUTE_SAMPLES);
            return {
              x: (point.x - CAD_WIDTH / 2) / CAD_SCALE,
              y: 0.18,
              z:
                (point.y + CAD_HEADER - CAD_HEIGHT / 2) / CAD_SCALE +
                CAD_CENTER_Z,
            };
          }),
        );
        return { ...stream, path, length };
      });
      host.dataset.canvasReady = "true";
      update = () => {
        const p = progress.get(),
          built = construction.get(),
          simulated = simulation.get();
        const opacity = reveal(p, 0.18, 0.3) * (1 - reveal(p, 0.79, 0.84));
        const paper = 1 - reveal(p, 0.55, 0.65);
        host.style.opacity = String(opacity);
        host.style.visibility = opacity > 0.001 ? "visible" : "hidden";
        host.setAttribute("aria-hidden", String(opacity < 0.01));
        host.style.setProperty("--canvas", `rgb(250 251 249 / ${paper})`);
        host.style.setProperty("--symbol-fill", `rgb(250 251 249 / ${paper})`);
        host.style.borderColor = `rgb(38 55 48 / ${paper * 0.15})`;
        host.style.boxShadow = `0 18px 60px rgb(38 55 48 / ${paper * 0.07})`;
        host
          .querySelectorAll<HTMLElement>(
            "[data-sheet-chrome], .canvas-toolbar, .react-flow__controls, .react-flow__background",
          )
          .forEach((part) => (part.style.opacity = String(paper)));
        host.dataset.simulation =
          simulated >= 1 ? "complete" : built >= 1 ? "running" : "idle";
        host.dataset.builtUnits = String(
          units.filter((u) => stepProgress(built, "unit", u.id) >= 1).length,
        );
        for (const [index, unit] of units.entries())
          unit.element!.style.opacity = String(
            Math.min(1, stepProgress(built, "unit", unit.id) * 3) *
              unitUnfold(p, index).drawing,
          );
        for (const stream of paths) {
          const drawn = stepProgress(built, "stream", stream.id);
          stream.element!.style.opacity =
            drawn === 0 ? "0" : String(1 - reveal(p, 0.56, 0.62));
          stream.path.style.strokeDasharray = String(stream.length);
          stream.path.style.strokeDashoffset = String(
            stream.length * (1 - drawn),
          );
          if (built >= 1 && simulated > 0 && simulated < 1) {
            stream.path.style.strokeDasharray = "12 7";
            stream.path.style.strokeDashoffset = String(-simulated * 240);
          }
        }
      };
      update();
    };
    frame = requestAnimationFrame(attach);
    const stops = [progress, construction, simulation].map((v) =>
      v.on("change", () => update()),
    );
    const stopCalculated = simulation.on("change", (value) =>
      setCalculated(value >= 1),
    );
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      stops.forEach((stop) => stop());
      stopCalculated();
      bridge.routes.clear();
    };
  }, [progress, construction, simulation, bridge, calculated]);
  /* eslint-disable react-hooks/refs -- Forwarded ref objects are passed through, not read. */
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
            inert
            style={{ width: CAD_WIDTH, height: CAD_HEIGHT, opacity: 0 }}
          >
            <div data-sheet-chrome style={{ height: CAD_HEADER }}>
              <WorkspaceHeader
                title={landingExample.project.name}
                onProjects={noop}
                onLanding={noop}
              >
                <button className="icon-button" aria-label="Mute canvas sounds">
                  <Volume2 size={17} />
                </button>
                <ThermodynamicSelector
                  settings={landingExample.project.thermo ?? defaultThermo}
                  open={false}
                  onOpenChange={noop}
                  onApply={noop}
                  onError={noop}
                />
                <button
                  className="species-count"
                  aria-label="Project components"
                >
                  <FlaskConical size={16} />
                  <span>2</span>
                </button>
                <button className="icon-button units-button" aria-label="Units">
                  <Ruler size={16} />
                </button>
                <button
                  className="btn btn-primary simulate-button"
                  aria-label="Run simulation"
                >
                  <Play size={13} fill="currentColor" />
                  Simulate
                </button>
              </WorkspaceHeader>
            </div>
            <div
              className={styles.cadCanvas}
              style={{ height: CAD_HEIGHT - CAD_HEADER }}
            >
              {canvas}
              <CanvasToolbar
                drawer={null}
                closeDrawer={noop}
                openPanel={noop}
                view="2D"
                setView={noop}
                selected={null}
                setPropertiesOpen={noop}
                arrange={noop}
                canArrange
                isFullscreen={false}
                toggleFullscreen={noop}
                setHelpOpen={noop}
              />
              <div className={styles.sheetStatus} data-sheet-chrome>
                Example data
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  /* eslint-enable react-hooks/refs */
}

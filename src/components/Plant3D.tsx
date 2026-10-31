"use client";

import { useCallback, useMemo, useState } from "react";
import { Eye, Focus, Pause, Play, Scan } from "lucide-react";
import type { Project } from "@/domain/schema";
import type { Result } from "@/domain/solver";
import EquipmentScene, { type CameraView } from "./equipment-3d/EquipmentScene";
import { buildProjectPlant } from "./equipment-3d/project-plant";
import { projectCompositionColors } from "./equipment-3d/composition-colors";
import type { TrayHydraulicsResult } from "@/domain/equipment/tray-hydraulics";
import "./tray-hydraulics.css";

export default function Plant3D({
  project,
  result = null,
  selected,
  onSelect,
  dark = false,
  canvasColor,
  initialPlaying = false,
  graphicsSettingsContainer,
}: {
  project: Project;
  result?: Result | null;
  selected: string | null;
  onSelect: (id: string) => void;
  dark?: boolean;
  canvasColor?: string;
  initialPlaying?: boolean;
  graphicsSettingsContainer?: HTMLElement | null;
}) {
  const [transparent, setTransparent] = useState(true);
  const [grid, setGrid] = useState(true);
  const toggleGrid = useCallback(() => setGrid((value) => !value), []);
  const [playing, setPlaying] = useState(
    () =>
      initialPlaying &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [speed, setSpeed] = useState(1);
  const [reset, setReset] = useState(0);
  const [focus, setFocus] = useState(0);
  const [view, setView] = useState<CameraView>("perspective");
  const compositionColors = useMemo(
    () => projectCompositionColors(project, result),
    [project, result],
  );
  const layout = useMemo(() => {
    try {
      return buildProjectPlant(project);
    } catch {
      return null;
    }
  }, [project]);
  const columnHydraulics = useMemo(() => {
    const ratings: Record<string, TrayHydraulicsResult> = {};
    if (!result?.converged) return ratings;
    for (const unit of project.units) {
      const column = result.equipment[unit.id]?.distillation;
      const config = unit.params.distillation;
      if (
        config?.method === "mesh" &&
        config.hydraulics?.enabled &&
        column?.method === "mesh" &&
        column.hydraulics &&
        column.stages.length - 2 === unit.params.trayCount &&
        JSON.stringify(config.hydraulics) ===
          JSON.stringify(column.hydraulics.config)
      )
        ratings[unit.id] = column.hydraulics;
    }
    return ratings;
  }, [project, result]);
  const selectedHydraulics = selected ? columnHydraulics[selected] : undefined;
  return (
    <div
      className="plant-view"
      data-transparent={transparent}
      data-equipment-count={project.units.length}
      data-stream-count={project.edges.length}
    >
      {layout ? (
        <EquipmentScene
          kind="Feed"
          mode="process"
          system={layout}
          compositionColors={compositionColors}
          columnHydraulics={columnHydraulics}
          trayCount={8}
          section={false}
          transparent={transparent}
          playing={playing}
          speed={speed}
          motionVisible
          grid={grid}
          onToggleGrid={toggleGrid}
          view={view}
          rotate={false}
          reset={reset}
          focus={focus}
          selectedId={selected}
          dark={dark}
          canvasColor={canvasColor}
          graphicsSettingsContainer={graphicsSettingsContainer}
          workspace
          onSelect={(_, id) => {
            if (id) onSelect(id);
          }}
        />
      ) : (
        <div className="empty-state" role="status">
          The 3D layout could not be arranged. Your flowsheet is preserved;
          continue editing in 2D.
        </div>
      )}
      {selectedHydraulics && (
        <aside
          className="plant-hydraulics-legend"
          aria-label="3D tray hydraulics"
        >
          <strong>{selected} · Sieve tray hydraulics</strong>
          <p>
            {selectedHydraulics.status === "unavailable"
              ? "Rating unavailable — supply fluid properties."
              : `Highest flooding load: ${((selectedHydraulics.maxFloodFraction ?? 0) * 100).toFixed(1)}% · Tray ${selectedHydraulics.limitingTray}`}
          </p>
          {selectedHydraulics.stages.length > 0 && (
            <p>
              {
                selectedHydraulics.stages.filter(
                  (s) => s.weepRatio !== null && s.weepRatio < 1,
                ).length
              }{" "}
              trays with predicted weeping
              {" · "}
              {
                selectedHydraulics.stages.filter(
                  (s) =>
                    Math.max(
                      s.jetFloodFraction ?? 0,
                      s.downcomerFloodFraction,
                    ) >= 1,
                ).length
              }{" "}
              at a flooding limit
              {selectedHydraulics.status === "partial"
                ? " · incomplete rating"
                : ""}
            </p>
          )}
          <small>
            Tray rings: green within limits · blue weeping · amber near flooding
            · red flooding · gray incomplete.
          </small>
          <p>Top tray = 1. Open Properties → Results for each tray.</p>
          <small>
            Fluid motion illustrates predicted conditions; it is not a transient
            flow simulation.
          </small>
        </aside>
      )}
      {layout &&
      project.units.length > 0 &&
      compositionColors.components.length > 0 ? (
        <aside
          className="plant-composition-legend"
          aria-label="3D component colors"
        >
          <strong>Composition</strong>
          <div className="plant-component-swatches">
            {compositionColors.components.map(({ id, name, color }) => (
              <span key={id} title={name}>
                <i style={{ backgroundColor: color }} aria-hidden="true" />
                {name}
              </span>
            ))}
          </div>
          <small>
            Colors blend by mole fraction · gray = unknown or no flow
          </small>
        </aside>
      ) : null}
      {layout && project.units.length > 0 ? (
        <div className="plant-controls" aria-label="3D display controls">
          <div className="tool-group">
            <button
              aria-label="Reset camera"
              title="Fit plant (F / Home)"
              onClick={() => setReset((value) => value + 1)}
            >
              <Scan size={15} />
              <span>Fit plant</span>
            </button>
            <button
              aria-label="Focus selected equipment"
              title="Focus selected equipment (Shift+F)"
              disabled={!project.units.some((unit) => unit.id === selected)}
              onClick={() => setFocus((value) => value + 1)}
            >
              <Focus size={15} />
              <span>Focus</span>
            </button>
            <select
              aria-label="Camera view"
              value={view}
              onChange={(event) => setView(event.target.value as CameraView)}
            >
              <option value="perspective">Perspective</option>
              <option value="front">Front</option>
              <option value="top">Top</option>
            </select>
            <button
              role="switch"
              aria-label="Transparent shell"
              aria-checked={transparent}
              className={transparent ? "active" : ""}
              onClick={() => setTransparent((value) => !value)}
            >
              <Eye size={15} />
              <span>Transparent shell</span>
            </button>
            <button
              aria-label={playing ? "Pause flow" : "Play flow"}
              title="Illustrative equipment operation"
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
              <span>{playing ? "Pause flow" : "Play flow"}</span>
            </button>
            <select
              aria-label="Flow speed"
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
            >
              {[0.5, 1, 2, 4].map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
          </div>
          {project.units.length > 10 ? (
            <select
              aria-label="Inspect 3D equipment"
              value={
                project.units.some((unit) => unit.id === selected)
                  ? selected!
                  : ""
              }
              onChange={(event) => {
                if (event.target.value) onSelect(event.target.value);
              }}
            >
              <option value="">Inspect equipment…</option>
              {project.units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.id} · {unit.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import { useCallback, useMemo, useState } from "react";
import { Eye, Focus, Pause, Play, Scan } from "lucide-react";
import type { Project } from "@/domain/schema";
import type { Result } from "@/domain/solver";
import EquipmentScene, { type CameraView } from "./equipment-3d/EquipmentScene";
import { buildProjectPlant } from "./equipment-3d/project-plant";
import { projectCompositionColors } from "./equipment-3d/composition-colors";
import { FLUID_PALETTES } from "./equipment-3d/fluid-palettes";
import { useFluidPalette } from "./equipment-3d/useFluidPalette";
import type { TrayHydraulicsResult } from "@/domain/equipment/tray-hydraulics";
import "./tray-hydraulics.css";

export default function Plant3D({
  project,
  result = null,
  selected,
  onSelect,
  onSimulate,
  dark = false,
  canvasColor,
  initialPlaying = true,
  graphicsSettingsContainer,
}: {
  project: Project;
  result?: Result | null;
  selected: string | null;
  onSelect: (id: string) => void;
  onSimulate?: () => void;
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
  const [focusPart, setFocusPart] = useState<"trays" | undefined>();
  const [view, setView] = useState<CameraView>("perspective");
  const { palette, setPalette } = useFluidPalette();
  const compositionColors = useMemo(
    () => projectCompositionColors(project, result, palette.id),
    [project, result, palette.id],
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
  const hydraulicColumns = project.units.filter(
    (unit) =>
      unit.kind === "Distillation" &&
      unit.params.distillation?.method === "mesh" &&
      unit.params.distillation.hydraulics?.enabled,
  );
  // Older projects may have no saved result, and numerical edits invalidate it.
  // Keep that visible instead of silently presenting generic flow as a rated demo.
  const hydraulicColumn =
    hydraulicColumns.find((unit) => unit.id === selected) ??
    (hydraulicColumns.length === 1 ? hydraulicColumns[0] : undefined);
  const selectedHydraulics = hydraulicColumn
    ? columnHydraulics[hydraulicColumn.id]
    : undefined;
  const weepingTrays =
    selectedHydraulics?.stages.filter(
      (stage) => stage.weepRatio !== null && stage.weepRatio < 1,
    ).length ?? 0;
  const floodedTrays =
    selectedHydraulics?.stages.filter(
      (stage) =>
        Math.max(stage.jetFloodFraction ?? 0, stage.downcomerFloodFraction) >=
        1,
    ).length ?? 0;
  function showTrayEffects() {
    if (hydraulicColumn) onSelect(hydraulicColumn.id);
    setTransparent(true);
    setPlaying(true);
    setFocusPart("trays");
    setFocus((value) => value + 1);
  }
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
          focusPart={focusPart}
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
      {hydraulicColumns.length > 0 && (
        <aside
          className="plant-hydraulics-legend"
          aria-label="3D tray hydraulics"
        >
          <strong>
            {hydraulicColumn ? `${hydraulicColumn.id} · ` : ""}Tray hydraulics
          </strong>
          {!hydraulicColumn ? (
            <p>Select a tower to inspect tray effects.</p>
          ) : !selectedHydraulics ? (
            <>
              <p>
                {result && !result.converged
                  ? "Simulation did not converge. Recalculate to rate trays."
                  : "No current hydraulic result. Calculate to rate trays."}
              </p>
              <small>Generic flow illustration.</small>
              {onSimulate && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    onSimulate();
                    showTrayEffects();
                  }}
                >
                  Calculate tray effects
                </button>
              )}
            </>
          ) : (
            <>
              <p>
                {selectedHydraulics.status === "unavailable"
                  ? "Rating unavailable — supply fluid properties."
                  : `Peak flood load: ${((selectedHydraulics.maxFloodFraction ?? 0) * 100).toFixed(1)}% · Tray ${selectedHydraulics.limitingTray}`}
              </p>
              {selectedHydraulics.stages.length > 0 && (
                <p>
                  Trays: {floodedTrays} flooding · {weepingTrays} weeping
                  {selectedHydraulics.status === "partial"
                    ? " · incomplete rating"
                    : ""}
                </p>
              )}
              {(weepingTrays > 0 || floodedTrays > 0) && (
                <>
                  {(!playing || !transparent) && (
                    <p>
                      {!playing ? "Animation paused. " : ""}
                      {!transparent ? "Shell is opaque." : ""}
                    </p>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={showTrayEffects}
                  >
                    Show tray effects
                  </button>
                </>
              )}
              <details className="plant-hydraulics-details">
                <summary>Details</summary>
                {weepingTrays > 0 && (
                  <p>Weeping: droplets fall through tray holes.</p>
                )}
                {floodedTrays > 0 && (
                  <p>Flooding: liquid carried upward between trays.</p>
                )}
                <p>
                  Rings: green within limits · blue weeping · amber near
                  flooding · red flooding · gray incomplete.
                </p>
                <p>Top tray = 1 · Per-tray data: Properties → Results.</p>
                <small>Illustrative motion, not a transient simulation.</small>
              </details>
            </>
          )}
        </aside>
      )}
      {layout &&
      project.units.length > 0 &&
      compositionColors.components.length > 0 ? (
        <aside
          className="plant-composition-legend"
          aria-label="3D component colors"
        >
          <div className="plant-composition-heading">
            <strong title="Colors blend by mole fraction. Gray means unknown or no flow.">
              Composition
            </strong>
            <select
              className="plant-palette-select"
              aria-label="Fluid palette"
              title="Change fluid palette"
              value={palette.id}
              onChange={(event) => setPalette(event.target.value)}
            >
              {FLUID_PALETTES.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="plant-component-swatches">
            {compositionColors.components.map(({ id, name, color }) => (
              <span key={id} title={name}>
                <i style={{ backgroundColor: color }} aria-hidden="true" />
                {name}
              </span>
            ))}
          </div>
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
              onClick={() => {
                setFocusPart(undefined);
                setFocus((value) => value + 1);
              }}
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

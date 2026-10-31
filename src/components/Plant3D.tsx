"use client";

import { useCallback, useMemo, useState } from "react";
import { Eye, Focus, Pause, Play, Scan } from "lucide-react";
import type { Project } from "@/domain/schema";
import EquipmentScene, { type CameraView } from "./equipment-3d/EquipmentScene";
import { buildProjectPlant } from "./equipment-3d/project-plant";

export default function Plant3D({
  project,
  selected,
  onSelect,
  dark = false,
  canvasColor,
  initialPlaying = false,
  graphicsSettingsContainer,
}: {
  project: Project;
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
  const layout = useMemo(() => {
    try {
      return buildProjectPlant(project);
    } catch {
      return null;
    }
  }, [project]);
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
      <div
        className="navigation-hint"
        title="Drag to orbit around selected equipment. Scroll, right/middle drag, or Space + drag to pan. Pinch or Ctrl/Cmd + scroll to zoom at the pointer. Arrow keys pan (Shift moves faster); +/- zoom; F fits the plant; Shift+F focuses selection; P pans; V orbits/selects; G toggles grid; L toggles labels."
      >
        Drag to orbit · Space + drag / scroll to pan · Pinch to zoom · F to fit
      </div>
    </div>
  );
}

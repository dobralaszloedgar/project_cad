"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Box,
  ChevronRight,
  Eye,
  Grid2X2,
  Layers2,
  Maximize,
  Pause,
  Play,
  ScanLine,
  Workflow,
} from "lucide-react";
import type { Kind } from "@/domain/schema";
import { EquipmentIcon, EquipmentPanelIcon } from "@/components/EquipmentIcon";
import NumberInput from "../NumberInput";
import { equipmentCatalog, equipmentGroups } from "./catalog";
import { equipmentReferences } from "./references";
import type { CameraView, SceneMode } from "./EquipmentScene";
import { getSystem, systemExamples, flowColors } from "./systems";
import { columnLayout, columnTrayLimits } from "./column-layout";
import styles from "./sandbox.module.css";

const EquipmentScene = dynamic(() => import("./EquipmentScene"), {
  ssr: false,
  loading: () => (
    <div className={styles.loading}>
      <Box size={28} strokeWidth={1.3} />
      <span>Preparing the 3D studio…</span>
    </div>
  ),
});

export default function EquipmentSandbox() {
  const [kind, setKind] = useState<Kind>("Distillation");
  const [mode, setMode] = useState<SceneMode>("process");
  const [systemId, setSystemId] = useState("integrated");
  const [trayCount, setTrayCount] = useState<number>(columnTrayLimits.default);
  const [systemTrayOverride, setSystemTrayOverride] = useState<number>();
  const [trayDraft, setTrayDraft] = useState(String(columnTrayLimits.default));
  const system = useMemo(
    () => getSystem(systemId, systemTrayOverride),
    [systemId, systemTrayOverride],
  );
  const [section, setSection] = useState(false);
  const [transparent, setTransparent] = useState(true);
  const [rotate, setRotate] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [motionVisible, setMotionVisible] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [grid, setGrid] = useState(true);
  const toggleGrid = useCallback(() => setGrid((value) => !value), []);
  const [view, setView] = useState<CameraView>("perspective");
  const [reset, setReset] = useState(0);
  const detail = equipmentCatalog[kind];
  const reference = equipmentReferences[kind];
  const select = (next: Kind, instanceId?: string) => {
    const item = instanceId
      ? system.equipment.find((item) => item.id === instanceId)
      : undefined;
    if (item?.kind === "Distillation") {
      const count = item.trayCount ?? columnTrayLimits.default;
      setTrayCount(count);
      setTrayDraft(String(count));
    } else setTrayDraft(String(trayCount));
    setKind(next);
    setMode("inspect");
    setView("perspective");
    setReset((n) => n + 1);
  };
  const changeMode = (next: SceneMode) => {
    setMode(next);
    if (next === "process") {
      setTransparent(true);
      setSection(false);
      const counts = [
        ...new Set(
          system.equipment
            .filter((item) => item.kind === "Distillation")
            .map((item) => item.trayCount ?? columnTrayLimits.default),
        ),
      ];
      setTrayCount(counts[0] ?? columnTrayLimits.default);
      setTrayDraft(
        counts.length > 1 ? "" : String(counts[0] ?? columnTrayLimits.default),
      );
    } else setTrayDraft(String(trayCount));
    setView("perspective");
    setReset((n) => n + 1);
  };
  const visibleTrayCounts =
    mode === "process"
      ? [
          ...new Set(
            system.equipment
              .filter((item) => item.kind === "Distillation")
              .map((item) => item.trayCount ?? columnTrayLimits.default),
          ),
        ]
      : [trayCount];
  const title =
    mode === "collection"
      ? "The equipment collection"
      : mode === "process"
        ? system.title
        : detail.title;
  const description =
    mode === "collection"
      ? "Eight distinct assemblies. Select any model to take a closer look."
      : mode === "process"
        ? system.description
        : detail.description;

  return (
    <main className={styles.sandbox}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <EquipmentPanelIcon size={29} />
          <span>Project CAD</span>
        </Link>
        <span className={styles.headerDivider} />
        <span className={styles.breadcrumb}>Equipment sandbox</span>
        <span className={styles.previewTag}>Preview</span>
        <Link
          href="/workspace"
          className={styles.back}
          aria-label="Back to workspace"
        >
          <ArrowLeft size={14} />
          <span>Back to workspace</span>
        </Link>
      </header>
      <div className={styles.body}>
        <aside className={styles.library} aria-label="Equipment library">
          <div className={styles.libraryHeading}>
            <h2>Equipment</h2>
            <span>8 models</span>
          </div>
          <nav className={styles.equipmentList} aria-label="Choose equipment">
            {equipmentGroups.map((group) => (
              <div key={group.title} className={styles.group}>
                <h3>{group.title}</h3>
                {group.kinds.map((item) => (
                  <button
                    key={item}
                    aria-pressed={kind === item && mode === "inspect"}
                    onClick={() => select(item)}
                    className={styles.equipmentButton}
                  >
                    <EquipmentIcon kind={item} size={27} />
                    <span>{equipmentCatalog[item].title}</span>
                    <ChevronRight size={13} className={styles.chevron} />
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className={styles.libraryFoot}>
            <Box size={16} />
            <p>
              Built to explore.
              <br />
              <span>Orbit, inspect, look inside.</span>
            </p>
          </div>
        </aside>
        <section className={styles.studio} aria-label="Equipment studio">
          <div className={styles.studioToolbar}>
            <div className={styles.segmented} aria-label="Scene layout">
              <button
                aria-pressed={mode === "inspect"}
                onClick={() => changeMode("inspect")}
              >
                <Box size={15} />
                <span>Inspect</span>
              </button>
              <button
                aria-pressed={mode === "collection"}
                onClick={() => changeMode("collection")}
              >
                <Grid2X2 size={15} />
                <span>All equipment</span>
              </button>
              <button
                aria-pressed={mode === "process"}
                onClick={() => changeMode("process")}
              >
                <Workflow size={15} />
                <span>Process preview</span>
              </button>
            </div>
            <button
              className={styles.gridButton}
              aria-pressed={grid}
              aria-label="Show floor grid"
              title="Show floor grid"
              onClick={() => setGrid(!grid)}
            >
              <Grid2X2 size={16} />
            </button>
          </div>
          {mode === "process" ? (
            <label className={styles.systemPicker}>
              <span>System example</span>
              <select
                value={systemId}
                onChange={(event) => {
                  setSystemId(event.target.value);
                  setSystemTrayOverride(undefined);
                  setTrayCount(columnTrayLimits.default);
                  const counts = [
                    ...new Set(
                      systemExamples
                        .find((item) => item.id === event.target.value)
                        ?.equipment.filter(
                          (item) => item.kind === "Distillation",
                        )
                        .map(
                          (item) => item.trayCount ?? columnTrayLimits.default,
                        ),
                    ),
                  ];
                  setTrayDraft(
                    counts.length > 1
                      ? ""
                      : String(counts[0] ?? columnTrayLimits.default),
                  );
                  setTransparent(true);
                  setSection(false);
                  setView("perspective");
                  setRotate(false);
                  setReset((n) => n + 1);
                }}
              >
                {[
                  { label: "Large systems", large: true },
                  { label: "Process basics", large: false },
                ].map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {systemExamples
                      .filter(
                        (item) => item.equipment.length > 10 === group.large,
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
          ) : null}
          <div className={styles.stageHeading}>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <div className={styles.motionBar} aria-label="Operation controls">
            <button
              className={styles.playButton}
              aria-pressed={playing}
              onClick={() => {
                if (!motionVisible && !section) setTransparent(true);
                setMotionVisible(true);
                setPlaying(!playing);
              }}
              title={
                !motionVisible
                  ? "Play equipment operation with visible internals"
                  : undefined
              }
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
              {playing ? "Pause operation" : "Play operation"}
            </button>
            <div className={styles.speedControls} aria-label="Playback speed">
              {[0.5, 1, 2, 4].map((rate) => (
                <button
                  key={rate}
                  aria-pressed={speed === rate}
                  aria-label={`Playback speed ${rate}×`}
                  onClick={() => setSpeed(rate)}
                >
                  {rate}×
                </button>
              ))}
            </div>
            <span className={styles.motionCaption}>Operating preview</span>
          </div>
          <div
            className={styles.viewport}
            data-mode={mode}
            data-system={systemId}
            data-trays={trayCount}
            data-equipment={kind}
            data-section={section}
            data-transparent={transparent}
            data-playing={playing}
          >
            <EquipmentScene
              kind={kind}
              mode={mode}
              system={system}
              trayCount={trayCount}
              section={section}
              transparent={transparent}
              rotate={rotate}
              playing={playing}
              speed={speed}
              motionVisible={motionVisible}
              grid={grid}
              onToggleGrid={toggleGrid}
              view={view}
              reset={reset}
              onSelect={select}
            />
          </div>
          <div className={styles.stageBottom}>
            <div className={styles.cameraTools} aria-label="Camera controls">
              <button
                aria-label="Reset view"
                title="Reset view"
                onClick={() => {
                  setView("perspective");
                  setReset((n) => n + 1);
                }}
              >
                <Maximize size={16} />
                {mode === "process" ? <span>Fit system</span> : null}
              </button>
              <span />
              <button
                aria-pressed={view === "perspective"}
                onClick={() => {
                  setView("perspective");
                  setReset((n) => n + 1);
                }}
              >
                3D
              </button>
              <button
                aria-pressed={view === "front"}
                onClick={() => {
                  setView("front");
                  setReset((n) => n + 1);
                  setRotate(false);
                }}
              >
                Front
              </button>
              <button
                aria-pressed={view === "top"}
                onClick={() => {
                  setView("top");
                  setReset((n) => n + 1);
                  setRotate(false);
                }}
              >
                Top
              </button>
            </div>
            <button
              className={styles.rotateButton}
              aria-pressed={rotate}
              onClick={() => {
                setRotate(!rotate);
                setView("perspective");
              }}
            >
              {rotate ? <Pause size={14} /> : <Play size={14} />}
              <span>{rotate ? "Pause" : "Auto rotate"}</span>
            </button>
          </div>
        </section>
        <aside className={styles.details} aria-label="Model details">
          <div className={styles.detailHeading}>
            <Eye size={16} />
            <h2>{mode === "inspect" ? "Model details" : "Scene details"}</h2>
          </div>
          {mode === "inspect" ? (
            <>
              <div className={styles.identity}>
                <EquipmentIcon kind={kind} size={38} />
                <span>{detail.tag}</span>
              </div>
              <h3 className={styles.assembly}>{detail.assembly}</h3>
              <p className={styles.detailIntro}>
                Purpose-built geometry for the {detail.title.toLowerCase()} in
                your flowsheet.
              </p>
              <div className={styles.featureList}>
                {detail.features.map(([name, text]) => (
                  <div className={styles.feature} key={name}>
                    <span
                      className={styles.featureDot}
                      style={{ backgroundColor: detail.color }}
                    />
                    <div>
                      <h4>{name}</h4>
                      <p>
                        {kind === "Distillation" && name === "Column internals"
                          ? `${trayCount} trays with alternating downcomers`
                          : kind === "Distillation" && name === "Service access"
                            ? `${columnLayout({ trayCount }).platforms.length} railed platform${columnLayout({ trayCount }).platforms.length === 1 ? "" : "s"} and access ladder`
                            : text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className={styles.sceneDescription}>
              <h3>
                {mode === "collection"
                  ? "One visual language. Eight identities."
                  : system.site
                    ? "Compact plant layout."
                    : "From flowsheet to equipment."}
              </h3>
              {mode === "process" && system.site ? (
                <p>
                  Equipment grouped around a shared overhead pipe rack, with
                  access aisles and a separate receiver bay. The equipment
                  footprint is{" "}
                  {Math.round(
                    (1 -
                      system.site.equipmentArea /
                        system.site.previousEquipmentArea) *
                      100,
                  )}
                  % smaller than the previous row layout.
                </p>
              ) : null}
              <p>
                {mode === "collection"
                  ? "Stainless steel, recognizable silhouettes, and equipment-specific internals. Click a model or its label to inspect it."
                  : system.operation}
              </p>
              {mode === "process" ? (
                <details
                  className={styles.connectionDetails}
                  key={systemId}
                  open={system.equipment.length <= 10}
                >
                  <summary>
                    {system.equipment.length} equipment ·{" "}
                    {system.streams.length} connections
                  </summary>
                  <div className={styles.processKey}>
                    {system.streams.map((stream) => (
                      <span className={styles.processStep} key={stream.id}>
                        {
                          system.equipment.find(
                            (item) => item.id === stream.from[0],
                          )!.title
                        }
                        <ChevronRight size={12} />
                        {
                          system.equipment.find(
                            (item) => item.id === stream.to[0],
                          )!.title
                        }
                      </span>
                    ))}
                  </div>
                </details>
              ) : null}
              {mode === "process" ? (
                <label className={styles.inspectPicker}>
                  <span>Inspect equipment</span>
                  <select
                    value=""
                    onChange={(event) => {
                      const item = system.equipment.find(
                        (entry) => entry.id === event.target.value,
                      );
                      if (item) select(item.kind, item.id);
                    }}
                  >
                    <option value="" disabled>
                      Select equipment to inspect
                    </option>
                    {system.equipment.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.tag} · {item.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          )}
          {(mode === "inspect" && kind === "Distillation") ||
          mode === "collection" ||
          (mode === "process" &&
            system.equipment.some((item) => item.kind === "Distillation")) ? (
            <form
              className={styles.columnControl}
              onSubmit={(event) => {
                event.preventDefault();
                const next = Number(trayDraft);
                if (
                  Number.isInteger(next) &&
                  next >= columnTrayLimits.min &&
                  next <= columnTrayLimits.max
                ) {
                  setTrayCount(next);
                  if (mode === "process") setSystemTrayOverride(next);
                  setReset((n) => n + 1);
                }
              }}
            >
              <label htmlFor="column-tray-count">Number of trays</label>
              <div>
                <NumberInput
                  id="column-tray-count"
                  aria-label="Number of trays"
                  min={columnTrayLimits.min}
                  max={columnTrayLimits.max}
                  integer
                  required
                  value={trayDraft}
                  placeholder={
                    visibleTrayCounts.length > 1 ? "Per column" : undefined
                  }
                  onValueChange={(_value, text) => setTrayDraft(text)}
                />
                <button type="submit">Apply</button>
              </div>
              <p>
                {visibleTrayCounts.join(" / ")} trays
                {mode === "process" &&
                system.equipment.filter((item) => item.kind === "Distillation")
                  .length > 1
                  ? visibleTrayCounts.length > 1
                    ? " across columns"
                    : " per column"
                  : ""}{" "}
                · shell, fittings and flow resize together.
                {visibleTrayCounts.length > 1
                  ? " Apply one count to resize all columns."
                  : ""}
              </p>
            </form>
          ) : null}
          <div className={styles.sectionControl}>
            <button
              className={styles.sectionToggle}
              role="switch"
              aria-checked={transparent}
              aria-label="Transparent shell"
              onClick={() => {
                setTransparent(!transparent);
                if (!transparent) setSection(false);
              }}
            >
              <Eye size={17} />
              <span>Transparent shell</span>
              <span className={styles.switchTrack}>
                <span />
              </span>
            </button>
            <p>
              See liquid and moving parts through equipment shells and
              connecting pipes.
            </p>
            <button
              className={styles.sectionToggle}
              role="switch"
              aria-checked={section}
              aria-label="Section view"
              onClick={() => {
                setSection(!section);
                if (!section) setTransparent(false);
              }}
            >
              <Layers2 size={17} />
              <span>Section view</span>
              <span className={styles.switchTrack}>
                <span />
              </span>
            </button>
            <p>
              {mode === "inspect"
                ? detail.section
                : "Open the equipment shells to explore the components inside."}
            </p>
          </div>
          <div className={styles.operationNote}>
            <h3>How it operates</h3>
            <p>
              {mode === "inspect"
                ? reference.operation
                : mode === "process"
                  ? "Play to follow the continuous current inside the transparent pipes. Stronger waves, cascading films and bubbling reveal the operation. Colors distinguish illustrated streams."
                  : "Play all eight assemblies together, or select one to explore its motion up close."}
            </p>
          </div>
          {mode === "inspect" ? (
            <div className={styles.reference}>
              <h3>Design reference</h3>
              <a href={reference.url} target="_blank" rel="noreferrer">
                {reference.name}
                <ArrowUpRight size={13} />
              </a>
              <p>{reference.detail}</p>
            </div>
          ) : null}
          {mode === "process" ? (
            <div className={styles.flowLegend} aria-label="Stream colors">
              <h3>Liquid colors</h3>
              <div>
                <i style={{ background: flowColors.feed }} />
                Feed / blend
              </div>
              <div>
                <i style={{ background: flowColors.warm }} />
                Heated liquid
              </div>
              <div>
                <i style={{ background: flowColors.cool }} />
                Additive / cooled liquid
              </div>
            </div>
          ) : null}
          <div className={styles.finishLegend}>
            <h3>Material palette</h3>
            <div>
              <span className={styles.swatchSteel} />
              Stainless steel
            </div>
            <div>
              <span className={styles.swatchProcess} />
              Process fittings
            </div>
            <div>
              <span className={styles.swatchUtility} />
              Thermal components
            </div>
          </div>
          <div className={styles.detailFoot}>
            <ScanLine size={15} />
            <p>
              Illustrative equipment models.
              <br />
              Not fabrication drawings.
            </p>
          </div>
        </aside>
      </div>
      <footer className={styles.footer}>
        <span>
          <span className={styles.statusDot} />
          Local equipment sandbox
        </span>
        <span>8 models · interactive 3D</span>
        <span className={styles.footerHint}>
          Select equipment to explore <ArrowUpRight size={12} />
        </span>
      </footer>
    </main>
  );
}

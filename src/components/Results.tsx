"use client";
import { useState } from "react";
import {
  ChartNoAxesCombined,
  History,
  Maximize2,
  Minimize2,
  RotateCcw,
  X,
} from "lucide-react";
import { type Project } from "@/domain/schema";
import { type Result, simulate } from "@/domain/solver";
import { type Revision, diff } from "@/lib/revisions";
import { defaultThermo, modelInfo } from "@/domain/thermo/registry";
import { buildResultsReport } from "@/lib/results-report";
import { useUnitSystem } from "./useUnitSystem";
import ResultsOverview from "./ResultsOverview";
import ResultsExportButton from "./ResultsExportButton";
import "./results.css";
const fmt = (n: number, digits = 3) =>
  n.toLocaleString("en-US", { maximumFractionDigits: digits });
export default function Results({
  project,
  result,
  revisions,
  tab,
  onTab,
  onRestore,
  compareId,
  onCompare,
  onSelect,
  onRun,
  onClose,
}: {
  project: Project;
  result: Result | null;
  revisions: Revision[];
  tab: string;
  onTab: (s: string) => void;
  onRestore: (r: Revision) => void;
  compareId: string;
  onCompare: (s: string) => void;
  onSelect: (s: string) => void;
  onRun: () => void;
  onClose: () => void;
}) {
  const display = useUnitSystem();
  const [expanded, setExpanded] = useState(false);
  const report = result ? buildResultsReport(project, result, display) : null;
  const baseline = revisions.find((r) => r.id === compareId);
  const changes = baseline ? diff(baseline.project, project) : null;
  let previous: Result | null = null;
  if (baseline && tab === "Revisions") {
    try {
      previous = simulate(baseline.project);
    } catch {
      /* An incomplete revision may not be solvable. */
    }
  }
  return (
    <section
      className="panel results"
      data-expanded={expanded}
      aria-label="Simulation results"
    >
      <div className="results-header">
        <div className="results-title-row">
          <div className="results-title-icon">
            <ChartNoAxesCombined size={22} />
          </div>
          <div className="results-title">
            <h2>
              {tab === "Results" ? "Simulation results" : "Revision history"}
            </h2>
            <p title={project.name}>{project.name}</p>
          </div>
          <div className="results-header-actions">
            <ResultsExportButton report={report} />
            <button
              type="button"
              className="results-icon-button results-expand"
              aria-label={expanded ? "Restore results size" : "Expand results"}
              title={expanded ? "Restore size" : "Expand results"}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
            <button
              type="button"
              className="results-icon-button"
              aria-label="Close Results"
              title="Close results"
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <div
          className="tabs results-navigation"
          role="group"
          aria-label="Results sections"
        >
          <button
            className={tab === "Results" ? "active" : ""}
            aria-pressed={tab === "Results"}
            onClick={() => onTab("Results")}
          >
            <ChartNoAxesCombined size={15} /> Results
          </button>
          <button
            className={tab === "Revisions" ? "active" : ""}
            aria-pressed={tab === "Revisions"}
            onClick={() => onTab("Revisions")}
          >
            <History size={14} /> Revisions <span>{revisions.length}</span>
          </button>
        </div>
      </div>
      {tab === "Results" ? (
        <ResultsOverview
          project={project}
          result={result}
          report={report}
          onSelect={onSelect}
          onRun={onRun}
        />
      ) : (
        <div className="revision-content">
          <div className="comparison">
            <label>
              Compare current project with
              <select
                className="select"
                value={compareId}
                onChange={(e) => onCompare(e.target.value)}
              >
                <option value="">Choose a revision</option>
                {revisions.map((r, i) => (
                  <option key={r.id} value={r.id}>
                    {i + 1}. {r.label}
                  </option>
                ))}
              </select>
            </label>
            {changes ? (
              <>
                <p>
                  <span className="added-text">
                    +{changes.added.length} added
                  </span>{" "}
                  · {changes.changed.length} modified · {changes.removed.length}{" "}
                  removed
                </p>
                <p>
                  Streams: +{changes.streamsAdded} / −{changes.streamsRemoved}
                </p>
                {changes.modelChanged && (
                  <p>
                    Thermodynamic settings changed:{" "}
                    {
                      modelInfo(
                        (baseline!.project.thermo ?? defaultThermo).modelId,
                      ).name
                    }{" "}
                    →{" "}
                    {modelInfo((project.thermo ?? defaultThermo).modelId).name}
                  </p>
                )}
                <p>
                  Equipment:{" "}
                  {[...changes.added, ...changes.changed, ...changes.removed]
                    .map((n) => n.id)
                    .join(", ") || "No equipment changes"}
                </p>
                {previous && result ? (
                  <p className="delta">
                    Conversion {fmt(previous.conversion * 100, 2)}% →{" "}
                    {fmt(result.conversion * 100, 2)}%<br />
                    Net duty {display.format(previous.heatDuty, "power")} →{" "}
                    {display.format(result.heatDuty, "power")}
                  </p>
                ) : (
                  <p className="muted">
                    Run the current process to compare calculated KPIs.
                  </p>
                )}
              </>
            ) : (
              <p className="muted">
                Compare topology, operating conditions and calculated KPIs.
                Restore appends a revision and preserves later work.
              </p>
            )}
          </div>
          <div className="revision-list">
            {[...revisions].reverse().map((r) => (
              <div className="revision-row" key={r.id}>
                <History size={17} />
                <div>
                  <strong>{r.label}</strong>
                  <small>
                    {new Date(r.time).toLocaleTimeString()} ·{" "}
                    {r.project.units.length} units / {r.project.edges.length}{" "}
                    streams
                  </small>
                </div>
                <button className="btn btn-sm" onClick={() => onRestore(r)}>
                  <RotateCcw size={13} /> Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

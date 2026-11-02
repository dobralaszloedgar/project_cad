"use client";

import { useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FileChartColumn,
  Flame,
  FlaskConical,
  Gauge,
  Play,
  Scale,
  Search,
  X,
} from "lucide-react";
import type { Project } from "@/domain/schema";
import type { Result } from "@/domain/solver";
import { componentNames, mixtureName } from "@/domain/thermo/catalog";
import { defaultThermo, modelInfo } from "@/domain/thermo/registry";
import { formatReportCell, type ResultsReport } from "@/lib/results-report";
import { useUnitSystem } from "./useUnitSystem";

const fmt = (n: number, digits = 3) =>
  n.toLocaleString("en-US", { maximumFractionDigits: digits });

export default function ResultsOverview({
  project,
  result,
  report,
  onSelect,
  onRun,
}: {
  project: Project;
  result: Result | null;
  report: ResultsReport | null;
  onSelect: (id: string) => void;
  onRun: () => void;
}) {
  const display = useUnitSystem();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"conditions" | "composition" | "equipment">(
    "conditions",
  );
  const names = componentNames(project.thermo ?? defaultThermo);
  if (!result || !report)
    return (
      <div className="results-empty">
        <div className="results-empty-art">
          <FileChartColumn size={36} />
          <span>
            <Activity size={17} />
          </span>
        </div>
        <span className="results-eyebrow">YOUR PROCESS, IN NUMBERS</span>
        <h3>See the whole picture.</h3>
        <p>
          Run your simulation to explore stream properties, compare equipment
          duties, and check your process balances.
        </p>
        <button
          type="button"
          className="results-run"
          aria-label="Calculate results"
          onClick={onRun}
        >
          <Play size={15} fill="currentColor" /> Run simulation
        </button>
        <div className="results-empty-formats">
          <FileChartColumn size={15} /> Ready to export to Excel, PDF, PNG, CSV,
          or TXT
        </div>
      </div>
    );
  const table = report[view];
  const normalized = query.trim().toLowerCase();
  const rows = table.rows
    .map((cells, index) => ({ cells, index }))
    .filter(({ cells, index }) => {
      const edge = project.edges[index];
      const search =
        view === "equipment"
          ? cells.slice(0, 3).join(" ")
          : `${cells[0]} ${edge.id} ${edge.source} ${edge.target}`;
      return search.toLowerCase().includes(normalized);
    });
  const warnings = report.warnings;
  const logs = result.history.map((v) => Math.log10(Math.max(v, 1e-12)));
  const high = Math.max(...logs, -9);
  const low = Math.min(...logs, -9) - 0.5;
  const chartY = (log: number) =>
    14 + ((high - log) / Math.max(high - low, 1)) * 72;
  const points = logs
    .map(
      (v, i) => `${10 + (i / Math.max(logs.length - 1, 1)) * 236},${chartY(v)}`,
    )
    .join(" ");
  return (
    <>
      <div className="results-context">
        <span
          className={`results-status ${result.converged ? "is-converged" : "is-warning"}`}
        >
          {result.converged ? (
            <CheckCircle2 size={14} />
          ) : (
            <CircleAlert size={14} />
          )}
          {report.status}
        </span>
        <span>{project.edges.length} streams</span>
        <span>{project.units.length} equipment</span>
        <span className="results-context-units">
          <Gauge size={13} /> {display.label} units
        </span>
      </div>
      {!result.converged && (
        <div className="results-unconverged" role="note">
          <CircleAlert size={18} />
          <p>
            <strong>These results have not converged.</strong> Review the
            recycle residual and model notes before using them. Exports carry
            this status.
          </p>
        </div>
      )}
      <div className="kpi-row results-metrics">
        {[
          {
            label: `Conversion of ${names[0] ?? "first component"}`,
            value: fmt(result.conversion * 100, 2),
            unit: "%",
            icon: FlaskConical,
            detail: "Overall fresh-feed basis",
            tone: "conversion",
          },
          {
            label: "Net heat duty",
            value: fmt(display.value(result.heatDuty, "power"), 3),
            unit: display.quantityLabel("power"),
            icon: Flame,
            detail: "Positive adds heat to process",
            tone: "heat",
          },
          {
            label: "Mass balance residual",
            value: display
              .value(result.massResidual, "massFlow")
              .toExponential(2),
            unit: display.quantityLabel("massFlow"),
            icon: Scale,
            detail: "Products minus fresh feeds",
            tone: "balance",
          },
        ].map(({ label, value, unit, icon: Icon, detail, tone }) => (
          <div className={`kpi results-metric ${tone}`} key={tone}>
            <div className="results-metric-label">
              <span>{label}</span>
              <Icon size={18} />
            </div>
            <strong>
              {value}
              <span>{unit}</span>
            </strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>
      <div className="results-main-grid">
        <div className="stream-table results-data-card">
          <div className="results-table-heading">
            <div>
              <h3>
                {view === "equipment" ? "Equipment duties" : "Stream explorer"}
              </h3>
              <p title={mixtureName(project.thermo ?? defaultThermo)}>
                {mixtureName(project.thermo ?? defaultThermo)}
              </p>
            </div>
            <span className="results-count">
              {table.rows.length} {view === "equipment" ? "units" : "streams"}
            </span>
          </div>
          <div className="results-table-toolbar">
            <div
              className="results-data-tabs"
              role="group"
              aria-label="Result data"
            >
              {(
                [
                  ["conditions", "Conditions"],
                  ["composition", "Composition"],
                  ["equipment", "Equipment"],
                ] as const
              ).map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={view === id}
                  onClick={() => setView(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="results-search">
              <Search size={15} />
              <input
                type="search"
                aria-label="Search results"
                placeholder={
                  view === "equipment" ? "Find equipment…" : "Find a stream…"
                }
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear result search"
                  onClick={() => setQuery("")}
                >
                  <X size={13} />
                </button>
              )}
            </label>
          </div>
          <div
            className="results-table-scroll"
            role="region"
            aria-label={table.title}
            tabIndex={0}
          >
            <table
              className="table results-data-table"
              aria-label={table.title}
            >
              <thead>
                <tr>
                  {table.headers.map((header, index) => (
                    <th
                      key={header}
                      scope="col"
                      className={index === 0 ? "results-sticky-cell" : ""}
                    >
                      {header.includes(" (") ? (
                        <>
                          {header.slice(0, header.lastIndexOf(" ("))}
                          <small>
                            {header.slice(header.lastIndexOf(" (") + 2, -1)}
                          </small>
                        </>
                      ) : view === "composition" ? (
                        header.replace(" fraction", "")
                      ) : (
                        header
                      )}{" "}
                      {view === "composition" && index > 0 && (
                        <small>mole fraction</small>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ cells, index }) => {
                  const item =
                    view === "equipment"
                      ? project.units[index]
                      : project.edges[index];
                  const edge = project.edges[index];
                  return (
                    <tr key={item.id}>
                      {cells.map((cell, column) => (
                        <td
                          key={column}
                          className={column === 0 ? "results-sticky-cell" : ""}
                        >
                          {column === 0 ? (
                            <button
                              type="button"
                              className="stream-link results-stream-link"
                              onClick={() => onSelect(item.id)}
                              title={`Inspect ${cell}`}
                            >
                              <span>
                                <strong>{String(cell)}</strong>
                                {view !== "equipment" && (
                                  <small>
                                    {edge.source}
                                    <ArrowRight size={10} />
                                    {edge.target}
                                  </small>
                                )}
                              </span>
                              <ArrowDownRight size={14} />
                            </button>
                          ) : view === "conditions" && column === 4 && cell ? (
                            <span className="results-phase" data-phase={cell}>
                              {String(cell)}
                            </span>
                          ) : (
                            formatReportCell(cell)
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && (
              <div className="results-no-matches">
                <Search size={23} />
                <strong>
                  {query ? "No matching results" : "No results to show"}
                </strong>
                <p>
                  {query
                    ? "Try a stream name or equipment tag."
                    : "Add equipment and connect your process to see results here."}
                </p>
                {query && (
                  <button type="button" onClick={() => setQuery("")}>
                    Clear search
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="results-table-footer">
            <span>
              {rows.length} of {table.rows.length}{" "}
              {view === "equipment" ? "equipment" : "streams"}
            </span>
            <span>
              {view === "composition"
                ? "Fractions on a molar basis"
                : "Select a name to inspect"}
            </span>
          </div>
        </div>
        <aside
          className={`diagnostics results-diagnostics ${result.converged ? "" : "warning"}`}
          aria-label="Calculation diagnostics"
        >
          <div className="results-diagnostics-label">
            <Activity size={16} /> SOLVER HEALTH
          </div>
          <h3>{report.status}</h3>
          <p>
            {result.tearId
              ? `Solved in ${result.iterations} recycle iterations`
              : "Acyclic process · one evaluation"}
          </p>
          <dl>
            <div>
              <dt>Scaled recycle residual</dt>
              <dd>{result.residual.toExponential(2)}</dd>
            </div>
            <div>
              <dt>Energy balance residual</dt>
              <dd>
                {display.value(result.energyResidual, "power").toExponential(2)}{" "}
                <small>{display.quantityLabel("power")}</small>
              </dd>
            </div>
          </dl>
          {result.history.length > 1 && (
            <div className="results-convergence">
              <span>
                Recycle convergence <small>log scale</small>
              </span>
              <svg
                viewBox="0 0 256 108"
                role="img"
                aria-label="Logarithmic recycle residual history"
              >
                <line
                  x1="10"
                  x2="246"
                  y1={chartY(-9)}
                  y2={chartY(-9)}
                  stroke="currentColor"
                  strokeDasharray="4 4"
                  opacity=".25"
                />
                <polyline
                  points={points}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <text x="10" y="104">
                  1
                </text>
                <text x="246" y="104" textAnchor="end">
                  {result.history.length}
                </text>
              </svg>
              <small>
                Tolerance 10⁻⁹ · {result.history.length} iterations shown
              </small>
            </div>
          )}
          <div className="results-model">
            <span>THERMODYNAMIC MODEL</span>
            <strong>{modelInfo(result.provenance.modelId).name}</strong>
            <small>Version {result.provenance.modelVersion}</small>
          </div>
        </aside>
      </div>
      <details className="limitations results-evidence">
        <summary>
          <span className="results-evidence-icon">
            <CircleAlert size={18} />
          </span>
          <span>
            <strong>Model limits & calculation evidence</strong>
            <small>
              {warnings.length
                ? `${warnings.length} model ${warnings.length === 1 ? "note" : "notes"} · review assumptions and data sources`
                : "Calculation provenance and solver settings"}
            </small>
          </span>
          <span className="results-evidence-count">{warnings.length}</span>
          <ChevronDown size={17} />
        </summary>
        <div className="results-evidence-body">
          {warnings.length > 0 && (
            <ul>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          <dl>
            <div>
              <dt>Data version</dt>
              <dd>{result.provenance.dataVersion}</dd>
            </div>
            <div>
              <dt>Kernel</dt>
              <dd>{result.provenance.kernelHash}</dd>
            </div>
            {result.provenance.parameterHash && (
              <div>
                <dt>Parameters</dt>
                <dd>{result.provenance.parameterHash}</dd>
              </div>
            )}
          </dl>
          <p>
            Recycle convergence uses scaled component flows, temperature, and
            pressure changes; tolerance 10⁻⁹, maximum 500 iterations. Energy
            balance includes formation enthalpy.
          </p>
        </div>
      </details>
      <div className="results-footnote">
        <span>Calculated for the current revision</span>
        <span>Exports include all streams and the selected units.</span>
      </div>
    </>
  );
}

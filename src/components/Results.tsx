"use client";
import {
  FlaskConical,
  Flame,
  Scale,
  History,
  FileChartColumn,
  RotateCcw,
} from "lucide-react";
import { type Project } from "@/domain/schema";
import { flow, type Result, simulate } from "@/domain/solver";
import { type Revision, diff } from "@/lib/revisions";
import { defaultThermo, modelInfo } from "@/domain/thermo/registry";
import { componentFlows } from "@/domain/stream-composition";
import {
  componentNames,
  mixtureName,
  thermoContext,
} from "@/domain/thermo/catalog";
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
}) {
  const names = componentNames(project.thermo ?? defaultThermo);
  const [firstComponent] = names;
  const componentIds =
    result?.provenance.chemicalIds ??
    (project.thermo?.mixture === "catalog" && !project.thermo.catalog
      ? []
      : thermoContext(project.thermo ?? defaultThermo).ids);
  const baseline = revisions.find((r) => r.id === compareId);
  const changes = baseline ? diff(baseline.project, project) : null;
  let previous: Result | null = null;
  if (baseline)
    try {
      previous = simulate(baseline.project);
    } catch {}
  return (
    <section className="panel results">
      <div className="results-header">
        <h2>{tab === "Results" ? "Simulation results" : "Revision history"}</h2>
        <div className="tabs">
          <button
            className={tab === "Results" ? "active" : ""}
            onClick={() => onTab("Results")}
          >
            Results
          </button>
          <button
            className={tab === "Revisions" ? "active" : ""}
            onClick={() => onTab("Revisions")}
          >
            <History size={14} /> Revisions <span>{revisions.length}</span>
          </button>
        </div>
      </div>
      {tab === "Results" ? (
        <>
          <div className="kpi-row">
            {[
              {
                label: `Conversion of ${firstComponent}`,
                value: result ? `${fmt(result.conversion * 100, 2)}%` : "—",
                icon: FlaskConical,
                detail: "Overall fresh-feed basis",
              },
              {
                label: "Net heat duty",
                value: result ? `${fmt(result.heatDuty / 1000)} kW` : "—",
                icon: Flame,
                detail: "Positive adds heat to process",
              },
              {
                label: "Mass balance residual",
                value: result
                  ? `${result.massResidual.toExponential(2)} kg/s`
                  : "—",
                icon: Scale,
                detail: "Products minus fresh feeds",
              },
            ].map((k) => (
              <div className="kpi" key={k.label}>
                <k.icon size={19} />
                <span>{k.label}</span>
                <strong>{k.value}</strong>
                <small>{result ? k.detail : "Run to calculate"}</small>
              </div>
            ))}
          </div>
          <div className="result-detail">
            <div className="stream-table">
              <h3>
                Stream table{" "}
                <small>
                  SI units · {mixtureName(project.thermo ?? defaultThermo)}
                </small>
              </h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Stream</th>
                    <th>Flow (mol/s)</th>
                    <th>Temp. (K)</th>
                    {names.map((name) => (
                      <th key={name}>{name} fraction</th>
                    ))}
                    <th>Phase</th>
                    <th>Vapor fraction</th>
                  </tr>
                </thead>
                <tbody>
                  {project.edges.map((e) => {
                    const s = result?.streams[e.id];
                    return (
                      <tr key={e.id} onClick={() => onSelect(e.id)}>
                        <td>
                          <button
                            className="stream-link"
                            onClick={() => onSelect(e.id)}
                          >
                            {e.name ?? e.id}
                          </button>
                        </td>
                        <td>{s ? fmt(flow(s), 4) : "—"}</td>
                        <td>{s ? fmt(s.temperature, 2) : "—"}</td>
                        {names.map((name, i) => (
                          <td key={name}>
                            {s && flow(s) > 0
                              ? fmt(
                                  componentFlows(s, componentIds)[
                                    componentIds[i]
                                  ] / flow(s),
                                  4,
                                )
                              : "—"}
                          </td>
                        ))}
                        <td>{result?.properties[e.id]?.phase ?? "—"}</td>
                        <td>
                          {result?.properties[e.id]?.vaporFraction != null
                            ? fmt(result.properties[e.id].vaporFraction!, 4)
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div
              className={`diagnostics ${result && !result.converged ? "warning" : ""}`}
            >
              {result ? (
                <>
                  <h3>{result.converged ? "Converged" : "Not converged"}</h3>
                  <p>
                    {modelInfo(result.provenance.modelId).name} ·{" "}
                    {result.provenance.modelVersion}
                  </p>
                  <p>
                    {result.tearId
                      ? `${result.iterations} recycle iterations`
                      : "Acyclic · one evaluation"}
                  </p>
                  <dl>
                    <dt>Scaled recycle residual</dt>
                    <dd>{result.residual.toExponential(2)}</dd>
                    <dt>Energy balance residual</dt>
                    <dd>{result.energyResidual.toExponential(2)} W</dd>
                  </dl>
                  {result.history.length > 1 ? (
                    <svg
                      className="residual-chart"
                      viewBox="0 0 200 50"
                      role="img"
                      aria-label="Logarithmic recycle residual history"
                    >
                      <polyline
                        points={result.history
                          .map(
                            (v, i) =>
                              `${(i / (result.history.length - 1)) * 198 + 1},${Math.min(49, Math.max(1, (-Math.log10(Math.max(v, 1e-12)) / 10) * 48 + 1))}`,
                          )
                          .join(" ")}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </svg>
                  ) : null}
                </>
              ) : (
                <>
                  <FileChartColumn size={34} />
                  <h3>Run to calculate</h3>
                  <p>
                    Stream properties, heat duties and balance diagnostics
                    appear here.
                  </p>
                </>
              )}
            </div>
          </div>
          {result ? (
            <details className="limitations">
              <summary>
                Model limits & calculation evidence ({result.warnings.length})
              </summary>
              <ul>
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              <p>
                Data:{" "}
                <span title={result.provenance.dataVersion}>
                  {result.provenance.dataVersion.slice(0, 20)}
                </span>
                . Kernel: {result.provenance.kernelHash.slice(0, 12)}.{" "}
                {result.provenance.parameterHash
                  ? `Parameters: ${result.provenance.parameterHash.slice(0, 12)}.`
                  : ""}
              </p>
              <p>
                Recycle convergence uses scaled A, B, temperature and pressure
                changes; tolerance 10⁻⁹, maximum 500 iterations. Energy balance
                includes formation enthalpy. Finite precision residuals are
                shown above.
              </p>
            </details>
          ) : (
            <p className="results-note">
              Ideal models only. Calculations have not been run for this
              revision.
            </p>
          )}
        </>
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
                    Net duty {fmt(previous.heatDuty / 1000)} →{" "}
                    {fmt(result.heatDuty / 1000)} kW
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

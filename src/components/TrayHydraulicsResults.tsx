"use client";
import {
  hydraulicStateLabels,
  type TrayHydraulicsResult,
} from "@/domain/equipment/tray-hydraulics";
import { useUnitSystem } from "./useUnitSystem";
import "./tray-hydraulics.css";

export function TrayHydraulicsResults({
  result,
}: {
  result: TrayHydraulicsResult;
}) {
  const display = useUnitSystem();
  const percent = (x: number | null) =>
    x === null ? "Unrated" : `${(100 * x).toFixed(1)}%`;
  const velocity = (x: number | null) =>
    x === null ? "Unrated" : `${x.toPrecision(3)} m/s`;
  return (
    <section
      className="tray-hydraulics-results"
      aria-label="Tray hydraulic rating"
    >
      <h3>Tray hydraulic rating</h3>
      <p className="equipment-help">
        Sieve trays ·{" "}
        {result.status === "rated"
          ? "All trays rated"
          : result.status === "partial"
            ? "Incomplete rating"
            : "Rating unavailable"}
        . Flooding begins at an estimated 100% of a limit; 80% is a warning.
        Weeping is predicted below a velocity ratio of 1. These diagnostics do
        not change the separation calculation.
      </p>
      {result.stages.length > 0 && (
        <>
          <dl className="equipment-result-values">
            <div>
              <dt>Highest flooding load</dt>
              <dd>
                {percent(result.maxFloodFraction)} · Tray {result.limitingTray}
              </dd>
            </div>
            <div>
              <dt>Lowest weeping velocity ratio</dt>
              <dd>{result.minimumWeepRatio?.toFixed(2) ?? "Unrated"}</dd>
            </div>
          </dl>
          <div
            className="tray-hydraulics-map"
            aria-label="Hydraulic state by tray, top to bottom"
          >
            {result.stages.map((s) => (
              <span
                key={s.stage}
                data-state={s.state}
                title={`Tray ${s.stage}: ${hydraulicStateLabels[s.state]}`}
              >
                <b>{s.stage}</b>
                <span>{hydraulicStateLabels[s.state]}</span>
              </span>
            ))}
          </div>
          <div className="equipment-table-scroll">
            <table
              className="equipment-stream-results"
              aria-label="Tray hydraulics profile"
            >
              <thead>
                <tr>
                  <th>Tray</th>
                  <th>State</th>
                  <th>Jet flood</th>
                  <th>Downcomer backup limit</th>
                  <th>Weeping velocity ratio</th>
                </tr>
              </thead>
              <tbody>
                {result.stages.map((s) => (
                  <tr key={s.stage}>
                    <th>{s.stage}</th>
                    <td>
                      {hydraulicStateLabels[s.state]}
                      {s.notes.length > 0 && " · incomplete"}
                    </td>
                    <td>{percent(s.jetFloodFraction)}</td>
                    <td>{percent(s.downcomerFloodFraction)}</td>
                    <td>{s.weepRatio?.toFixed(2) ?? "Unrated"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>Hydraulic velocities, levels and pressure drop</summary>
            <div className="equipment-table-scroll">
              <table
                className="equipment-stream-results"
                aria-label="Hydraulic calculation details"
              >
                <thead>
                  <tr>
                    <th>Tray</th>
                    <th>Net vapor velocity</th>
                    <th>Flood velocity</th>
                    <th>Hole velocity</th>
                    <th>Weep onset</th>
                    <th>Clear liquid</th>
                    <th>Downcomer backup</th>
                    <th>Rated tray ΔP</th>
                  </tr>
                </thead>
                <tbody>
                  {result.stages.map((s) => (
                    <tr key={s.stage}>
                      <th>{s.stage}</th>
                      <td>{velocity(s.vaporVelocity)}</td>
                      <td>{velocity(s.floodVelocity)}</td>
                      <td>{velocity(s.holeVelocity)}</td>
                      <td>{velocity(s.weepVelocity)}</td>
                      <td>
                        {display.format(s.clearLiquidHeight, "length", 3)}
                      </td>
                      <td>{display.format(s.downcomerBackup, "length", 3)}</td>
                      <td>
                        {display.format(
                          s.pressureDropPa,
                          "pressureDifference",
                          3,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="equipment-help">
              Rated ΔP is diagnostic; the MESH pressure profile still uses your
              specified column pressure drop. Levels and velocities beyond a
              predicted limit are only screening estimates.
            </p>
          </details>
        </>
      )}
      <details open={result.status !== "rated"}>
        <summary>Hydraulic assumptions and limits</summary>
        <ul>
          {result.warnings.map((text) => (
            <li key={text}>{text}</li>
          ))}
          {result.stages.flatMap((s) =>
            s.notes.map((text) => (
              <li key={`${s.stage}-${text}`}>
                Tray {s.stage}: {text}
              </li>
            )),
          )}
        </ul>
        <p className="equipment-help">
          Basis: liquid density{" "}
          {result.config.liquidDensity
            ? display.format(result.config.liquidDensity, "density")
            : "not supplied"}
          ; surface tension{" "}
          {result.config.surfaceTension
            ? display.format(result.config.surfaceTension, "surfaceTension")
            : "not supplied"}
          .{" "}
          <a
            href="https://libpf.com/posts/2012-03-05-sieve-tray-flooding-correlation/"
            target="_blank"
            rel="noreferrer"
          >
            Fair capacity fit
          </a>
          {" · "}
          <a
            href="https://archive.nptel.ac.in/content/storage2/courses/103103027/module7/lec2/1.html"
            target="_blank"
            rel="noreferrer"
          >
            Tray hydraulic equations
          </a>
          {" · "}
          <a
            href="https://www.chemengonline.com/entrainment-flooding-and-weeping-velocities/"
            target="_blank"
            rel="noreferrer"
          >
            Weeping graph
          </a>
        </p>
      </details>
    </section>
  );
}

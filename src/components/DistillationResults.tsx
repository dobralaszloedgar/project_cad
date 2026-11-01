"use client";
import type { DistillationResult } from "@/domain/equipment/distillation";
import { useUnitSystem } from "./useUnitSystem";
import { TrayHydraulicsResults } from "./TrayHydraulicsResults";

export function DistillationResults({
  result,
  names,
}: {
  result: DistillationResult;
  names: Record<string, string>;
}) {
  const display = useUnitSystem();
  const f = (n: number) => Number(n.toPrecision(6)).toString();
  const metrics =
    result.method === "fug"
      ? [
          ["Minimum equilibrium stages", f(result.minimumStages)],
          ["Estimated equilibrium stages", String(result.theoreticalStages)],
          ["Minimum reflux ratio", f(result.minimumRefluxRatio)],
          ["Operating reflux ratio", f(result.refluxRatio)],
          [
            "Rectifying vapor flow",
            display.format(result.rectifyingVaporMolS, "molarFlow"),
          ],
          [
            "Stripping vapor flow",
            display.format(result.strippingVaporMolS, "molarFlow"),
          ],
        ]
      : [
          ["Equilibrium trays", String(result.stages.length - 2)],
          ["Condenser duty", display.format(result.condenserDutyW, "power")],
          ["Reboiler duty", display.format(result.reboilerDutyW, "power")],
          ["Solver evaluations", String(result.iterations)],
          [
            "Maximum material residual",
            result.residuals.material.toExponential(2),
          ],
          [
            "Maximum equilibrium residual",
            result.residuals.equilibrium.toExponential(2),
          ],
          ["Maximum energy residual", result.residuals.energy.toExponential(2)],
          [
            "Maximum summation residual",
            result.residuals.summation.toExponential(2),
          ],
        ];
  return (
    <section
      className="equipment-section"
      aria-label="Distillation calculation results"
    >
      <h3>
        {result.method === "fug"
          ? "FUG shortcut design"
          : "MESH equilibrium stages"}
      </h3>
      <dl className="equipment-result-values">
        {[
          [
            "Condenser type",
            result.condenserType === "partial"
              ? "Equilibrium condenser (partial)"
              : "Total condenser",
          ],
          ...metrics,
          [
            "Distillate flow",
            display.format(result.distillateMolS, "molarFlow"),
          ],
          ["Bottoms flow", display.format(result.bottomsMolS, "molarFlow")],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {result.method === "fug" ? (
        <p className="equipment-help">
          Stage estimate includes the equilibrium reboiler and{" "}
          {result.condenserType === "partial"
            ? "the equilibrium condenser"
            : "excludes the total condenser"}
          . Installed trays and feed location do not constrain FUG.
        </p>
      ) : (
        <>
          <p className="equipment-help">
            Tray numbering excludes condenser and reboiler. Condenser liquid
            flow is reflux; reboiler liquid flow is bottoms. Positive duty adds
            heat.{" "}
            {result.condenserType === "partial"
              ? "Condenser vapor flow is the distillate product."
              : "Distillate is liquid; condenser vapor composition is incipient vapor only."}
          </p>
          <div className="equipment-table-scroll">
            <table
              className="equipment-stream-results"
              aria-label="MESH stage profile"
            >
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Temperature</th>
                  <th>Pressure</th>
                  <th>Liquid flow</th>
                  <th>Vapor flow</th>
                </tr>
              </thead>
              <tbody>
                {result.stages.map((s) => (
                  <tr key={s.stage}>
                    <th>
                      {s.kind === "tray"
                        ? `Tray ${s.stage}${s.stage === result.feedTray ? " · Feed" : ""}`
                        : s.kind === "condenser"
                          ? "Condenser"
                          : "Reboiler"}
                    </th>
                    <td>{display.format(s.temperatureK, "temperature", 3)}</td>
                    <td>{display.format(s.pressurePa, "pressure", 3)}</td>
                    <td>{display.format(s.liquidMolS, "molarFlow", 4)}</td>
                    <td>{display.format(s.vaporMolS, "molarFlow", 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>Stage compositions and enthalpies</summary>
            <div className="equipment-table-scroll">
              <table className="equipment-stream-results">
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Liquid h (J/mol)</th>
                    <th>Vapor h (J/mol)</th>
                    {result.componentIds.flatMap((id) => [
                      <th key={`${id}-x`}>x · {names[id] ?? id}</th>,
                      <th key={`${id}-y`}>y · {names[id] ?? id}</th>,
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {result.stages.map((s) => (
                    <tr key={s.stage}>
                      <th>{s.stage}</th>
                      <td>{f(s.liquidEnthalpy)}</td>
                      <td>{f(s.vaporEnthalpy)}</td>
                      {result.componentIds.flatMap((id, i) => [
                        <td key={`${id}-x`}>{f(s.liquidComposition[i])}</td>,
                        <td key={`${id}-y`}>{f(s.vaporComposition[i])}</td>,
                      ])}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      {result.method === "mesh" && result.hydraulics && (
        <TrayHydraulicsResults result={result.hydraulics} />
      )}
      <details>
        <summary>Calculation assumptions</summary>
        <ul>
          {[...new Set(result.warnings)].map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
        <small>{result.solverVersion}</small>
      </details>
    </section>
  );
}

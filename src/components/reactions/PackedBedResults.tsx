import type { Chemical } from "@/domain/thermo/data";
import type { PackedBedResult } from "@/domain/reactions/packed-bed";
import type { PackedBedConfig } from "@/domain/reactions/schema";
import { ReactionEquation } from "./ReactionEquation";
import { useUnitSystem } from "../useUnitSystem";

const format = (value: number) =>
  Number(value.toPrecision(7)).toLocaleString("en-US", {
    maximumSignificantDigits: 7,
  });

export function PackedBedResults({
  result,
  chemicals,
  config,
}: {
  result: PackedBedResult;
  chemicals: Chemical[];
  config: PackedBedConfig;
}) {
  const display = useUnitSystem();
  const inlet = result.profile[0].flows;
  const total = Object.values(result.flows).reduce((sum, n) => sum + n, 0);
  function downloadProfile() {
    const rows = [
      [
        `Catalyst mass (${display.quantityLabel("mass")})`,
        "Conversion",
        `Pressure (${display.quantityLabel("pressure")})`,
        ...chemicals.map(
          (c) => `${c.name} (${display.quantityLabel("molarFlow")})`,
        ),
      ],
      ...result.profile.map((point) => [
        display.value(point.catalystMass, "mass"),
        point.conversion,
        display.value(point.pressure, "pressure"),
        ...chemicals.map((c) => display.value(point.flows[c.id], "molarFlow")),
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "reactor-profile.csv";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="equipment-section reactor-results">
      <h3>Reaction results</h3>
      {result.warnings?.map((warning) => (
        <p className="equipment-help" role="alert" key={warning}>
          {warning}
        </p>
      ))}
      <dl className="equipment-result-values">
        <div>
          <dt>
            {config.sizingMode === "target-conversion"
              ? "Required catalyst mass"
              : "Catalyst mass"}
          </dt>
          <dd>
            {format(display.value(result.catalystMass, "mass"))}{" "}
            {display.quantityLabel("mass")}
          </dd>
        </div>
        <div>
          <dt>Conversion basis</dt>
          <dd>
            {chemicals.find((c) => c.id === config.conversionComponentId)?.name}
          </dd>
        </div>
        <div>
          <dt>Outlet pressure</dt>
          <dd>
            {format(display.value(result.pressure, "pressure"))}{" "}
            {display.quantityLabel("pressure")}
          </dd>
        </div>
      </dl>
      <div className="equipment-table-scroll">
        <table
          className="equipment-stream-results"
          aria-label="Reactor species balance"
        >
          <thead>
            <tr>
              <th>Component</th>
              <th>Inlet ({display.quantityLabel("molarFlow")})</th>
              <th>Outlet ({display.quantityLabel("molarFlow")})</th>
              <th>Change ({display.quantityLabel("molarFlow")})</th>
              <th>Outlet fraction</th>
              <th>Conversion (%)</th>
            </tr>
          </thead>
          <tbody>
            {chemicals.map((chemical) => (
              <tr key={chemical.id}>
                <th>{chemical.name}</th>
                <td>
                  {format(display.value(inlet[chemical.id], "molarFlow"))}
                </td>
                <td>
                  {format(
                    display.value(result.flows[chemical.id], "molarFlow"),
                  )}
                </td>
                <td>
                  {format(
                    display.value(
                      result.flows[chemical.id] - inlet[chemical.id],
                      "molarFlow",
                    ),
                  )}
                </td>
                <td>
                  {total ? format(result.flows[chemical.id] / total) : "—"}
                </td>
                <td>
                  {inlet[chemical.id] > 0
                    ? format(
                        100 *
                          (1 - result.flows[chemical.id] / inlet[chemical.id]),
                      )
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="equipment-table-scroll">
        <table
          className="equipment-stream-results"
          aria-label="Reaction extents"
        >
          <thead>
            <tr>
              <th>Reaction</th>
              <th>Equation</th>
              <th>Extent ({display.quantityLabel("molarFlow")})</th>
            </tr>
          </thead>
          <tbody>
            {config.reactions.map((reaction) => (
              <tr key={reaction.id}>
                <th>
                  {reaction.name}
                  {reaction.enabled ? "" : " · disabled"}
                </th>
                <td>
                  <ReactionEquation reaction={reaction} chemicals={chemicals} />
                </td>
                <td>
                  {format(
                    display.value(
                      result.extents[reaction.id] ?? 0,
                      "molarFlow",
                    ),
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="equipment-help">
        Conversion is the overall disappearance of each inlet species across all
        reactions. A negative value means net production; — means the species is
        absent from the inlet.
      </p>
      <button className="btn btn-sm" type="button" onClick={downloadProfile}>
        Export bed profile (CSV)
      </button>
    </section>
  );
}

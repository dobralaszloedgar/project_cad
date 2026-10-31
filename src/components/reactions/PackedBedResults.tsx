import type { Chemical } from "@/domain/thermo/data";
import type { PackedBedResult } from "@/domain/reactions/packed-bed";
import type { PackedBedConfig } from "@/domain/reactions/schema";
import { reactionEquation } from "@/domain/reactions/validation";

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
  const inlet = result.profile[0].flows;
  const total = Object.values(result.flows).reduce((sum, n) => sum + n, 0);
  function downloadProfile() {
    const rows = [
      [
        "Catalyst mass (kg)",
        "Conversion",
        "Pressure (Pa)",
        ...chemicals.map((c) => `${c.name} (mol/s)`),
      ],
      ...result.profile.map((point) => [
        point.catalystMass,
        point.conversion,
        point.pressure,
        ...chemicals.map((c) => point.flows[c.id]),
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
      <dl className="equipment-result-values">
        <div>
          <dt>
            {config.sizingMode === "target-conversion"
              ? "Required catalyst mass"
              : "Catalyst mass"}
          </dt>
          <dd>{format(result.catalystMass)} kg</dd>
        </div>
        <div>
          <dt>Conversion basis</dt>
          <dd>
            {chemicals.find((c) => c.id === config.conversionComponentId)?.name}
          </dd>
        </div>
        <div>
          <dt>Outlet pressure</dt>
          <dd>{format(result.pressure / 1000)} kPa</dd>
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
              <th>Inlet (mol/s)</th>
              <th>Outlet (mol/s)</th>
              <th>Change (mol/s)</th>
              <th>Outlet fraction</th>
            </tr>
          </thead>
          <tbody>
            {chemicals.map((chemical) => (
              <tr key={chemical.id}>
                <th>{chemical.name}</th>
                <td>{format(inlet[chemical.id])}</td>
                <td>{format(result.flows[chemical.id])}</td>
                <td>
                  {format(result.flows[chemical.id] - inlet[chemical.id])}
                </td>
                <td>
                  {total ? format(result.flows[chemical.id] / total) : "—"}
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
              <th>Extent (mol/s)</th>
            </tr>
          </thead>
          <tbody>
            {config.reactions.map((reaction) => (
              <tr key={reaction.id}>
                <th>
                  {reaction.name}
                  {reaction.enabled ? "" : " · disabled"}
                </th>
                <td>{reactionEquation(reaction, chemicals)}</td>
                <td>{format(result.extents[reaction.id] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn btn-sm" type="button" onClick={downloadProfile}>
        Export bed profile (CSV)
      </button>
    </section>
  );
}

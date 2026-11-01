import type { Reaction } from "@/domain/reactions/schema";
import { useUnitSystem } from "../useUnitSystem";

export function KineticsSource({
  source,
}: {
  source: NonNullable<Reaction["kineticsSource"]>;
}) {
  const display = useUnitSystem();
  const range = (
    values: [number, number],
    dimension: "temperature" | "pressure",
  ) =>
    `${values
      .map((value) => Number(display.value(value, dimension).toPrecision(7)))
      .filter((value, i, all) => i === 0 || value !== all[0])
      .join("–")} ${display.quantityLabel(dimension)}`;
  return (
    <details className="kinetics-source">
      <summary>Kinetics source and limits</summary>
      <div>
        <a href={source.url} target="_blank" rel="noreferrer">
          {source.citation}
        </a>
        <p>{source.locator}</p>
        <dl>
          <div>
            <dt>Catalyst</dt>
            <dd>{source.catalyst}</dd>
          </div>
          <div>
            <dt>Studied temperature</dt>
            <dd>{range(source.temperatureRange, "temperature")}</dd>
          </div>
          <div>
            <dt>Studied pressure</dt>
            <dd>{range(source.pressureRange, "pressure")}</dd>
          </div>
          <div>
            <dt>Rate units</dt>
            <dd>{source.rateBasis}</dd>
          </div>
        </dl>
        <p>{source.notes}</p>
        <p className="equipment-help">
          Source for the original template; edits may differ.
        </p>
      </div>
    </details>
  );
}

"use client";
import { Fragment, useState } from "react";
import { Trash2, Info } from "lucide-react";
import { type Project, type Connection, unitSchema } from "@/domain/schema";
import { type Result, flow } from "@/domain/solver";
import { componentFlows } from "@/domain/stream-composition";
import { componentNames } from "@/domain/thermo/catalog";
import { defaultThermo } from "@/domain/thermo/registry";
import EquipmentEditor from "./EquipmentEditor";
import { STREAM_COLOR_LABELS, streamColor } from "./stream-colors";
interface Props {
  project: Project;
  selected: string | null;
  result: Result | null;
  onChange: (p: Project, label: string) => void;
  onError: (m: string) => void;
}
function StreamInspector({
  project,
  edge,
  result,
  onChange,
}: Pick<Props, "project" | "result" | "onChange"> & { edge: Connection }) {
  const names = componentNames(project.thermo ?? defaultThermo);
  const [firstComponent, secondComponent] = names;
  const ids = result?.provenance.chemicalIds ?? [];
  const [name, setName] = useState(edge.name ?? "");
  const [tab, setTab] = useState<"Setup" | "Results">("Setup");
  const update = (
    patch: Partial<Pick<Connection, "name" | "colorIndex">>,
    label: string,
  ) =>
    onChange(
      {
        ...project,
        edges: project.edges.map((stream) =>
          stream.id === edge.id ? { ...stream, ...patch } : stream,
        ),
      },
      label,
    );
  const s = result?.streams[edge.id];
  const properties = result?.properties[edge.id];
  return (
    <aside className="panel inspector stream-inspector">
      <div
        className="inspector-tabs"
        role="tablist"
        aria-label="Stream properties"
      >
        {(["Setup", "Results"] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            id={`stream-tab-${item}`}
            aria-controls={`stream-panel-${item}`}
            aria-selected={tab === item}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="stream-panel-Setup"
        aria-labelledby="stream-tab-Setup"
        hidden={tab !== "Setup"}
      >
        <h3>Connections</h3>
        <p className="muted">
          {edge.source} / {edge.sourcePort === "out2" ? "Outlet 2" : "Outlet"} →{" "}
          {edge.target} / {edge.targetPort === "in2" ? "Inlet 2" : "Inlet"}
        </p>
        <form
          className="stream-name-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) update({ name: name.trim() }, "Rename stream");
          }}
        >
          <label>
            Name
            <input
              className="input"
              aria-label="Stream name"
              value={name}
              required
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button
            className="btn wide"
            type="submit"
            disabled={!name.trim() || name.trim() === edge.name}
          >
            Save name
          </button>
        </form>
        <section className="stream-color-section">
          <h3>Color</h3>
          <p className="muted">
            Auto groups streams by composition. Choose a palette color for this
            stream only.
          </p>
          <div
            className="stream-color-picker"
            role="group"
            aria-label="Stream color"
          >
            <button
              type="button"
              className="stream-color-choice"
              aria-label="Auto stream color"
              aria-pressed={edge.colorIndex === undefined}
              onClick={() =>
                update({ colorIndex: undefined }, "Reset stream color")
              }
            >
              Auto
            </button>
            {STREAM_COLOR_LABELS.map((label, index) => (
              <button
                key={label}
                type="button"
                className="stream-color-choice"
                aria-label={`${label} stream color`}
                aria-pressed={edge.colorIndex === index}
                onClick={() =>
                  update({ colorIndex: index }, "Change stream color")
                }
              >
                <span
                  className="stream-color-chip"
                  aria-hidden="true"
                  style={{ backgroundColor: streamColor(index) }}
                />
              </button>
            ))}
          </div>
        </section>
      </div>
      <div
        role="tabpanel"
        id="stream-panel-Results"
        aria-labelledby="stream-tab-Results"
        hidden={tab !== "Results"}
      >
        {s ? (
          <dl className="facts">
            <dt>Molar flow</dt>
            <dd>{flow(s).toFixed(4)} mol/s</dd>
            <dt>Temperature</dt>
            <dd>{s.temperature.toFixed(2)} K</dd>
            <dt>Pressure</dt>
            <dd>{(s.pressure / 1000).toFixed(3)} kPa</dd>
            {names.length === 2 ? (
              <>
                <dt>
                  {firstComponent} / {secondComponent} flow
                </dt>
                <dd>
                  {s.a.toFixed(3)} / {s.b.toFixed(3)} mol/s
                </dd>
              </>
            ) : (
              names.map((name, i) => (
                <Fragment key={name}>
                  <dt>{name} flow</dt>
                  <dd>{componentFlows(s, ids)[ids[i]].toFixed(5)} mol/s</dd>
                </Fragment>
              ))
            )}
            <dt>Ideal gas volume*</dt>
            <dd>
              {properties?.gasMolarVolume != null
                ? `${(properties.gasMolarVolume * flow(s)).toFixed(5)} m³/s`
                : "Unavailable for liquid / mixed phase"}
            </dd>
            <dt>Phase</dt>
            <dd>{properties?.phase ?? "—"}</dd>
            <dt>Vapor fraction</dt>
            <dd>
              {properties?.vaporFraction != null
                ? properties.vaporFraction.toFixed(5)
                : "Undefined"}
            </dd>
            {(["liquid", "vapor"] as const).flatMap((phase) =>
              names.map((name, i) => {
                const values =
                  phase === "liquid"
                    ? properties?.liquidComposition
                    : properties?.vaporComposition;
                return values ? (
                  <Fragment key={`${phase}-${name}`}>
                    <dt>
                      {phase === "liquid" ? "Liquid" : "Vapor"} {name} fraction
                    </dt>
                    <dd>{values[i].toFixed(5)}</dd>
                  </Fragment>
                ) : null;
              }),
            )}
          </dl>
        ) : (
          <p className="muted">Run to calculate stream properties.</p>
        )}
        <small>*Gas assumption only; not a liquid volume prediction.</small>
      </div>
      <button
        className="btn danger wide"
        onClick={() =>
          onChange(
            {
              ...project,
              edges: project.edges.filter((e) => e.id !== edge.id),
            },
            "Remove stream",
          )
        }
      >
        <Trash2 size={15} /> Remove stream
      </button>
    </aside>
  );
}

export default function Inspector({
  project,
  selected,
  result,
  onChange,
  onError,
}: Props) {
  const unit = project.units.find((n) => n.id === selected),
    edge = project.edges.find((e) => e.id === selected);
  if (edge)
    return (
      <StreamInspector
        key={edge.id}
        project={project}
        edge={edge}
        result={result}
        onChange={onChange}
      />
    );
  if (!unit)
    return (
      <aside className="panel inspector">
        <h2>Equipment inspector</h2>
        <div className="empty-state">
          <Info />
          <p>Select equipment or a stream to inspect its properties.</p>
        </div>
      </aside>
    );
  return (
    <EquipmentEditor
      key={unit.id}
      unit={unit}
      project={project}
      result={result}
      onApply={(next) => {
        try {
          unitSchema.parse(next);
          onChange(
            {
              ...project,
              units: project.units.map((n) => (n.id === unit.id ? next : n)),
            },
            `Edit ${unit.id}`,
          );
        } catch {
          onError("Check the equipment parameters.");
        }
      }}
      onDuplicate={() =>
        onChange(
          {
            ...project,
            units: [
              ...project.units,
              {
                ...structuredClone(unit),
                id: `${unit.kind}-${crypto.randomUUID().slice(0, 8)}`,
                position: { x: unit.position.x + 50, y: unit.position.y + 160 },
              },
            ],
          },
          "Duplicate equipment",
        )
      }
      onDelete={() =>
        onChange(
          {
            ...project,
            units: project.units.filter((n) => n.id !== unit.id),
            edges: project.edges.filter(
              (e) => e.source !== unit.id && e.target !== unit.id,
            ),
          },
          "Delete equipment",
        )
      }
    />
  );
}

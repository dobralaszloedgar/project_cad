"use client";
import { useState } from "react";
import { Trash2, Copy, Info } from "lucide-react";
import {
  type Unit,
  type Project,
  paramsSchema,
  unitSchema,
} from "@/domain/schema";
import { type Result, flow } from "@/domain/solver";
import {
  defaultThermo,
  modelInfo,
  type ThermoSettings,
} from "@/domain/thermo/registry";
import { sampleMixtures } from "@/domain/thermo/catalog";
import { EquipmentIcon, equipmentLabels } from "./EquipmentIcon";
interface Props {
  project: Project;
  selected: string | null;
  result: Result | null;
  onChange: (p: Project, label: string) => void;
  onError: (m: string) => void;
}
function UnitEditor({
  unit,
  onApply,
  settings,
}: {
  unit: Unit;
  onApply: (u: Unit) => void;
  settings: ThermoSettings;
}) {
  const [params, setParams] = useState(unit.params);
  const [name, setName] = useState(unit.name);
  const [tab, setTab] = useState("Setup");
  const fields: {
    key: keyof Unit["params"];
    label: string;
    min: number;
    max: number;
    step: string;
  }[] = [];
  if (["Feed", "Heater", "Cooler", "PBR"].includes(unit.kind))
    fields.push({
      key: "temperature",
      label: "Temperature (K)",
      min: 250,
      max: 800,
      step: "1",
    });
  if (unit.kind === "Feed")
    fields.push(
      {
        key: "flow",
        label: "Molar flow (mol/s)",
        min: 0.001,
        max: 1000,
        step: "0.1",
      },
      {
        key: "fractionA",
        label: "Mole fraction A",
        min: 0,
        max: 1,
        step: "0.01",
      },
      {
        key: "pressure",
        label: "Pressure (Pa)",
        min: 10000,
        max: 2000000,
        step: "100",
      },
    );
  if (unit.kind === "PBR")
    fields.push({
      key: "residenceTime",
      label: "Residence time (s)",
      min: 0,
      max: 1000,
      step: "0.1",
    });
  if (unit.kind === "Splitter")
    fields.push({
      key: "recycleFraction",
      label: "Secondary outlet fraction",
      min: 0,
      max: 0.95,
      step: "0.05",
    });
  if (unit.kind === "Distillation" && settings.modelId === "ideal-gas")
    fields.push(
      {
        key: "relativeVolatility",
        label: "Relative volatility A/B",
        min: 1.01,
        max: 20,
        step: "0.1",
      },
      {
        key: "distillateFraction",
        label: "Distillate fraction",
        min: 0.01,
        max: 0.99,
        step: "0.01",
      },
    );
  return (
    <>
      <div className="inspector-tabs">
        <button
          className={tab === "Setup" ? "active" : ""}
          onClick={() => setTab("Setup")}
        >
          Setup
        </button>
        <button
          className={tab === "Model" ? "active" : ""}
          onClick={() => setTab("Model")}
        >
          Model
        </button>
      </div>
      {tab === "Setup" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onApply({ ...unit, name, params: paramsSchema.parse(params) });
          }}
        >
          <h3>Operating conditions</h3>
          <label>
            Equipment name
            <input
              className="input"
              value={name}
              maxLength={60}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {fields.map((f) => (
            <label key={f.key}>
              {f.label}
              <input
                className="input"
                type="number"
                required
                min={f.min}
                max={f.max}
                step={f.step}
                value={Number.isNaN(params[f.key]) ? "" : params[f.key]}
                onChange={(e) =>
                  setParams({ ...params, [f.key]: e.target.valueAsNumber })
                }
              />
            </label>
          ))}
          <button className="btn btn-primary wide" type="submit">
            Apply conditions
          </button>
        </form>
      ) : (
        <div className="model-notes">
          <h3>{modelInfo(settings.modelId).name}</h3>
          <p>Components A / B: {sampleMixtures[settings.mixture].name}.</p>
          <p>{modelInfo(settings.modelId).limitations}</p>
          {settings.mixture === "demo" ? (
            <>
              <p>
                A and B are synthetic species with equal molecular weight (28
                g/mol).
              </p>
              <p>
                Constant heat capacity: 30 J/(mol·K). Ideal gas volume: nRT/P.
              </p>
            </>
          ) : (
            <p>
              Sample constant heat capacities. Vapor pressures use
              temperature-bounded Antoine records. Volume is reported only for a
              wholly vapor stream.
            </p>
          )}
          {unit.kind === "PBR" ? (
            <p>
              Isothermal first-order plug flow: X = 1 − exp(−kτ). k(450 K) = 0.1
              s⁻¹; Eₐ = 40 kJ/mol; ΔHᵣ = −20 kJ/mol. User-set residence time is
              independent of flow.
            </p>
          ) : null}
          {unit.kind === "Distillation" && settings.modelId === "ideal-gas" ? (
            <p>
              One ideal equilibrium contact: y = αx / (1 + (α − 1)x). Fixed cut;
              no latent heat or stage design.
            </p>
          ) : null}
          {unit.kind === "Distillation" && settings.modelId !== "ideal-gas" && (
            <p>
              One TP equilibrium flash at feed temperature and pressure. Vapor
              leaves the first outlet; liquid leaves the second. No column
              stages or reflux calculation.
            </p>
          )}
          {unit.kind === "Splitter" ? (
            <p>
              Both species split equally. The secondary outlet fraction is not a
              selective recovery.
            </p>
          ) : null}
          <p>No pressure drop or mechanical certification.</p>
        </div>
      )}
    </>
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
  const settings = project.thermo ?? defaultThermo;
  if (edge) {
    const s = result?.streams[edge.id];
    const properties = result?.properties[edge.id];
    return (
      <aside className="panel inspector">
        <h2>Material stream</h2>
        <p className="muted">{edge.id}</p>
        <p>
          {edge.source} → {edge.target}
        </p>
        <label>
          Stream color
          <select
            className="select"
            value={edge.color}
            onChange={(e) =>
              onChange(
                {
                  ...project,
                  edges: project.edges.map((n) =>
                    n.id === edge.id
                      ? { ...n, color: e.target.value as typeof n.color }
                      : n,
                  ),
                },
                "Change stream color",
              )
            }
          >
            <option value="teal">Teal</option>
            <option value="blue">Blue</option>
            <option value="amber">Amber</option>
          </select>
        </label>
        {s ? (
          <dl className="facts">
            <dt>Molar flow</dt>
            <dd>{flow(s).toFixed(4)} mol/s</dd>
            <dt>Temperature</dt>
            <dd>{s.temperature.toFixed(2)} K</dd>
            <dt>Pressure</dt>
            <dd>{(s.pressure / 1000).toFixed(3)} kPa</dd>
            <dt>A / B flow</dt>
            <dd>
              {s.a.toFixed(3)} / {s.b.toFixed(3)} mol/s
            </dd>
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
            {properties?.liquidComposition && (
              <>
                <dt>Liquid A fraction</dt>
                <dd>{properties.liquidComposition[0].toFixed(5)}</dd>
              </>
            )}
            {properties?.vaporComposition && (
              <>
                <dt>Vapor A fraction</dt>
                <dd>{properties.vaporComposition[0].toFixed(5)}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="muted">Run to calculate stream properties.</p>
        )}
        <small>*Gas assumption only; not a liquid volume prediction.</small>
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
  const eq = result?.equipment[unit.id];
  return (
    <aside className="panel inspector">
      <div className="inspector-title">
        <EquipmentIcon kind={unit.kind} size={32} />
        <div>
          <h2>{equipmentLabels[unit.kind]}</h2>
          <span className="muted">{unit.id}</span>
        </div>
      </div>
      <UnitEditor
        key={JSON.stringify(unit)}
        unit={unit}
        settings={settings}
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
      />
      <div className="info-note">
        <Info size={16} />
        <span>
          {unit.kind === "PBR"
            ? "Ideal isothermal PBR surrogate. Heat duty includes reaction heat."
            : "Ideal teaching model. Inspect Model for assumptions and limits."}
        </span>
      </div>
      {eq ? (
        <div className="equipment-result">
          <h3>Calculated results</h3>
          <p>
            Heat duty <strong>{(eq.duty / 1000).toFixed(3)} kW</strong>
          </p>
          {eq.conversion !== undefined ? (
            <p>
              Single-pass conversion{" "}
              <strong>{(eq.conversion * 100).toFixed(2)}%</strong>
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="inspector-actions">
        <button
          className="btn btn-sm"
          onClick={() =>
            onChange(
              {
                ...project,
                units: [
                  ...project.units,
                  {
                    ...structuredClone(unit),
                    id: `${unit.kind}-${crypto.randomUUID().slice(0, 8)}`,
                    position: {
                      x: unit.position.x + 50,
                      y: unit.position.y + 160,
                    },
                  },
                ],
              },
              "Duplicate equipment",
            )
          }
        >
          <Copy size={14} /> Duplicate
        </button>
        <button
          className="btn btn-sm danger"
          aria-label="Delete equipment"
          onClick={() =>
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
        >
          <Trash2 size={14} />
        </button>
      </div>
    </aside>
  );
}

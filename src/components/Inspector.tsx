"use client";
import { useState } from "react";
import { Trash2, Copy, Info } from "lucide-react";
import { type Unit, type Project, unitSchema } from "@/domain/schema";
import { type Result, flow } from "@/domain/solver";
import {
  defaultThermo,
  modelInfo,
  type ThermoSettings,
} from "@/domain/thermo/registry";
import { mixtureName } from "@/domain/thermo/catalog";
import { EquipmentIcon, equipmentLabels } from "./EquipmentIcon";
import "./equipment-setup.css";
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
  const thermal = unit.kind === "Heater" || unit.kind === "Cooler";
  const fields: {
    key: {
      [K in keyof Unit["params"]]: Unit["params"][K] extends number ? K : never;
    }[keyof Unit["params"]];
    label: string;
    min: number;
    max: number;
    step: string;
  }[] = [];
  if (
    unit.kind === "Feed" ||
    unit.kind === "PBR" ||
    (thermal && params.thermalMode === "temperature")
  )
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
  if (thermal && params.thermalMode === "duty")
    fields.push({
      key: "heatDuty",
      label: "Heat duty (W)",
      min: unit.kind === "Heater" ? 0 : -1e8,
      max: unit.kind === "Cooler" ? 0 : 1e8,
      step: "any",
    });
  if (unit.kind === "PBR" && params.reactorMode === "residence-time")
    fields.push({
      key: "residenceTime",
      label: "Residence time (s)",
      min: 0,
      max: 1000,
      step: "0.1",
    });
  if (unit.kind === "PBR" && params.reactorMode === "catalyst-weight")
    fields.push(
      {
        key: "catalystMass",
        label: "Catalyst mass (kg)",
        min: 0,
        max: 10000,
        step: "any",
      },
      {
        key: "catalystRateConstant",
        label: "Rate constant at 450 K (m³/(kg·s))",
        min: Number.MIN_VALUE,
        max: 10,
        step: "any",
      },
    );
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
        key: "trayCount",
        label: "Visible trays (3D)",
        min: 2,
        max: 80,
        step: "1",
      },
      {
        key: "relativeVolatility",
        label: "Relative volatility A/B",
        min: 1.01,
        max: 20,
        step: "0.01",
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
            onApply({ ...unit, name, params });
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
          {thermal && (
            <>
              <label>
                Thermal specification
                <select
                  className="select"
                  value={params.thermalMode}
                  onChange={(e) =>
                    setParams({
                      ...params,
                      thermalMode: e.target
                        .value as Unit["params"]["thermalMode"],
                    })
                  }
                >
                  <option value="temperature">Outlet temperature</option>
                  <option
                    value="duty"
                    disabled={settings.modelId !== "ideal-gas"}
                  >
                    Specified heat duty
                  </option>
                </select>
              </label>
              <p className="equipment-setup-hint">
                {params.thermalMode === "duty"
                  ? "Positive duty adds heat; negative duty removes heat. Outlet temperature is calculated."
                  : "Heat duty is calculated from the inlet and outlet enthalpy."}
                {settings.modelId !== "ideal-gas" &&
                  " Specified duty requires the ideal-gas model. Use outlet temperature with this model."}
              </p>
            </>
          )}
          {unit.kind === "PBR" && (
            <>
              <label>
                Reaction basis
                <select
                  className="select"
                  value={params.reactorMode}
                  onChange={(e) =>
                    setParams({
                      ...params,
                      reactorMode: e.target
                        .value as Unit["params"]["reactorMode"],
                    })
                  }
                >
                  <option value="catalyst-weight">Catalyst mass</option>
                  <option value="residence-time">Residence time</option>
                </select>
              </label>
              <p className="equipment-setup-hint">
                Synthetic A → B, isothermal ideal gas. A second feed can enter
                through the optional inlet; feeds mix before reaction.
              </p>
              {(settings.mixture !== "demo" ||
                settings.modelId !== "ideal-gas") && (
                <p className="equipment-setup-hint" role="status">
                  This reaction requires the synthetic A/B mixture and ideal-gas
                  model. The selected thermodynamic settings are unsupported.
                </p>
              )}
            </>
          )}
          {unit.kind === "Distillation" && (
            <p className="equipment-model-badge">
              Simplified separation ·{" "}
              {settings.modelId === "ideal-gas"
                ? "single equilibrium contact"
                : "single TP flash"}
            </p>
          )}
          {unit.kind === "Mixer" && (
            <p className="equipment-setup-hint">
              Connect the primary inlet and optionally a second feed. The outlet
              conserves component flows and enthalpy at the lowest flowing inlet
              pressure.
            </p>
          )}
          {unit.kind === "Product" && (
            <p className="equipment-setup-hint">
              Terminal stream. Flow, composition, temperature and pressure come
              from the connected inlet.
            </p>
          )}
          {unit.kind === "Splitter" && (
            <p className="equipment-setup-hint">
              Both outlets retain the inlet composition and state. The primary
              fraction is one minus the secondary fraction.
            </p>
          )}
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
          {unit.kind === "Distillation" ? (
            <p className="muted">
              Visible trays resize the 3D column; the ideal equilibrium
              calculation is unchanged.
            </p>
          ) : null}
          <button className="btn btn-primary wide" type="submit">
            Apply conditions
          </button>
        </form>
      ) : (
        <div className="model-notes">
          <h3>{modelInfo(settings.modelId).name}</h3>
          <p>Components A / B: {mixtureName(settings)}.</p>
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
              temperature-bounded correlations. Volume is reported only for a
              wholly vapor stream.
            </p>
          )}
          {unit.kind === "PBR" && (
            <>
              <p>
                Isothermal A → B with equal molecular weights. Eₐ = 40 kJ/mol;
                ΔHᵣ = −20 kJ/mol. Heat duty includes reaction and sensible heat.
                These kinetic constants describe a synthetic teaching reaction.
              </p>
              {params.reactorMode === "catalyst-weight" ? (
                <p>
                  dFₐ/dW = −k(T)Cₐ; Cₐ = FₐP/(FRT). W is catalyst mass in kg, F
                  is total molar flow in mol/s and k is in m³/(kg·s). k(T) =
                  k₄₅₀ exp[−40000/R (1/T − 1/450)]. The profile integrates
                  species flow along the catalyst mass at fixed T and P.
                </p>
              ) : (
                <p>
                  X = 1 − exp(−kτ), with k(450 K) = 0.1 s⁻¹ and k(T) = 0.1
                  exp[−40000/R (1/T − 1/450)]. User-set residence time is
                  independent of flow.
                </p>
              )}
              <p>No catalyst transport, deactivation or pressure-drop model.</p>
            </>
          )}
          {thermal && (
            <p>
              Q = Hout − Hin, in W. Positive Q adds heat. Outlet-temperature
              mode uses the selected enthalpy method. Specified-duty mode
              supports ideal gas: Tout = Tin + Q / Σ(FᵢCpᵢ), with constant
              component heat capacities and no phase change.
            </p>
          )}
          {unit.kind === "Mixer" && (
            <p>
              Fᵢ,out = Σ Fᵢ,in and Hout = Σ Hin. Outlet pressure equals the
              lowest flowing inlet pressure; no shaft work or heat transfer.
            </p>
          )}
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
              Fᵢ,out2 = f Fᵢ,in and Fᵢ,out = (1 − f) Fᵢ,in. Temperature,
              pressure and phase state are preserved. This is a proportional
              flow split with zero heat duty.
            </p>
          ) : null}
          <p>No pressure drop or mechanical certification.</p>
        </div>
      )}
    </>
  );
}
function CatalystProfile({
  profile,
}: {
  profile: { catalystMass: number; conversion: number }[];
}) {
  if (!profile.length) return null;
  const last = profile[profile.length - 1];
  const maxMass = last.catalystMass || 1;
  const points = profile
    .map(
      (p) =>
        `${42 + (p.catalystMass / maxMass) * 204},${130 - p.conversion * 104}`,
    )
    .join(" ");
  return (
    <figure className="catalyst-profile">
      <figcaption>Conversion along catalyst mass</figcaption>
      <svg
        viewBox="0 0 280 182"
        role="img"
        aria-label={`Conversion reaches ${(last.conversion * 100).toFixed(2)} percent at ${last.catalystMass} kilograms of catalyst`}
      >
        <path d="M42 26H246M42 78H246M42 130H246" className="profile-grid" />
        <path d="M42 26V130H246" className="profile-axis" />
        <polyline points={points} className="profile-line" />
        <text x="34" y="30" textAnchor="end">
          100
        </text>
        <text x="34" y="82" textAnchor="end">
          50
        </text>
        <text x="34" y="134" textAnchor="end">
          0
        </text>
        <text x="42" y="149" textAnchor="middle">
          0
        </text>
        {last.catalystMass > 0 && (
          <text x="246" y="149" textAnchor="middle">
            {last.catalystMass}
          </text>
        )}
        <text x="42" y="14">
          Conversion (%)
        </text>
        <text x="144" y="173" textAnchor="middle">
          Catalyst mass (kg)
        </text>
      </svg>
    </figure>
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
  const productEdge =
    unit.kind === "Product"
      ? project.edges.find((e) => e.target === unit.id)
      : undefined;
  const productStream = productEdge && result?.streams[productEdge.id];
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
            : unit.kind === "Distillation"
              ? "Simplified separation. No stage, reflux or column sizing calculation."
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
          {eq.profile && <CatalystProfile profile={eq.profile} />}
          {productStream && (
            <dl className="facts">
              <dt>Received flow</dt>
              <dd>{flow(productStream).toFixed(4)} mol/s</dd>
              <dt>Temperature</dt>
              <dd>{productStream.temperature.toFixed(2)} K</dd>
              <dt>Pressure</dt>
              <dd>{(productStream.pressure / 1000).toFixed(3)} kPa</dd>
              <dt>A / B flow</dt>
              <dd>
                {productStream.a.toFixed(4)} / {productStream.b.toFixed(4)}{" "}
                mol/s
              </dd>
              <dt>Mole fraction A</dt>
              <dd>
                {flow(productStream)
                  ? (productStream.a / flow(productStream)).toFixed(5)
                  : "Undefined at zero flow"}
              </dd>
            </dl>
          )}
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

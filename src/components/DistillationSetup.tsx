"use client";
import type { Unit } from "@/domain/schema";
import type { ThermoSettings } from "@/domain/thermo/registry";
import { thermoContext } from "@/domain/thermo/catalog";
import {
  defaultDistillation,
  type DistillationConfig,
} from "@/domain/equipment/distillation-schema";
import EngineeringInput from "./EngineeringInput";
import NumberInput from "./NumberInput";
import { useUnitSystem } from "./useUnitSystem";
import { TrayHydraulicsSetup } from "./TrayHydraulicsSetup";

export function DistillationSetup({
  params,
  settings,
  onChange,
}: {
  params: Unit["params"];
  settings: ThermoSettings;
  onChange: (params: Unit["params"]) => void;
}) {
  const { ids, catalog } = thermoContext(settings);
  const display = useUnitSystem();
  const d = params.distillation;
  const change = (patch: Partial<DistillationConfig>) =>
    onChange({ ...params, distillation: { ...d!, ...patch } });
  const number = (
    key: keyof DistillationConfig,
    label: string,
    min: number,
    max: number,
    step = 0.1,
    integer = false,
  ) => (
    <label key={key} data-setup-field={`distillation.${key}`}>
      {label}
      <NumberInput
        aria-label={label}
        value={d![key] as number}
        min={min}
        max={max}
        step={step}
        integer={integer}
        required
        onValueChange={(value) => change({ [key]: value })}
      />
    </label>
  );
  return (
    <section className="equipment-section">
      <h3>Column calculation</h3>
      <label>
        Calculation method
        <select
          className="select"
          aria-label="Column calculation method"
          value={d?.method ?? "legacy"}
          onChange={(e) => {
            const method = e.target.value as "legacy" | "fug" | "mesh";
            onChange({
              ...params,
              distillation:
                method === "legacy"
                  ? undefined
                  : {
                      ...(d ??
                        defaultDistillation(ids, params.relativeVolatility)),
                      method,
                    },
            });
          }}
        >
          <option value="legacy">Single equilibrium contact / TP flash</option>
          <option value="fug">Shortcut design (FUG)</option>
          <option value="mesh">Equilibrium stages (MESH)</option>
        </select>
      </label>
      {d && (
        <>
          <p className="equipment-help">
            {d.method === "fug"
              ? "Fenske–Underwood–Gilliland estimates stages and reflux from key recoveries and supplied relative volatilities. Recoveries are fractions of feed components, not product purities."
              : "Solve material, equilibrium, composition-sum and energy balances on each tray. One feed, a saturated total condenser, and a kettle reboiler; both products are liquid."}
          </p>
          <div className="equipment-field-grid">
            <label>
              Column top pressure ({display.quantityLabel("pressure")})
              <EngineeringInput
                selectUnit
                aria-label="Column top pressure"
                data-setup-field="pressure"
                dimension="pressure"
                value={params.pressure}
                min={10000}
                max={d.method === "mesh" ? 200000 : 2000000}
                required
                onValueChange={(pressure) => onChange({ ...params, pressure })}
              />
            </label>
            {d.method === "fug" ? (
              <>
                {(["lightKey", "heavyKey"] as const).map((key) => (
                  <label key={key} data-setup-field={`distillation.${key}`}>
                    {key === "lightKey" ? "Light key" : "Heavy key"}
                    <select
                      className="select"
                      aria-label={
                        key === "lightKey" ? "Light key" : "Heavy key"
                      }
                      value={d[key] ?? ""}
                      required
                      onChange={(e) => change({ [key]: e.target.value })}
                    >
                      <option value="" disabled>
                        Select component
                      </option>
                      {ids.map((id) => (
                        <option key={id} value={id}>
                          {catalog.get(id).name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                {number(
                  "lightRecovery",
                  "Light-key recovery to distillate",
                  0.000001,
                  0.999999,
                  0.01,
                )}
                {number(
                  "heavyRecovery",
                  "Heavy-key recovery to bottoms",
                  0.000001,
                  0.999999,
                  0.01,
                )}
                {number("feedLiquidFraction", "Feed liquid fraction q", 0, 1)}
                <label>
                  Reflux specification
                  <select
                    className="select"
                    aria-label="Reflux specification"
                    value={d.refluxMode}
                    onChange={(e) =>
                      change({
                        refluxMode: e.target
                          .value as DistillationConfig["refluxMode"],
                      })
                    }
                  >
                    <option value="multiplier">
                      Multiple of minimum reflux
                    </option>
                    <option value="ratio">Operating reflux ratio L/D</option>
                  </select>
                </label>
                {d.refluxMode === "multiplier"
                  ? number(
                      "refluxMultiplier",
                      "Reflux / minimum reflux",
                      1.000001,
                      100,
                    )
                  : number(
                      "refluxRatio",
                      "Operating reflux ratio L/D",
                      0.000001,
                      1000,
                    )}
                {(["distillateTemperature", "bottomsTemperature"] as const).map(
                  (key) => (
                    <label key={key}>
                      {key === "distillateTemperature"
                        ? "Distillate temperature"
                        : "Bottoms temperature"}
                      {` (${display.quantityLabel("temperature")})`}
                      <EngineeringInput
                        selectUnit
                        aria-label={
                          key === "distillateTemperature"
                            ? "Distillate temperature"
                            : "Bottoms temperature"
                        }
                        dimension="temperature"
                        value={d[key]}
                        min={250}
                        max={800}
                        required
                        onValueChange={(value) => change({ [key]: value })}
                      />
                    </label>
                  ),
                )}
              </>
            ) : (
              <>
                {number(
                  "feedTray",
                  "Feed tray (from top)",
                  1,
                  params.trayCount,
                  1,
                  true,
                )}
                {number(
                  "refluxRatio",
                  "Operating reflux ratio L/D",
                  0.000001,
                  1000,
                )}
                <label>
                  Distillate molar flow ({display.quantityLabel("molarFlow")})
                  <EngineeringInput
                    selectUnit
                    aria-label="Distillate molar flow"
                    dimension="molarFlow"
                    value={d.distillateFlow}
                    min={0.000001}
                    max={1000}
                    required
                    onValueChange={(distillateFlow) =>
                      change({ distillateFlow })
                    }
                  />
                </label>
                <label>
                  Total column pressure drop (
                  {display.quantityLabel("pressureDifference")})
                  <EngineeringInput
                    selectUnit
                    aria-label="Total column pressure drop"
                    dimension="pressureDifference"
                    value={d.pressureDrop}
                    min={0}
                    max={199000}
                    required
                    onValueChange={(pressureDrop) => change({ pressureDrop })}
                  />
                </label>
              </>
            )}
          </div>
          {d.method === "fug" ? (
            <>
              <h4>Relative volatilities</h4>
              <p className="equipment-help">
                Supply every active component. Values are normalized to the
                heavy key; keys must be adjacent in volatility order. Feed q and
                product temperatures are supplied assumptions. No
                condenser/reboiler duty is predicted.
              </p>
              <div
                className="equipment-field-grid"
                data-setup-field="distillation.relativeVolatilities"
              >
                {ids.map((id) => (
                  <label
                    key={id}
                    data-setup-field={`distillation.relativeVolatilities.${id}`}
                  >
                    Relative volatility · {catalog.get(id).name}
                    <NumberInput
                      aria-label={`Relative volatility ${catalog.get(id).name}`}
                      value={d.relativeVolatilities[id] ?? ""}
                      min={0.000001}
                      max={1e6}
                      onValueChange={(value) =>
                        change({
                          relativeVolatilities: {
                            ...d.relativeVolatilities,
                            [id]: value,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </>
          ) : (
            <>
              {settings.modelId === "ideal-gas" && (
                <p className="equipment-help" role="status">
                  MESH requires liquid thermodynamics. Select Raoult’s law or
                  Modified UNIFAC 2.0 and real chemicals in project
                  Thermodynamics before calculating.
                </p>
              )}
              <p className="equipment-help">
                The tray count below is the number of ideal equilibrium trays.
                Pressure increases linearly to the reboiler; the feed must reach
                its tray pressure. Every stage needs supported VLE and caloric
                data within 1–200 kPa.
              </p>
              <details>
                <summary>Solver settings</summary>
                <div className="equipment-field-grid">
                  {number(
                    "maxIterations",
                    "Maximum solver evaluations",
                    1,
                    2000,
                    1,
                    true,
                  )}
                  {number(
                    "tolerance",
                    "MESH residual tolerance",
                    1e-12,
                    1e-5,
                    1e-9,
                  )}
                </div>
                <p className="equipment-help">
                  Acceptance never exceeds 1e-7. Failed convergence returns an
                  error. No efficiencies, hydraulic feedback, side draws or
                  liquid–liquid stability search.
                </p>
              </details>
              <TrayHydraulicsSetup
                value={d.hydraulics}
                onChange={(hydraulics) => change({ hydraulics })}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}

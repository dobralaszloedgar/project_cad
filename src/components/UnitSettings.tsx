"use client";

import { useState } from "react";
import {
  Check,
  Gauge,
  RotateCcw,
  Ruler,
  SlidersHorizontal,
} from "lucide-react";
import {
  STANDARD_ATMOSPHERE,
  UNIT_SYSTEMS,
  unitLabel,
  type Dimension,
  type Unit,
  type UnitSystem,
} from "@/domain/unit-definitions";
import { pressureLabel, unitsFor } from "@/domain/unit-preferences";
import { fromSI, inputNumber, toSI } from "@/domain/units";
import { useUnitSystem } from "./useUnitSystem";
import NumberInput from "./NumberInput";
import "./unit-settings.css";

const groups: { title: string; quantities: [Dimension, string][] }[] = [
  {
    title: "Process conditions",
    quantities: [
      ["temperature", "Temperature"],
      ["pressure", "Pressure"],
      ["pressureDifference", "Pressure drop"],
      ["molarFlow", "Molar flow"],
      ["massFlow", "Mass flow"],
      ["volumeFlow", "Volumetric flow"],
    ],
  },
  {
    title: "Energy & heat transfer",
    quantities: [
      ["power", "Heat duty / power"],
      ["enthalpy", "Molar enthalpy / energy"],
      ["specificEnergy", "Specific energy"],
      ["volumetricEnergy", "Fuel heating value"],
      ["temperatureDifference", "Temperature difference"],
      ["conductance", "Thermal conductance (UA)"],
      ["heatTransferCoefficient", "Heat-transfer coefficient (U)"],
      ["foulingResistance", "Fouling resistance"],
    ],
  },
  {
    title: "Geometry & material properties",
    quantities: [
      ["length", "Length"],
      ["area", "Area"],
      ["volume", "Volume"],
      ["mass", "Mass"],
      ["time", "Time"],
      ["molecularWeight", "Molecular weight"],
      ["density", "Density"],
      ["dynamicViscosity", "Dynamic viscosity"],
      ["kinematicViscosity", "Kinematic viscosity"],
      ["heatCapacity", "Specific heat capacity"],
      ["thermalConductivity", "Thermal conductivity"],
      ["surfaceTension", "Surface tension"],
    ],
  },
  {
    title: "Mechanical quantities",
    quantities: [
      ["rotationalSpeed", "Rotational speed"],
      ["torque", "Torque"],
      ["specificPower", "Power per volume"],
    ],
  },
];

export default function UnitSettings() {
  const preferences = useUnitSystem();
  const { preset, units, atmosphere, setSystem, setUnit, setAtmosphere } =
    preferences;
  const [atmosphereUnit, setAtmosphereUnit] = useState<Unit>("atm");
  const [editing, setEditing] = useState<{ text: string; base: number } | null>(
    null,
  );
  const text =
    editing?.base === atmosphere
      ? editing.text
      : String(inputNumber(fromSI(atmosphere, atmosphereUnit)));
  const candidate = text.trim() ? toSI(Number(text), atmosphereUnit) : NaN;
  const invalid = !Number.isFinite(candidate) || candidate <= 0;
  return (
    <section
      id="workspace-units-panel"
      className="unit-settings"
      aria-label="Engineering units"
    >
      <div className="units-intro">
        <div>
          <p>Choose a standard system or fine-tune units for each quantity.</p>
          <span className="units-save-note">
            <Check size={13} aria-hidden="true" /> Changes apply immediately and
            are saved in this browser.
          </span>
        </div>
        <button
          className="btn btn-sm"
          onClick={() => {
            preferences.resetDefaults();
            setAtmosphereUnit("atm");
            setEditing(null);
          }}
        >
          <RotateCcw size={14} aria-hidden="true" /> Restore defaults
        </button>
      </div>
      <div className="units-workbench">
        <aside className="units-sidebar">
          <section className="units-card" aria-label="Standard unit systems">
            <h3>
              <SlidersHorizontal size={16} aria-hidden="true" /> Standard
              systems
            </h3>
            <label className="units-preset-label">
              Unit system
              <select
                className="select"
                aria-label="Unit system"
                value={preset ?? "custom"}
                onChange={(event) =>
                  setSystem(event.target.value as UnitSystem)
                }
              >
                {!preset && (
                  <option value="custom" disabled>
                    Custom
                  </option>
                )}
                {Object.entries(UNIT_SYSTEMS).map(([id, system]) => (
                  <option key={id} value={id}>
                    {system.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="units-preset-preview">
              {preset
                ? UNIT_SYSTEMS[preset].description
                : "Your own combination of units."}
            </p>
            <p>
              Applies to every quantity below. Customize individual units as
              needed.
            </p>
            <button
              className="btn btn-sm units-reset"
              onClick={() => setSystem(preferences.system)}
            >
              Reset to {UNIT_SYSTEMS[preferences.system].label}
            </button>
          </section>
          <section
            className="units-card units-atmosphere"
            aria-label="Gauge pressure reference"
          >
            <h3>
              <Gauge size={16} aria-hidden="true" /> Atmospheric pressure
            </h3>
            <p>Reference for gauge pressures.</p>
            <div className="units-atmosphere-input">
              <NumberInput
                className="input"
                min={Number.MIN_VALUE}
                step={0.01}
                aria-label="Atmospheric pressure"
                aria-invalid={invalid}
                aria-describedby={invalid ? "atmosphere-error" : undefined}
                value={text}
                onValueChange={(_value, text) => {
                  const next = text.trim()
                    ? toSI(Number(text), atmosphereUnit)
                    : NaN;
                  const valid = Number.isFinite(next) && next > 0;
                  setEditing({ text, base: valid ? next : atmosphere });
                  if (valid) setAtmosphere(next);
                }}
              />
              <select
                className="select"
                aria-label="Atmospheric pressure unit"
                value={atmosphereUnit}
                onChange={(event) => {
                  setEditing(null);
                  setAtmosphereUnit(event.target.value as Unit);
                }}
              >
                {unitsFor("pressureDifference").map((unit) => (
                  <option key={unit} value={unit}>
                    {pressureLabel(unit)}
                  </option>
                ))}
              </select>
            </div>
            {invalid && (
              <p id="atmosphere-error" className="units-error" role="alert">
                Enter a finite pressure greater than zero. The previous
                reference is still in use.
              </p>
            )}
            <button
              className="btn btn-sm units-reset"
              onClick={() => {
                setAtmosphere(STANDARD_ATMOSPHERE);
                setAtmosphereUnit("atm");
                setEditing(null);
              }}
            >
              Reset to 1 atm
            </button>
          </section>
        </aside>
        <div className="units-quantities">
          <div className="units-quantity-heading">
            <h3>
              <Ruler size={16} aria-hidden="true" /> Units by quantity
            </h3>
            <span className="units-badge" aria-label="Active unit system">
              {preferences.label}
            </span>
          </div>
          {groups.map((group) => (
            <fieldset className="units-group" key={group.title}>
              <legend>{group.title}</legend>
              <div className="units-grid">
                {group.quantities.map(([dimension, label]) => (
                  <label key={dimension}>
                    <span>{label}</span>
                    <select
                      className="select"
                      aria-label={`${label} display unit`}
                      value={units[dimension]}
                      onChange={(event) =>
                        setUnit(dimension, event.target.value as Unit)
                      }
                    >
                      {dimension === "pressure" ? (
                        <>
                          <optgroup label="Absolute pressure">
                            {unitsFor("pressureDifference").map((unit) => (
                              <option key={unit} value={unit}>
                                {pressureLabel(unit)}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Gauge pressure">
                            {unitsFor("pressure")
                              .filter(
                                (unit) =>
                                  !unitsFor("pressureDifference").includes(
                                    unit,
                                  ),
                              )
                              .map((unit) => (
                                <option key={unit} value={unit}>
                                  {unitLabel(unit)}
                                </option>
                              ))}
                          </optgroup>
                        </>
                      ) : (
                        unitsFor(dimension).map((unit) => (
                          <option key={unit} value={unit}>
                            {unitLabel(unit)}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
    </section>
  );
}

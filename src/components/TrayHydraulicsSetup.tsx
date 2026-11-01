"use client";
import {
  defaultTrayHydraulics,
  type TrayHydraulicsConfig,
} from "@/domain/equipment/tray-hydraulics-schema";
import type { Dimension } from "@/domain/unit-definitions";
import EngineeringInput from "./EngineeringInput";
import NumberInput from "./NumberInput";
import { useUnitSystem } from "./useUnitSystem";
import "./tray-hydraulics.css";

export function TrayHydraulicsSetup({
  value,
  onChange,
}: {
  value?: TrayHydraulicsConfig;
  onChange: (value: TrayHydraulicsConfig) => void;
}) {
  const display = useUnitSystem();
  const h = value ?? defaultTrayHydraulics();
  const change = (patch: Partial<TrayHydraulicsConfig>) =>
    onChange({ ...h, ...patch });
  const dimensional = (
    key: keyof TrayHydraulicsConfig,
    label: string,
    dimension: Dimension,
    min: number,
    max: number,
  ) => (
    <label key={key}>
      {label} ({display.quantityLabel(dimension)})
      <EngineeringInput
        selectUnit
        aria-label={label}
        dimension={dimension}
        value={(h[key] as number) ?? NaN}
        min={min}
        max={max}
        required
        onValueChange={(next) => change({ [key]: next })}
      />
    </label>
  );
  return (
    <div className="tray-hydraulics-setup">
      <h4>Tray hydraulics</h4>
      <label className="tray-hydraulics-toggle">
        <input
          type="checkbox"
          checked={value?.enabled ?? false}
          onChange={(e) => change({ enabled: e.target.checked })}
        />
        Rate flooding and weeping
      </label>
      {value?.enabled && (
        <>
          <p className="equipment-help">
            Single-pass sieve trays. Rating only; separation is unchanged.
          </p>
          <div className="equipment-field-grid">
            {dimensional(
              "diameter",
              "Tower internal diameter",
              "length",
              0.15,
              12,
            )}
            {dimensional("traySpacing", "Tray spacing", "length", 0.3, 0.9)}
            {dimensional(
              "liquidDensity",
              "Hydraulic liquid density",
              "density",
              100,
              2500,
            )}
            {dimensional(
              "surfaceTension",
              "Hydraulic surface tension",
              "surfaceTension",
              0.001,
              0.1,
            )}
          </div>
          <p className="equipment-help">
            Use liquid properties at typical tray conditions, held constant
            across the tower. Clean, nonfoaming liquids only.
          </p>
          <details>
            <summary>Tray geometry</summary>
            <p className="equipment-help">
              Match the installed sieve tray. Weir length follows the downcomer
              chord; valve and bubble-cap trays are unsupported.
            </p>
            <div className="equipment-field-grid">
              {dimensional(
                "holeDiameter",
                "Sieve hole diameter",
                "length",
                0.003,
                0.0127,
              )}
              {dimensional(
                "weirHeight",
                "Outlet weir height",
                "length",
                0.015,
                0.1,
              )}
              {dimensional(
                "downcomerClearance",
                "Downcomer clearance",
                "length",
                0.005,
                h.weirHeight,
              )}
              {(
                [
                  ["holeAreaFraction", "Hole area / active area", 0.1, 0.15],
                  [
                    "downcomerFraction",
                    "Downcomer area / tower area",
                    0.05,
                    0.25,
                  ],
                  [
                    "dischargeCoefficient",
                    "Hole discharge coefficient",
                    0.6,
                    0.9,
                  ],
                ] as const
              ).map(([key, label, min, max]) => (
                <label key={key}>
                  {label}
                  <NumberInput
                    aria-label={label}
                    value={h[key]}
                    min={min}
                    max={max}
                    step={0.01}
                    required
                    onValueChange={(next) => change({ [key]: next })}
                  />
                </label>
              ))}
            </div>
            <p className="equipment-help">
              Rating limits: 0.3–0.9 m spacing, 10–15% hole area. Weeping is
              approximate; values outside correlation limits are unrated.
            </p>
          </details>
        </>
      )}
    </div>
  );
}

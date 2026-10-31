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
        Predict tray flooding and weeping
      </label>
      {value?.enabled && (
        <>
          <p className="equipment-help">
            Single-pass sieve trays. Ratings use the calculated flows on each
            tray. Diameter and spacing also update the 3D tower. Separation
            results remain unchanged, including pressure, efficiency, purity and
            duties.
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
            Supply liquid properties for your mixture at representative tray
            conditions; both are held constant across the tower. Vapor density
            is calculated per tray. Intended for clean, nonfoaming liquids.
          </p>
          <details>
            <summary>Sieve tray geometry and assumptions</summary>
            <p className="equipment-help">
              The preset uses 5 mm holes, 10% open area, 12% downcomer area, a
              50 mm weir and 40 mm clearance. Weir length follows the downcomer
              chord. Edit these values to match the installed tray. Valve and
              bubble-cap trays require different correlations.
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
              Supported rating range: 0.3–0.9 m spacing and 10–15% hole area.
              Weeping uses an approximate published graph; results outside
              correlation limits are marked unrated. A hydraulic limit is an
              estimate, not a guarantee.
            </p>
          </details>
        </>
      )}
    </div>
  );
}

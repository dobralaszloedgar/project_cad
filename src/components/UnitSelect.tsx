// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import {
  type Dimension,
  type Unit,
  unitLabel,
} from "@/domain/unit-definitions";
import { pressureLabel, unitsFor } from "@/domain/unit-preferences";
import { useUnitSystem } from "./useUnitSystem";

export default function UnitSelect({
  dimension,
  label,
}: {
  dimension: Dimension;
  label: string;
}) {
  const display = useUnitSystem();
  return (
    <select
      className="select equipment-unit-select"
      aria-label={`${label} unit`}
      value={display.units[dimension]}
      onChange={(event) =>
        display.setUnit(dimension, event.target.value as Unit)
      }
    >
      {unitsFor(dimension).map((unit) => (
        <option key={unit} value={unit}>
          {dimension === "pressure" ? pressureLabel(unit) : unitLabel(unit)}
        </option>
      ))}
    </select>
  );
}

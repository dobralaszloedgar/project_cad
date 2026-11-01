"use client";

import { useState } from "react";
import { UNIT_DEFINITIONS, type Dimension } from "@/domain/unit-definitions";
import { inputNumber } from "@/domain/units";
import { useUnitSystem } from "./useUnitSystem";
import NumberInput, { type NumberInputProps } from "./NumberInput";

const increments: Partial<Record<Dimension, number>> = {
  temperature: 1,
  pressure: 1000,
  pressureDifference: 1000,
  molarFlow: 0.1,
  volumeFlow: 0.01,
  power: 1000,
  enthalpy: 1000,
  time: 0.1,
};

export default function EngineeringInput({
  dimension,
  value,
  min,
  max,
  step,
  onValueChange,
  ...props
}: Omit<NumberInputProps, "value" | "onValueChange"> & {
  dimension: Dimension;
  value: number;
  min?: number;
  max?: number;
  onValueChange: (value: number) => void;
}) {
  const display = useUnitSystem();
  const unitKey = `${display.units[dimension]}:${dimension === "pressure" ? display.atmosphere : ""}`;
  const text = Number.isFinite(value)
    ? String(inputNumber(display.value(value, dimension)))
    : "";
  const [editing, setEditing] = useState({ value, unitKey, text });
  if (!Object.is(editing.value, value) || editing.unitKey !== unitKey)
    setEditing({ value, unitKey, text });
  const low =
    min === undefined ? undefined : inputNumber(display.value(min, dimension));
  const high =
    max === undefined ? undefined : inputNumber(display.value(max, dimension));
  // Use convenient increments in the displayed unit, with bounds still in SI.
  const convertedStep =
    (increments[dimension] ?? 1) /
    UNIT_DEFINITIONS[display.units[dimension]].scale;
  const displayStep = step ?? 10 ** Math.floor(Math.log10(convertedStep));
  return (
    <NumberInput
      {...props}
      key={unitKey}
      step={displayStep}
      min={low}
      max={high}
      value={editing.text}
      onValueChange={(entered, text) => {
        // Preserve exact SI bounds when their displayed equivalents are rounded.
        const next =
          entered === low && min !== undefined
            ? min
            : entered === high && max !== undefined
              ? max
              : display.toSI(entered, dimension);
        setEditing({ value: next, unitKey, text });
        onValueChange(next);
      }}
    />
  );
}

import {
  STANDARD_ATMOSPHERE,
  UNIT_DEFINITIONS,
  type Unit,
} from "./unit-definitions";

export function fromSI(
  value: number,
  unit: Unit,
  atmosphere = STANDARD_ATMOSPHERE,
): number {
  const { scale, offset, gauge } = UNIT_DEFINITIONS[unit];
  return (value - offset - (gauge ? atmosphere : 0)) / scale;
}

export function toSI(
  value: number,
  unit: Unit,
  atmosphere = STANDARD_ATMOSPHERE,
): number {
  const { scale, offset, gauge } = UNIT_DEFINITIONS[unit];
  return value * scale + offset + (gauge ? atmosphere : 0);
}

export function inputNumber(value: number): number {
  return Number(value.toPrecision(12));
}

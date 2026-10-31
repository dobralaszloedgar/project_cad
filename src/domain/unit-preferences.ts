import {
  DEFAULT_UNIT_SYSTEM,
  STANDARD_ATMOSPHERE,
  UNIT_DEFINITIONS,
  UNIT_SYSTEMS,
  isUnit,
  unitLabel,
  unitSystemPreference,
  type Dimension,
  type Unit,
  type UnitSystem,
} from "./unit-definitions";

export function unitsFor(dimension: Dimension): Unit[] {
  return (Object.keys(UNIT_DEFINITIONS) as Unit[]).filter((unit) => {
    const definition = UNIT_DEFINITIONS[unit];
    return dimension === "pressureDifference"
      ? definition.dimension === "pressure" && !definition.gauge
      : definition.dimension === dimension;
  });
}

export function pressureLabel(unit: Unit) {
  return `${unitLabel(unit)}${UNIT_DEFINITIONS[unit].gauge ? "" : " abs"}`;
}

export interface UnitPreferences {
  system: UnitSystem;
  units: Record<Dimension, Unit>;
  atmosphere: number;
}

export function presetPreferences(system: UnitSystem): UnitPreferences {
  return {
    system,
    units: { ...UNIT_SYSTEMS[system].units },
    atmosphere: STANDARD_ATMOSPHERE,
  };
}

export const DEFAULT_UNIT_PREFERENCES = presetPreferences(DEFAULT_UNIT_SYSTEM);

// Recover usable preferences from malformed or incompatible stored overrides.
export function parseUnitPreferences(value: unknown): UnitPreferences {
  const data =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const settings = presetPreferences(unitSystemPreference(data.system));
  if (data.units && typeof data.units === "object") {
    for (const dimension of Object.keys(settings.units) as Dimension[]) {
      const unit = (data.units as Record<string, unknown>)[dimension];
      if (
        typeof unit === "string" &&
        isUnit(unit) &&
        unitsFor(dimension).includes(unit)
      )
        settings.units[dimension] = unit;
    }
  }
  if (
    typeof data.atmosphere === "number" &&
    Number.isFinite(data.atmosphere) &&
    data.atmosphere > 0
  )
    settings.atmosphere = data.atmosphere;
  return settings;
}

export function matchingPreset(
  units: Record<Dimension, Unit>,
): UnitSystem | undefined {
  return (Object.keys(UNIT_SYSTEMS) as UnitSystem[]).find((system) =>
    (Object.keys(units) as Dimension[]).every(
      (dimension) => units[dimension] === UNIT_SYSTEMS[system].units[dimension],
    ),
  );
}

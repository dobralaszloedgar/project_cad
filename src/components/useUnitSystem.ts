"use client";

import { useSyncExternalStore } from "react";
import {
  UNIT_SYSTEMS,
  unitLabel,
  type Dimension,
  type Unit,
  type UnitSystem,
} from "@/domain/unit-definitions";
import {
  DEFAULT_UNIT_PREFERENCES,
  matchingPreset,
  parseUnitPreferences,
  presetPreferences,
  pressureLabel,
  unitsFor,
  type UnitPreferences,
} from "@/domain/unit-preferences";
import { fromSI, toSI } from "@/domain/units";

export const UNIT_PREFERENCES_STORAGE_KEY = "project-cad:unit-preferences";
const CHANGE_EVENT = "project-cad:units-change";
let sessionPreference: UnitPreferences | undefined;

function snapshot() {
  if (!sessionPreference) {
    try {
      sessionPreference = parseUnitPreferences(
        JSON.parse(
          localStorage.getItem(UNIT_PREFERENCES_STORAGE_KEY) ?? "null",
        ),
      );
    } catch {
      sessionPreference = DEFAULT_UNIT_PREFERENCES;
    }
  }
  return sessionPreference;
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === UNIT_PREFERENCES_STORAGE_KEY || event.key === null) {
      sessionPreference = undefined;
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function save(preferences: UnitPreferences) {
  sessionPreference = preferences;
  try {
    localStorage.setItem(
      UNIT_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // Restricted storage still allows changes for the current session.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function setSystem(system: UnitSystem) {
  if (Object.hasOwn(UNIT_SYSTEMS, system))
    save({ ...presetPreferences(system), atmosphere: snapshot().atmosphere });
}

function setUnit(dimension: Dimension, unit: Unit) {
  if (unitsFor(dimension).includes(unit))
    save({ ...snapshot(), units: { ...snapshot().units, [dimension]: unit } });
}

function setAtmosphere(atmosphere: number) {
  if (Number.isFinite(atmosphere) && atmosphere > 0)
    save({ ...snapshot(), atmosphere });
}

function resetDefaults() {
  save(presetPreferences("metric"));
}

export function useUnitSystem() {
  const preferences = useSyncExternalStore(
    subscribe,
    snapshot,
    () => DEFAULT_UNIT_PREFERENCES,
  );
  const preset = matchingPreset(preferences.units);
  const quantityLabel = (dimension: Dimension) =>
    dimension === "pressure"
      ? pressureLabel(preferences.units[dimension])
      : unitLabel(preferences.units[dimension]);
  const value = (si: number, dimension: Dimension) =>
    fromSI(si, preferences.units[dimension], preferences.atmosphere);
  return {
    ...preferences,
    preset,
    setSystem,
    setUnit,
    setAtmosphere,
    resetDefaults,
    label: preset ? UNIT_SYSTEMS[preset].label : "Custom",
    quantityLabel,
    value,
    toSI: (displayed: number, dimension: Dimension) =>
      toSI(displayed, preferences.units[dimension], preferences.atmosphere),
    format: (si: number, dimension: Dimension, digits = 3) =>
      `${value(si, dimension).toLocaleString("en-US", {
        maximumFractionDigits: digits,
      })} ${quantityLabel(dimension)}`,
  };
}

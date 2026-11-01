"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_FLUID_PALETTE,
  FLUID_PALETTE_STORAGE_KEY,
  fluidPalette,
} from "./fluid-palettes";

const CHANGE_EVENT = "project-cad:fluid-palette-change";
let sessionPreference: string | undefined;

function snapshot() {
  if (sessionPreference) return sessionPreference;
  try {
    return fluidPalette(localStorage.getItem(FLUID_PALETTE_STORAGE_KEY)).id;
  } catch {
    return DEFAULT_FLUID_PALETTE;
  }
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === FLUID_PALETTE_STORAGE_KEY || event.key === null) {
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

function setPalette(id: string) {
  sessionPreference = fluidPalette(id).id;
  try {
    localStorage.setItem(FLUID_PALETTE_STORAGE_KEY, sessionPreference);
  } catch {
    // Keep the selection usable when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useFluidPalette() {
  const id = useSyncExternalStore(
    subscribe,
    snapshot,
    () => DEFAULT_FLUID_PALETTE,
  );
  return { palette: fluidPalette(id), setPalette };
}

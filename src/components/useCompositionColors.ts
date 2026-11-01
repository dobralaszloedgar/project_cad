"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "project-cad.compositionColors";
const CHANGE_EVENT = "project-cad:composition-colors-change";
let sessionPreference: boolean | undefined;

function snapshot() {
  if (sessionPreference !== undefined) return sessionPreference;
  try {
    return localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
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

function setCompositionColors(enabled: boolean) {
  sessionPreference = enabled;
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Restricted storage still allows changes for the current session.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useCompositionColors() {
  const compositionColors = useSyncExternalStore(
    subscribe,
    snapshot,
    () => true,
  );
  return { compositionColors, setCompositionColors };
}

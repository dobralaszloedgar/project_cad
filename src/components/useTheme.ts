"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, themeDefinition } from "@/lib/theme";

const CHANGE_EVENT = "project-cad:theme-change";
let sessionPreference: string | undefined;

function snapshot() {
  if (sessionPreference) return sessionPreference;
  try {
    return themeDefinition(localStorage.getItem(THEME_STORAGE_KEY)).id;
  } catch {
    return "light";
  }
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
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

function setTheme(id: string) {
  sessionPreference = themeDefinition(id).id;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, sessionPreference);
  } catch {
    // A restricted browser can still change the theme for this session.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useTheme() {
  const id = useSyncExternalStore(subscribe, snapshot, () => "light");
  return { theme: themeDefinition(id), setTheme };
}

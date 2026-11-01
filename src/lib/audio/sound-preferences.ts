export const SOUND_STORAGE_KEY = "project-cad:sound:v1";
export type SoundPreferences = { version: 1; enabled: boolean; volume: number };
export const DEFAULT_SOUND_PREFERENCES: SoundPreferences = {
  version: 1,
  enabled: false,
  volume: 35,
};

export function parseSoundPreferences(raw: string | null): SoundPreferences {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || value.version !== 1) return DEFAULT_SOUND_PREFERENCES;
    return {
      version: 1,
      enabled: value.enabled === true,
      volume:
        typeof value.volume === "number" && Number.isFinite(value.volume)
          ? Math.max(0, Math.min(100, Math.round(value.volume)))
          : DEFAULT_SOUND_PREFERENCES.volume,
    };
  } catch {
    return DEFAULT_SOUND_PREFERENCES;
  }
}

const CHANGE_EVENT = "project-cad:sound-change";
let sessionPreference: SoundPreferences | undefined;
let cachedRaw: string | null | undefined;
let cachedPreference = DEFAULT_SOUND_PREFERENCES;

export function soundPreferenceSnapshot() {
  if (sessionPreference) return sessionPreference;
  try {
    const raw = localStorage.getItem(SOUND_STORAGE_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedPreference = parseSoundPreferences(raw);
    }
    return cachedPreference;
  } catch {
    return DEFAULT_SOUND_PREFERENCES;
  }
}

export function subscribeSoundPreferences(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SOUND_STORAGE_KEY || event.key === null) {
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

export function updateSoundPreferences(
  update: Partial<Pick<SoundPreferences, "enabled" | "volume">>,
) {
  sessionPreference = parseSoundPreferences(
    JSON.stringify({ ...soundPreferenceSnapshot(), ...update }),
  );
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(sessionPreference));
  } catch {
    // Sound controls still work when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

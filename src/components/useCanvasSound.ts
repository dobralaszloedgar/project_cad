"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { SoundPlayer } from "@/lib/audio/sound-player";
import { workspaceSound, type SoundCue } from "@/lib/audio/sound-design";
import type { SimulationOutcome } from "@/lib/audio/completion-sounds";
import {
  createSimulationSoundSamples,
  workspaceSimulationSound,
} from "@/lib/audio/simulation-sound";
import {
  DEFAULT_SOUND_PREFERENCES,
  soundPreferenceSnapshot,
  subscribeSoundPreferences,
  updateSoundPreferences,
} from "@/lib/audio/sound-preferences";

export function useCanvasSound() {
  const preferences = useSyncExternalStore(
    subscribeSoundPreferences,
    soundPreferenceSnapshot,
    () => DEFAULT_SOUND_PREFERENCES,
  );
  const player = useRef<SoundPlayer | null>(null);
  const request = useRef(0);
  const [error, setError] = useState("");

  useEffect(
    () => () => {
      request.current++;
      player.current?.dispose();
      player.current = null;
    },
    [],
  );

  useEffect(() => {
    player.current?.setVolume(preferences.volume / 100);
    if (!preferences.enabled) {
      request.current++;
      player.current?.mute();
    }
  }, [preferences.enabled, preferences.volume]);

  const playWhenReady = useCallback((action?: (audio: SoundPlayer) => void) => {
    const settings = soundPreferenceSnapshot();
    if (!settings.enabled || settings.volume === 0) return;
    const currentRequest = ++request.current;
    const failed = () => {
      if (request.current !== currentRequest) return;
      player.current?.mute();
      updateSoundPreferences({ enabled: false });
      setError("Couldn’t start audio. Try enabling sound again.");
    };
    try {
      const current = (player.current ??= new SoundPlayer());
      if (current.isReady) {
        action?.(current);
        return;
      }
      // Resume only from an editor action, never automatically on load.
      void current
        .enable(settings.volume / 100)
        .then((ready) => {
          if (request.current !== currentRequest || player.current !== current)
            return;
          const latest = soundPreferenceSnapshot();
          if (!latest.enabled || latest.volume === 0) return;
          if (!ready) {
            failed();
            return;
          }
          current.setVolume(latest.volume / 100);
          action?.(current);
        })
        .catch(failed);
    } catch {
      // Audio failure must never interrupt an edit or simulation.
      failed();
    }
  }, []);

  const play = useCallback(
    (cue: SoundCue) => {
      playWhenReady((audio) => audio.play(workspaceSound.id, cue));
    },
    [playWhenReady],
  );

  // Unlock audio during the run gesture, before a lengthy synchronous solve.
  // This is silent; only the eventual result plays a cue.
  const prepareSimulation = useCallback(() => playWhenReady(), [playWhenReady]);

  const playSimulation = useCallback(
    (outcome: SimulationOutcome) => {
      playWhenReady((audio) => {
        audio.stop();
        audio.playGenerated(
          `simulation:${workspaceSimulationSound.id}:${outcome}`,
          (rate) => createSimulationSoundSamples(outcome, rate),
        );
      });
    },
    [playWhenReady],
  );

  const setEnabled = useCallback((enabled: boolean) => {
    request.current++;
    setError("");
    updateSoundPreferences({ enabled });
    if (!enabled) player.current?.mute();
  }, []);

  const setVolume = useCallback((volume: number) => {
    updateSoundPreferences({ volume });
    player.current?.setVolume(soundPreferenceSnapshot().volume / 100);
  }, []);

  return {
    ...preferences,
    error,
    play,
    prepareSimulation,
    playSimulation,
    setEnabled,
    setVolume,
  };
}

export type CanvasSound = ReturnType<typeof useCanvasSound>;

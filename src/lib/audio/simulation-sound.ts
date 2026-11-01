import {
  createCompletionSamples,
  type SimulationOutcome,
} from "./completion-sounds";
import { musicBoxVariants } from "./music-box-variants";

/** The exact Moonlight pair approved in the sound sandbox. */
export const workspaceSimulationSound = musicBoxVariants.find(
  (sound) => sound.id === "music-box-moonlight",
)!;

export function createSimulationSoundSamples(
  outcome: SimulationOutcome,
  sampleRate: number,
): Float32Array<ArrayBuffer> {
  return createCompletionSamples(
    workspaceSimulationSound.id,
    sampleRate,
    outcome,
  );
}

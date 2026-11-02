// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

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

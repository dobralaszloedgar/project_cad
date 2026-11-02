// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { Metadata } from "next";
import SimulationSoundSandbox from "@/components/simulation-sound-sandbox/SimulationSoundSandbox";

export const metadata: Metadata = {
  title: "Project CAD – Simulation sounds",
  description:
    "Compare 10 music-box variations, each with a success melody and a two-note cue for unsuccessful simulations.",
};

export default function SoundSandboxPage() {
  return <SimulationSoundSandbox />;
}

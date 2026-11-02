// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { Project } from "@/domain/schema";
import type { SoundCue } from "./sound-design";

/** Call after an accepted editor action, not during loading or history replay. */
export function editSoundCue(
  before: Project,
  after: Project,
): Extract<SoundCue, "place" | "connect"> | null {
  if (after.units.length > before.units.length) return "place";
  if (after.edges.length > before.edges.length) return "connect";
  // Moving, deleting, selecting and changing properties stay quiet.
  return null;
}

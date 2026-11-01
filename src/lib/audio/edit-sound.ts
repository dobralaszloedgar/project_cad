import type { Project } from "@/domain/schema";
import type { SoundCue } from "./sound-design";

/** Call after an accepted editor action, not during loading or history replay. */
export function editSoundCue(before: Project, after: Project): SoundCue | null {
  if (
    after.units.length < before.units.length ||
    after.edges.length < before.edges.length
  )
    return "remove";
  if (after.units.length > before.units.length) return "place";
  if (after.edges.length > before.edges.length) return "connect";
  const previousUnits = new Map(before.units.map((unit) => [unit.id, unit]));
  if (
    after.units.some((unit) => {
      const previous = previousUnits.get(unit.id);
      return (
        previous &&
        (previous.position.x !== unit.position.x ||
          previous.position.y !== unit.position.y)
      );
    })
  )
    return "place";
  // Selection, parameter edits, renaming and drops that snap back stay quiet.
  return null;
}

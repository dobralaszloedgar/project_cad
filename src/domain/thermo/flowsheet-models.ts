// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { Project } from "../schema";
import { portIndex } from "../material-ports";
import { defaultThermo, type ModelId, type ThermoSettings } from "./registry";

/** Resolve branch models from saved specifications before a run exists.
 * Traverse upstream to feeds or explicit outlet states; cycles add no model. */
export function unitThermoSettings(
  project: Project,
  unitId: string,
): ThermoSettings {
  const settings = project.thermo ?? defaultThermo;
  const visit = (id: string, seen: Set<string>): ModelId[] => {
    if (seen.has(id)) return [];
    const unit = project.units.find((item) => item.id === id);
    if (!unit || unit.kind === "Feed") return [settings.modelId];
    const path = new Set(seen).add(id);
    return project.edges
      .filter((edge) => edge.target === id)
      .flatMap((edge) => {
        const source = project.units.find((item) => item.id === edge.source);
        const outlet =
          source?.kind === "Splitter"
            ? source.params.componentSplit?.outlets[portIndex(edge.sourcePort)]
            : undefined;
        return outlet ? [outlet.modelId] : visit(edge.source, path);
      });
  };
  const models = new Set(visit(unitId, new Set()));
  return models.size === 1
    ? { ...settings, modelId: models.values().next().value! }
    : settings;
}

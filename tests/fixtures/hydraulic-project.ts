// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { aromaticColumnTemplate } from "../../src/domain/real-chemical-templates";
import { trayHydraulicsSchema } from "../../src/domain/equipment/tray-hydraulics-schema";
import { projectSchema } from "../../src/domain/schema";

export function hydraulicProject() {
  const project = aromaticColumnTemplate("mesh");
  project.units[1].params.distillation!.hydraulics = trayHydraulicsSchema.parse(
    {
      liquidDensity: 800,
      surfaceTension: 0.02,
    },
  );
  return projectSchema.parse(project);
}

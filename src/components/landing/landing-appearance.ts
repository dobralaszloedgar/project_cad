// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { PlantCompositionColors } from "../equipment-3d/composition-colors";
import type { SystemExample } from "../equipment-3d/system-geometry";
import { landingExample } from "./landing-example";

export function landingComposition(
  system: SystemExample,
): PlantCompositionColors {
  return {
    ...landingExample.colors,
    equipment: Object.fromEntries(
      system.equipment.map((item) => [
        item.id,
        landingExample.colors.equipment[item.tag],
      ]),
    ),
  };
}

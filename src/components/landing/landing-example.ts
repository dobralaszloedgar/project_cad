// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { Project } from "@/domain/schema";
import type { Result } from "@/domain/solver";
import type { EquipmentStatus } from "@/domain/equipment-status";
import type { PlantCompositionColors } from "../equipment-3d/composition-colors";
import example from "./landing-example.json";

/** Generated offline from the application's schema, solver and status helpers. */
export const landingExample = example as unknown as {
  project: Project;
  emptyProject: Project;
  baseRevision: string;
  result: Result;
  colors: PlantCompositionColors;
  readyStatuses: Record<string, EquipmentStatus>;
  calculatedStatuses: Record<string, EquipmentStatus>;
};

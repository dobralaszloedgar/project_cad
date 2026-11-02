// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { SystemExample } from "@/components/equipment-3d/system-geometry";
import plant from "./landing-plant.json";
export { reveal } from "./landing-motion";

/** Authored once by scripts/generate-landing-demo.ts; no runtime plant routing. */
export function makeLandingSystem(): SystemExample {
  return plant as SystemExample;
}

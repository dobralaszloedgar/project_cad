// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { Project } from "./schema";

/** New projects have no selected chemicals; omitted thermo is a legacy demo. */
export function blankProject(name = "Untitled process"): Project {
  return {
    version: 1,
    name,
    units: [],
    edges: [],
    thermo: { modelId: "ideal-gas", mixture: "catalog", extrapolate: false },
  };
}

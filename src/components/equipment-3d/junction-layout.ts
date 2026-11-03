// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { Point } from "./operation";
import { normalizeBranchCount } from "../../domain/material-ports";

// Shared by the fittings, animated contents and external pipe endpoints.
export const extraMixerInlets = [
  { port: "in3", point: [1.39, 1.18, -0.48] as Point },
  { port: "in4", point: [1.39, 1.18, 0.48] as Point },
] as const;

export const splitterBranches = [
  { port: "out", fitting: "a", z: -0.62 },
  { port: "out2", fitting: "b", z: 0.62 },
  { port: "out3", fitting: "c", z: -0.21 },
  { port: "out4", fitting: "d", z: 0.21 },
] as const;

export const activeMixerInlets = (count?: number) =>
  extraMixerInlets.slice(0, normalizeBranchCount(count) - 2);

export const activeSplitterBranches = (count?: number) =>
  splitterBranches.slice(0, normalizeBranchCount(count));

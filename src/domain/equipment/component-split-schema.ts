// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { z } from "zod";
import { modelIds } from "../thermo/registry";

const outlet = z
  .object({
    temperature: z.number().min(250).max(800),
    pressure: z.number().min(10000).max(2000000),
    modelId: z.enum(modelIds),
  })
  .strict();

/** Specified component recoveries and outlet states, not an equilibrium flash.
 * Both property packages share the catalog's gas enthalpy reference. */
export const componentSplitSchema = z
  .object({
    recoveries: z.record(z.string(), z.number().min(0).max(1)),
    outlets: z.tuple([outlet, outlet]),
  })
  .strict();

export type ComponentSplitConfig = z.infer<typeof componentSplitSchema>;

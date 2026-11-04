// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { describe, expect, it } from "vitest";
import { applyActions } from "../src/domain/actions";
import { blankProject } from "../src/domain/new-project";
import { newUnit, projectSchema } from "../src/domain/schema";
import { simulate } from "../src/domain/solver";
import {
  componentNames,
  selectedChemicals,
} from "../src/domain/thermo/catalog";
import { modelIds } from "../src/domain/thermo/registry";
import { settingsFor } from "./helpers/catalog";

describe("new project components", () => {
  it.each(modelIds)("saves an empty component selection with %s", (modelId) => {
    const project = applyActions(blankProject(), {
      summary: "Choose a model before choosing chemicals",
      actions: [
        {
          type: "set_thermo_model",
          modelId,
          mixture: "catalog",
          extrapolate: false,
        },
      ],
    });
    const restored = projectSchema.parse(JSON.parse(JSON.stringify(project)));
    expect(restored.thermo?.modelId).toBe(modelId);
    expect(componentNames(restored.thermo!)).toEqual([]);
    expect(selectedChemicals(restored.thermo!)).toEqual([]);
  });

  it("requires selected chemicals before a new flowsheet can simulate", () => {
    const project = applyActions(blankProject(), {
      summary: "Draw a feed and product before selecting components",
      actions: [
        { type: "add", unit: newUnit("Feed", "F-101", 0, 0) },
        { type: "add", unit: newUnit("Product", "P-101", 200, 0) },
        {
          type: "connect",
          edge: {
            id: "s1",
            source: "F-101",
            target: "P-101",
            sourcePort: "out",
            targetPort: "in",
            color: "teal",
          },
        },
      ],
    });
    expect(() => simulate(project)).toThrow(/Select.*chemicals/);
    const configured = applyActions(project, {
      summary: "Select ethanol and water",
      actions: [
        {
          type: "set_thermo_model",
          ...settingsFor(["64-17-5", "7732-18-5"]),
        },
      ],
    });
    const result = simulate(configured);
    expect(result.converged).toBe(true);
    expect(result.provenance.chemicalIds).toEqual(["64-17-5", "7732-18-5"]);
  });
});

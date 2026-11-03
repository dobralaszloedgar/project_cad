// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { describe, expect, it } from "vitest";
import { reactorExample, catalystExample } from "../src/domain/examples";
import { templates } from "../src/domain/templates";
import { aromaticColumnTemplate } from "../src/domain/real-chemical-templates";
import { defaultTrayHydraulics } from "../src/domain/equipment/tray-hydraulics-schema";
import { simulationKey } from "../src/domain/equipment-status";
import { simulate } from "../src/domain/solver";
import type { Project } from "../src/domain/schema";
import { checkpoint, restore, type Workspace } from "../src/lib/revisions";
import {
  parseProjectFile,
  parseWorkspaceImport,
  serializeProjectFile,
  validateWorkspace,
} from "../src/lib/project-file";

function simulated(project: Project): Workspace {
  return {
    version: 1,
    project,
    revisions: [checkpoint(project, "Before simulation")],
    simulation: {
      key: simulationKey(project),
      completedAt: new Date().toISOString(),
      result: simulate(project),
    },
  };
}

function roundTrip(workspace: Workspace) {
  const now = new Date().toISOString();
  return parseProjectFile(
    serializeProjectFile({
      format: "project-cad",
      formatVersion: 1,
      projectId: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      workspace,
    }),
  ).workspace;
}

describe("saved simulations", () => {
  it.each([
    ...templates,
    { name: "Recycle", create: reactorExample },
    { name: "Synthetic catalyst profile", create: catalystExample },
    {
      name: "MESH column with tray hydraulics",
      create: () => {
        const project = aromaticColumnTemplate("mesh");
        project.units[1].params.distillation!.hydraulics = {
          ...defaultTrayHydraulics(),
          liquidDensity: 800,
          surfaceTension: 0.02,
        };
        return project;
      },
    },
  ])(
    "preserves all numerical results for $name in project files",
    ({ create }) => {
      const workspace = simulated(create());
      const reopened = roundTrip(workspace);
      expect(reopened.simulation).toEqual(
        JSON.parse(JSON.stringify(workspace.simulation)),
      );
      expect(reopened.simulation!.key).toBe(simulationKey(reopened.project));
      expect(
        parseWorkspaceImport(JSON.stringify(workspace)).simulation,
      ).toEqual(reopened.simulation);
    },
  );

  it("continues opening older files without simulation results", () => {
    const workspace: Workspace = {
      version: 1,
      project: reactorExample(),
      revisions: [],
    };
    expect(roundTrip(workspace).simulation).toBeUndefined();
  });

  it("retains results through layout changes and marks changed inputs as stale", () => {
    const workspace = simulated(reactorExample());
    workspace.project.name = "Renamed study";
    workspace.project.units[0].position.x += 50;
    expect(simulationKey(roundTrip(workspace).project)).toBe(
      workspace.simulation!.key,
    );
    workspace.project.units[0].params.temperature += 10;
    const changed = roundTrip(workspace);
    expect(simulationKey(changed.project)).not.toBe(changed.simulation!.key);
    expect(changed.simulation!.result).toEqual(workspace.simulation!.result);
    const restored = restore(changed, workspace.revisions[0]);
    expect(simulationKey(restored.project)).toBe(restored.simulation!.key);
  });

  it("preserves unsuccessful runs without treating them as calculated results", () => {
    const workspace: Workspace = {
      version: 1,
      project: reactorExample(),
      revisions: [],
      simulation: {
        key: simulationKey(reactorExample()),
        completedAt: new Date().toISOString(),
        result: null,
        failure: { message: "Simulation failed", unitId: "R-101" },
      },
    };
    expect(roundTrip(workspace).simulation).toEqual(workspace.simulation);
  });

  it("rejects malformed nested results before loading them into the editor", () => {
    const workspace = simulated(reactorExample());
    const stream = Object.keys(workspace.simulation!.result!.streams)[0];
    const malformed = JSON.parse(JSON.stringify(workspace));
    malformed.simulation.result.streams[stream].temperature = "bad value";
    expect(() => validateWorkspace(malformed)).toThrow();
    malformed.simulation.result = null;
    expect(() => validateWorkspace(malformed)).toThrow();
  });
});

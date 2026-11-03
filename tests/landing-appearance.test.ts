// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, it } from "vitest";
import { Mesh } from "three";
import { landingComposition } from "../src/components/landing/landing-appearance";
import { makeLandingSystem } from "../src/components/landing/landing-system";
import { createProcessContents } from "../src/components/equipment-3d/process-contents";
import { disposeEquipmentModel } from "../src/components/equipment-3d/models";
import { OperationClock } from "../src/components/equipment-3d/operation";
import { columnLayout } from "../src/components/equipment-3d/column-layout";
import { MeshPhysicalNodeMaterial } from "three/webgpu";

it("carries distinct column outlet colors through the pipes and product drums", () => {
  const colors = landingComposition(makeLandingSystem());
  const column = colors.equipment.column;
  expect(column.ports.out).not.toBe(column.ports.out2);
  expect(colors.streams.distillate).toBe(column.ports.out);
  expect(colors.equipment.light.color).toBe(column.ports.out);
  for (const id of ["bottoms", "product", "recycle"])
    expect(colors.streams[id]).toBe(column.ports.out2);
  expect(colors.equipment.bottom.color).toBe(column.ports.out2);
});

it("shows the editor's gradual separation across the landing column trays", () => {
  const colors = landingComposition(makeLandingSystem()).equipment.column;
  const contents = createProcessContents(
    "Distillation",
    true,
    new OperationClock(),
    colors.color,
    { trayCount: 8 },
    colors,
  );
  const { trays } = columnLayout({ trayCount: 8 });
  const trayColors = trays.map((y) => {
    const surface = contents.group.children.find(
      (part) =>
        part.name === "moving-liquid-surface" &&
        Math.abs(part.position.y - (y + 0.07)) < 0.001,
    ) as Mesh;
    return (
      "#" + (surface.material as MeshPhysicalNodeMaterial).color.getHexString()
    );
  });
  expect(trayColors[0]).toBe(colors.ports.out2);
  expect(trayColors.at(-1)).toBe(colors.ports.out);
  expect(new Set(trayColors).size).toBeGreaterThan(4);
  disposeEquipmentModel(contents.group);
});

it("uses a converged application result for the landing example", async () => {
  const { landingExample } =
    await import("../src/components/landing/landing-example");
  const { simulate } = await import("../src/domain/solver");
  const { projectCompositionColors } =
    await import("../src/components/equipment-3d/composition-colors");
  const calculated = simulate(landingExample.project);
  expect(calculated.converged).toBe(true);
  expect(projectCompositionColors(landingExample.project, calculated)).toEqual(
    landingExample.colors,
  );
});

// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
} from "three";
import { MeshPhysicalNodeMaterial } from "three/webgpu";
import { blendColors } from "../equipment-3d/color-blending";
import { fluidPalette } from "../equipment-3d/fluid-palettes";
import { packedBedLayout } from "../equipment-3d/packed-bed-layout";
import type { PlantCompositionColors } from "../equipment-3d/composition-colors";
import type { SystemExample } from "../equipment-3d/system-geometry";

/** Fixed illustrative endpoint compositions, using the same palette and tray
 * interpolation as the editor. No solver runs during the landing animation. */
export function landingComposition(
  system: SystemExample,
): PlantCompositionColors {
  const [bottoms, distillate] = fluidPalette().colors;
  const feed = blendColors([
    { color: bottoms, amount: 0.5 },
    { color: distillate, amount: 0.5 },
  ]);
  const colorFor = (id: string) =>
    id === "light"
      ? distillate
      : id === "bottom" || id === "splitter"
        ? bottoms
        : feed;
  return {
    components: [],
    equipment: Object.fromEntries(
      system.equipment.map((item) => {
        const color = colorFor(item.id);
        return [
          item.id,
          {
            color,
            ports:
              item.kind === "Distillation"
                ? { in: feed, out: distillate, out2: bottoms }
                : { in: color, in2: bottoms, out: color, out2: color },
          },
        ];
      }),
    ),
    streams: Object.fromEntries(
      system.streams.map((stream) => [
        stream.id,
        stream.from[0] === "column"
          ? stream.from[1] === "top"
            ? distillate
            : bottoms
          : colorFor(stream.from[0]),
      ]),
    ),
  };
}

/** Softer reflections retain the liquid hue at every camera angle. */
export function prepareLandingLiquid(group: Group) {
  group.traverse((part) => {
    if (!(part instanceof Mesh)) return;
    for (const material of Array.isArray(part.material)
      ? part.material
      : [part.material]) {
      if (material.transparent) material.forceSinglePass = true;
      if (
        material instanceof MeshPhysicalMaterial ||
        material instanceof MeshPhysicalNodeMaterial
      ) {
        material.roughness = 0.28;
        material.clearcoat = 0.15;
        material.clearcoatRoughness = 0.3;
        material.specularIntensity = 0.35;
        material.envMapIntensity = 0.3;
      }
    }
  });
}

/** The grain envelope omits hidden particles; solid cores close that interior. */
export function addCatalystCores(model: Group) {
  const material = new MeshStandardMaterial({
    color: "#a69b86",
    metalness: 0,
    roughness: 0.88,
  });
  for (const bed of packedBedLayout.beds) {
    const core = new Mesh(
      new CylinderGeometry(0.55, 0.55, bed.top - bed.bottom - 0.035, 32),
      material,
    );
    core.name = "catalyst-bed-core";
    core.position.y = (bed.top + bed.bottom) / 2;
    model.add(core);
  }
}

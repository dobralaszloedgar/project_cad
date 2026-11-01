import { Group, InstancedMesh, Material, Mesh } from "three";
import type { Kind } from "@/domain/schema";
import { columnLayout, type EquipmentModelOptions } from "./column-layout";
import { createEquipmentModel, disposeEquipmentModel } from "./models";

const models = new Map<string, { template: Group; users: number }>();

/** Acquire only from a committed effect. Geometry and textures live until the
 * last mounted copy releases them; transforms and materials belong to each copy
 * so the landing page can unfold and fade equipment independently. */
export function acquireEquipmentModel(
  kind: Kind,
  section = false,
  transparent = false,
  options: EquipmentModelOptions = {},
) {
  const layout = kind === "Distillation" ? columnLayout(options) : undefined;
  const key = JSON.stringify([
    kind,
    section,
    transparent,
    layout?.trayCount,
    layout?.traySpacing,
    layout?.radialScale,
    layout?.feedY,
    layout ? options.column?.trayType : undefined,
  ]);
  let entry = models.get(key);
  if (!entry) {
    entry = {
      template: createEquipmentModel(kind, section, transparent, options),
      users: 0,
    };
    models.set(key, entry);
  }
  const model = entry.template.clone(true);
  const materials = new Map<Material, Material>();
  const copyMaterial = (source: Material) => {
    let copy = materials.get(source);
    if (!copy) {
      copy = source.clone();
      materials.set(source, copy);
    }
    return copy;
  };
  model.traverse((part) => {
    if (!(part instanceof Mesh)) return;
    part.material = Array.isArray(part.material)
      ? part.material.map(copyMaterial)
      : copyMaterial(part.material);
  });
  entry.users++;
  let released = false;
  return {
    model,
    release() {
      if (released) return;
      released = true;
      // InstancedMesh.clone owns its instance buffers. The shared geometry and
      // texture maps must survive while another copy is still mounted.
      model.traverse((part) => {
        if (part instanceof InstancedMesh) part.dispose();
      });
      materials.forEach((material) => material.dispose());
      if (--entry.users === 0) {
        models.delete(key);
        disposeEquipmentModel(entry.template);
      }
    },
  };
}

import { columnLayout } from "./column-layout";
import { routePlant } from "./plant-routing";
import { compactPlantLayout } from "./plant-layout";
import type { EquipmentInstance, SystemExample } from "./system-geometry";
import { plantTemplates as definitions } from "../../domain/plant-templates";

function equipmentFor(
  definition: (typeof definitions)[number],
  trayCount?: number,
): EquipmentInstance[] {
  return definition.equipment.map((item) =>
    item.kind === "Distillation"
      ? { ...item, trayCount: trayCount ?? item.params?.trayCount ?? 8 }
      : item,
  );
}

const cache = new Map<string, SystemExample>();
export function getComplexSystem(
  id: string,
  trayCount?: number,
): SystemExample | undefined {
  const definition = definitions.find((item) => item.id === id);
  if (!definition) return undefined;
  const count =
    trayCount === undefined ? undefined : columnLayout({ trayCount }).trayCount;
  const key = `${id}:${count ?? "default"}`;
  const previous = cache.get(key);
  if (previous) return previous;
  const { equipment, site } = compactPlantLayout(
    id,
    equipmentFor(definition, count),
  );
  const result: SystemExample = {
    id,
    title: definition.title,
    description: definition.description,
    operation: definition.operation,
    equipment,
    site,
    streams: routePlant(equipment, definition.connections, site.rack),
  };
  if (cache.size >= 12) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}

// Metadata and cheap placements are available immediately. Only reading streams
// routes a plant, so filtering the picker by equipment count does no A* work.
export const complexSystems: SystemExample[] = definitions.map((definition) => {
  const layout = compactPlantLayout(definition.id, equipmentFor(definition));
  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    operation: definition.operation,
    equipment: layout.equipment,
    site: layout.site,
    get streams() {
      return getComplexSystem(definition.id)!.streams;
    },
  };
});

import { columnLayout } from "./column-layout";
import { routePlant } from "./plant-routing";
import { compactPlantLayout } from "./plant-layout";
import type { EquipmentInstance, SystemExample } from "./system-geometry";
import { plantTemplates as definitions } from "../../domain/plant-templates";

const cache = new Map<string, SystemExample>();
export function getComplexSystem(
  id: string,
  trayCount = 8,
): SystemExample | undefined {
  const definition = definitions.find((item) => item.id === id);
  if (!definition) return undefined;
  const count = columnLayout({ trayCount }).trayCount;
  const key = `${id}:${count}`;
  const previous = cache.get(key);
  if (previous) return previous;
  const original: EquipmentInstance[] = definition.equipment.map((item) =>
    item.kind === "Distillation" ? { ...item, trayCount: count } : item,
  );
  const { equipment, site } = compactPlantLayout(id, original);
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
export const complexSystems = definitions.map((definition) =>
  getComplexSystem(definition.id)!,
);

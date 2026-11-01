import type { Kind } from "./schema";

const prefixes: Record<Kind, string> = {
  Feed: "F",
  Product: "P",
  Mixer: "M",
  Splitter: "S",
  PBR: "R",
  Heater: "H",
  Cooler: "C",
  Distillation: "D",
};

/** Assign a readable tag without changing any existing equipment identifiers. */
export function availableEquipmentTag(
  kind: Kind,
  equipment: readonly { id: string }[],
) {
  const used = new Set(equipment.map((unit) => unit.id.toUpperCase()));
  const prefix = prefixes[kind];
  let number = 101;
  while (used.has(`${prefix}-${number}`)) number++;
  return `${prefix}-${number}`;
}

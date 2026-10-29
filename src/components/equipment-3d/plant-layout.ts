import { equipmentEnvelope } from "./plant-routing";
import type { Point } from "./operation";
import type {
  EquipmentInstance,
  PlantRack,
  PlantSite,
} from "./system-geometry";

type Placement = [x: number, z: number, turn?: 0 | 1 | 2 | 3];

// Process islands, not traversal order. Tall vessels sit at the rear, compact
// rotating equipment faces the central rack, and receivers share an outer bay.
// These are illustrative plot plans, not code-derived separation distances.
const layouts: Record<string, Record<string, Placement>> = {
  integrated: {
    feed: [-9.7, -6],
    additive: [-9.7, -2.8],
    blend: [-9.3, 3.7, 1],
    preheat: [-6.3, 3.7, 1],
    split: [-6.4, -2.8],
    reactorA: [-6.5, -6],
    reactorB: [-3.5, -6],
    coolerA: [-3.3, 3.8, 1],
    coolerB: [-0.6, 3.8, 1],
    merge: [-2.35, -2.8],
    firstHeat: [-8, 7.8, 1],
    firstColumn: [0, -5.8],
    firstCool: [2.1, 3.8, 1],
    firstSplit: [1.6, -2.7],
    secondHeat: [-4.7, 7.8, 1],
    secondColumn: [4.4, -5.8],
    secondCool: [4.8, 3.8, 1],
    bottomSplit: [5.65, -2.7],
    bottomCoolA: [-2.5, 7.6, 1],
    bottomCoolB: [0.3, 7.6, 1],
    lightA: [9.7, -6, 1],
    lightB: [9.7, -1.6, 1],
    middle: [9.7, 2.8, 1],
    bottomA: [5.8, 7.6, 1],
    bottomB: [3.1, 7.6, 1],
  },
  parallel: {
    feed: [-7, -5.5],
    additive: [-7, -2.5],
    blend: [-7, 3.7, 1],
    preheat: [-4, 3.7, 1],
    split: [-3.4, -2.7],
    reactorA: [-3.9, -6],
    reactorB: [-0.9, -6],
    coolerA: [-0.8, 3.8, 1],
    coolerB: [2, 3.8, 1],
    merge: [0.5, -2.7],
    finishHeat: [-5.6, 7.2],
    column: [3.1, -6],
    overheadCool: [4.8, 3.8, 1],
    bottomSplit: [4.6, -2.7],
    light: [7.5, 3.8, 1],
    bottomA: [7.8, -5.9, 1],
    bottomB: [7.8, -1.6, 1],
  },
  fractionation: {
    feed: [-9.3, -4.7],
    columnA: [-5.9, -5.8],
    columnB: [-1.5, -5.8],
    columnC: [2.9, -5.8],
    heatA: [-8.6, 3.6, 1],
    heatB: [-5.8, 3.6, 1],
    heatC: [-3, 3.6, 1],
    coolA: [-0.2, 3.8, 1],
    coolB: [2.5, 3.8, 1],
    coolC: [5.2, 3.8, 1],
    coolHeavy: [-6.8, 7.4],
    splitA: [-5.9, -2.7],
    splitC: [-1.8, -2.7],
    splitHeavy: [2.3, -2.7],
    firstA: [7.5, -5.8, 1],
    firstB: [10.2, -5.8, 1],
    second: [7.5, -1.5, 1],
    thirdA: [10.2, -1.5, 1],
    thirdB: [8, 3.8, 1],
    heavyA: [-1.9, 7.5],
    heavyB: [2.6, 7.5],
  },
};

const advancedLayouts = new Set([
  "recycle-complex",
  "parallel-complex",
  "fractionation-complex",
]);

/** Larger sites fill bays by equipment function, not by graph traversal. Keep
 * low skids south of the rack, compact manifolds north, columns behind them,
 * and use the remaining front skid slots for product receivers. */
function advancedPlacements(original: EquipmentInstance[]) {
  const placements: Record<string, Placement> = {};
  const compact = original.filter((item) =>
    ["Mixer", "Splitter"].includes(item.kind),
  );
  const tall = original.filter((item) =>
    ["PBR", "Distillation"].includes(item.kind),
  );
  const thermal = original.filter((item) =>
    ["Heater", "Cooler"].includes(item.kind),
  );
  compact.forEach((item, i) => {
    const row = Math.floor(i / 6);
    const count = Math.min(6, compact.length - row * 6);
    placements[item.id] = [((i % 6) - (count - 1) / 2) * 4.3, -2.8 - row * 3.5];
  });
  const rear = -6.3 - Math.max(0, Math.ceil(compact.length / 6) - 1) * 3.5;
  tall.forEach((item, i) => {
    placements[item.id] = [(i - (tall.length - 1) / 2) * 4.2, rear];
  });
  const skidSlot = (index: number): Placement => [
    ((index % 9) - 4) * 2.8 + (index >= 9 ? 1.4 : 0),
    3.8 + Math.floor(index / 9) * 4.5,
    1,
  ];
  thermal.forEach((item, i) => {
    placements[item.id] = skidSlot(i);
  });
  const feeds = original.filter((item) => item.kind === "Feed");
  feeds.forEach((item, i) => {
    placements[item.id] = [-15.8, -5.2 + (i - (feeds.length - 1) / 2) * 3.2];
  });
  const products = original.filter((item) => item.kind === "Product");
  const frontSlots = Math.max(0, 18 - thermal.length);
  products.forEach((item, i) => {
    placements[item.id] =
      i < frontSlots
        ? skidSlot(thermal.length + i)
        : [15.6, -5.7 + (i - frontSlots) * 4.5, 1];
  });
  return placements;
}

export function equipmentFootprint(equipment: EquipmentInstance[]) {
  const boxes = equipment.map(equipmentEnvelope);
  const min = [0, 1, 2].map((axis) =>
    Math.min(...boxes.map((box) => box.min[axis])),
  ) as Point;
  const max = [0, 1, 2].map((axis) =>
    Math.max(...boxes.map((box) => box.max[axis])),
  ) as Point;
  return { min, max, area: (max[0] - min[0]) * (max[2] - min[2]) };
}

export function compactPlantLayout(
  id: string,
  original: EquipmentInstance[],
): {
  equipment: EquipmentInstance[];
  site: PlantSite;
} {
  const advanced = advancedLayouts.has(id);
  const placements = advanced ? advancedPlacements(original) : layouts[id];
  if (!placements) throw new Error(`Missing plant layout: ${id}`);
  const equipment = original.map((item) => {
    const placement = placements[item.id];
    if (!placement) throw new Error(`Missing location: ${id}/${item.id}`);
    const [x, z, turn = 0] = placement;
    return { ...item, position: [x, 0, z] as Point, turn };
  });
  const before = equipmentFootprint(original);
  const after = equipmentFootprint(equipment);
  const start = advanced ? -13.2 : id === "parallel" ? -7.7 : -9.5;
  const end = advanced ? 13.2 : id === "integrated" ? 7.2 : 6;
  const count = Math.ceil((end - start) / 3.5);
  const outputCount = original.reduce(
    (total, item) =>
      total +
      (item.kind === "Product"
        ? 0
        : ["Splitter", "Distillation"].includes(item.kind)
          ? 2
          : 1),
    0,
  );
  const rack: PlantRack = {
    start,
    end,
    halfWidth: 1.45,
    levels: advanced
      ? Array.from(
          { length: Math.max(3, Math.ceil(outputCount / 9)) },
          (_, i) => 3.35 + i * 0.7,
        )
      : [3.35, 4.05, 4.75],
    frames: Array.from(
      { length: count + 1 },
      (_, i) => start + ((end - start) * i) / count,
    ),
  };
  return {
    equipment,
    site: {
      rack,
      bounds: { min: after.min, max: after.max },
      equipmentArea: after.area,
      previousEquipmentArea: before.area,
    },
  };
}

import { routePlant } from "@/components/equipment-3d/plant-routing";
import { equipmentFootprint } from "@/components/equipment-3d/plant-layout";
import type { SystemExample } from "@/components/equipment-3d/system-geometry";
import { storyEquipment, storyStreams } from "./landing-process";

/** One set of world coordinates is shared by the drawing, pipes and equipment. */
export function makeLandingSystem(): SystemExample {
  const equipment = storyEquipment.map(
    ({ id, kind, tag, name, position, color, turn }) => ({
      id,
      kind,
      tag,
      title: name,
      position,
      color,
      turn,
      trayCount: 8,
    }),
  );
  const rack = {
    start: -11.7,
    end: 10.5,
    halfWidth: 1.45,
    levels: [3.35, 4.05, 4.75],
    frames: [-11.7, -7.3, -2.85, 1.6, 6, 10.5],
  };
  const footprint = equipmentFootprint(equipment);
  return {
    id: "landing-process",
    title: "From idea to process",
    description: "Reaction, separation and recycle.",
    operation: "An illustrative process walkthrough.",
    equipment,
    streams: routePlant(equipment, storyStreams, rack),
    site: {
      rack,
      bounds: { min: footprint.min, max: footprint.max },
      equipmentArea: footprint.area,
      previousEquipmentArea: footprint.area,
    },
  };
}

/** Smooth geometric interpolation, applied to the spring-smoothed scroll value. */
export function reveal(value: number, from: number, to: number) {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

import type { Kind } from "@/domain/schema";
import type { Point } from "./operation";
import { columnLayout, type EquipmentModelOptions } from "./column-layout";

export const flowColors = { feed: "#008f88", warm: "#d18416", cool: "#168bb9" };

/** Port centers are at the open ends of the authored fittings, in model space. */
export const equipmentPorts: Record<Kind, Record<string, Point>> = {
  Feed: { out: [1.31, 0.35, 0.33] },
  Product: { in: [-1.45, 1.08, 0] },
  Mixer: { in: [1.82, 1.71, 0], dose: [1.39, 1.18, 0], out: [0.73, 2.36, 0] },
  Splitter: {
    in: [-1.375, 1.1, 0],
    a: [1.38, 1.1, -0.62],
    b: [1.38, 1.1, 0.62],
  },
  Heater: { in: [-1.7676, 1.14, 0], out: [1.7676, 1.14, 0] },
  Cooler: { in: [-1.38, 1.5, 0.85], out: [1.38, 1.5, 0.85] },
  PBR: {
    in: [-0.99, 3.55, 0],
    out: [1.04, 0.48, 0.08],
  },
  Distillation: {
    in: [-1.3, 2.97, 0],
    top: [2.1, 5.06, 0],
    bottom: [1.95, 0.42, 0.1],
  },
};

export type EquipmentInstance = {
  id: string;
  kind: Kind;
  position: Point;
  tag: string;
  title: string;
  color: string;
  trayCount?: number;
  column?: EquipmentModelOptions["column"];
  /** Clockwise quarter turns when seen from above, shared by models and ports. */
  turn?: 0 | 1 | 2 | 3;
};
export type PlantRack = {
  start: number;
  end: number;
  halfWidth: number;
  levels: number[];
  frames: number[];
};
export type PlantSite = {
  rack: PlantRack;
  bounds: { min: Point; max: Point };
  equipmentArea: number;
  previousEquipmentArea: number;
};
export type RackMember = { center: Point; size: Point };
export function rackMembers(rack: PlantRack): RackMember[] {
  const members: RackMember[] = [];
  const height = Math.max(...rack.levels) - 0.065;
  for (const x of rack.frames) {
    for (const z of [-rack.halfWidth, rack.halfWidth]) {
      members.push({ center: [x, height / 2, z], size: [0.12, height, 0.12] });
      members.push({ center: [x, 0.07, z], size: [0.38, 0.14, 0.38] });
    }
    for (const level of rack.levels)
      members.push({
        center: [x, level - 0.145, 0],
        size: [0.14, 0.16, rack.halfWidth * 2 + 0.12],
      });
  }
  for (const level of rack.levels)
    for (const z of [-rack.halfWidth, rack.halfWidth])
      members.push({
        center: [(rack.start + rack.end) / 2, level - 0.145, z],
        size: [rack.end - rack.start, 0.16, 0.08],
      });
  return members;
}
export type ProcessStream = {
  id: string;
  from: [string, string];
  to: [string, string];
  points: Point[];
  color: string;
  radius: number;
};
export type SystemExample = {
  id: string;
  title: string;
  description: string;
  operation: string;
  equipment: EquipmentInstance[];
  streams: ProcessStream[];
  site?: PlantSite;
};

/** Exact orthogonal rotations avoid tiny diagonal errors in the routing grid. */
export function rotatePoint([x, y, z]: Point, turn = 0): Point {
  return (
    [
      [x, y, z],
      [z, y, -x],
      [-x, y, -z],
      [-z, y, x],
    ] as Point[]
  )[turn];
}

export function unit(
  id: string,
  kind: Kind,
  position: Point,
  tag: string,
  title: string = kind,
  color = flowColors.feed,
): EquipmentInstance {
  return { id, kind, position, tag, title, color };
}
export function worldPort(
  equipment: EquipmentInstance[],
  endpoint: [string, string],
): Point {
  const item = equipment.find(({ id }) => id === endpoint[0]);
  if (!item) throw new Error(`Missing equipment ${endpoint[0]}`);
  let port = equipmentPorts[item.kind][endpoint[1]];
  if (item.kind === "Distillation" && port) {
    const layout = columnLayout(item);
    port = [...port];
    if (endpoint[1] === "in") port[1] = layout.feedY;
    if (endpoint[1] === "top") port[1] = layout.distillateY;
    port[0] *= layout.radialScale;
    port[2] *= layout.radialScale;
  }
  if (!port) throw new Error(`Missing port ${endpoint.join(".")}`);
  return rotatePoint(port, item.turn).map((v, i) =>
    Number((v + item.position[i]).toFixed(6)),
  ) as Point;
}
export function connect(
  equipment: EquipmentInstance[],
  id: string,
  from: [string, string],
  to: [string, string],
  bends: Point[],
  color = flowColors.feed,
  radius = 0.065,
): ProcessStream {
  return {
    id,
    from,
    to,
    points: [worldPort(equipment, from), ...bends, worldPort(equipment, to)],
    color,
    radius,
  };
}

// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

/** Offline authoring only: the landing page imports the fixed output, never the
 * editor, solver or routing engines. Run with node --import tsx scripts/generate-landing-demo.ts. */
import { writeFileSync } from "node:fs";
import { newUnit, visiblePorts } from "../src/domain/schema";
import { equipmentPort, equipmentSize } from "../src/components/flow-geometry";
import {
  routeStreams,
  type RouteEndpoint,
} from "../src/components/stream-routing";
import { routePlant } from "../src/components/equipment-3d/plant-routing";
import { equipmentFootprint } from "../src/components/equipment-3d/plant-layout";
import {
  storyEquipment,
  storyStreams,
} from "../src/components/landing/landing-process";

const units = storyEquipment.map((item) => {
  const unit = newUnit(
    item.kind,
    item.tag,
    896 + item.position[0] * 64 - 64,
    480 - 76 + (item.position[2] + 1.75) * 64 - 64,
  );
  unit.params.trayCount = 8;
  const geometry = equipmentSize(item.kind, 8);
  const connections = visiblePorts(unit);
  return {
    id: item.tag,
    kind: item.kind,
    name: item.name,
    ...unit.position,
    ...geometry,
    ports: [
      ...connections.inputs.map((id, index) => ({
        id,
        ...equipmentPort(item.kind, false, index, 8),
      })),
      ...connections.outputs.map((id, index) => ({
        id,
        ...equipmentPort(item.kind, true, index, 8),
      })),
    ],
  };
});
const endpoint = (id: string, port: string): RouteEndpoint => {
  const item = storyEquipment.find((item) => item.id === id)!;
  const unit = units.find((unit) => unit.id === item.tag)!;
  const handle = unit.ports.find((p) => p.id === port)!;
  return {
    nodeId: unit.id,
    side: handle.position,
    x:
      unit.x +
      handle.x +
      (handle.position === "right"
        ? 4.5
        : handle.position === "left"
          ? -4.5
          : 0),
    y:
      unit.y +
      handle.y +
      (handle.position === "bottom"
        ? 4.5
        : handle.position === "top"
          ? -4.5
          : 0),
  };
};
const routes = routeStreams(
  storyStreams.map((stream) => ({
    id: stream.id,
    source: endpoint(
      stream.from[0],
      ["b", "bottom"].includes(stream.from[1]) ? "out2" : "out",
    ),
    target: endpoint(stream.to[0], stream.to[1] === "dose" ? "in2" : "in"),
  })),
  units.map((unit) => ({
    id: unit.id,
    x: unit.x - (unit.kind === "PBR" ? 0 : 8),
    y: unit.y - 58,
    width: unit.kind === "PBR" ? 192 : 144,
    height: unit.height + 58,
  })),
);
const drawing = {
  units,
  streams: storyStreams.map((stream, index) => ({
    id: stream.id,
    name:
      stream.id === "recycle"
        ? "Recycle"
        : `S${String(index + 1).padStart(2, "0")}`,
    color: stream.color,
    ...routes.get(stream.id)!,
  })),
};
const equipment = storyEquipment.map(({ name, ...item }) => ({
  ...item,
  title: name,
  trayCount: 8,
}));
const rack = {
  start: -11.7,
  end: 10.5,
  halfWidth: 1.45,
  levels: [3.35, 4.05, 4.75],
  frames: [-11.7, -7.3, -2.85, 1.6, 6, 10.5],
};
const footprint = equipmentFootprint(equipment);
const system = {
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
for (const [name, data] of [
  ["landing-drawing", drawing],
  ["landing-plant", system],
] as const) {
  writeFileSync(
    new URL(`../src/components/landing/${name}.json`, import.meta.url),
    JSON.stringify(data, null, 2) + "\n",
  );
}
console.log("Wrote fixed landing worksheet and 3D routes.");

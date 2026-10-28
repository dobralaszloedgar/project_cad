import type { Connection, Project, Unit } from "@/domain/schema";
import { plantTemplates } from "../../domain/plant-templates";
import type { Point } from "./operation";
import { compactPlantLayout, equipmentFootprint } from "./plant-layout";
import { routePlant, type PlantConnection } from "./plant-routing";
import type {
  EquipmentInstance,
  PlantRack,
  PlantSite,
  SystemExample,
} from "./system-geometry";

const colors = { teal: "#008f88", blue: "#168bb9", amber: "#d18416" };

function templateArrangement(equipment: EquipmentInstance[]) {
  const current = new Map(equipment.map((item) => [item.id, item]));
  const definition = plantTemplates.find(
    (template) =>
      template.equipment.length === equipment.length &&
      template.equipment.every(
        (reference) => current.get(reference.tag)?.kind === reference.kind,
      ),
  );
  if (!definition) return undefined;
  // Layout keys are authoring names; tags are the persisted project's IDs.
  // Only placement comes from the template. Current names, colors, tray counts,
  // and (below) connections still come from the edited project.
  const authored = definition.equipment.map((reference) => ({
    ...current.get(reference.tag)!,
    id: reference.id,
    position: reference.position,
  }));
  const layout = compactPlantLayout(definition.id, authored);
  return {
    items: layout.equipment.map((item) => ({ ...item, id: item.tag })),
    site: layout.site,
  };
}

/** Translate persisted flowsheet ports to their corresponding physical fittings. */
export function modelPort(
  kind: Unit["kind"],
  port: Connection["sourcePort"] | Connection["targetPort"],
) {
  if (kind === "Mixer" && port === "in2") return "dose";
  if (kind === "Splitter" && port === "out") return "a";
  if (kind === "Splitter" && port === "out2") return "b";
  if (kind === "Distillation" && port === "out") return "top";
  if (kind === "Distillation" && port === "out2") return "bottom";
  return port;
}

function processOrder(project: Project): Unit[] {
  const seen = new Set<string>();
  const units = new Map(project.units.map((unit) => [unit.id, unit]));
  const queue = project.units
    .filter((unit) => unit.kind === "Feed")
    .map((unit) => unit.id);
  const order: Unit[] = [];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i],
      unit = units.get(id);
    if (!unit || seen.has(id)) continue;
    seen.add(id);
    order.push(unit);
    for (const edge of project.edges)
      if (edge.source === id) queue.push(edge.target);
  }
  // Disconnected equipment remains visible while a project is being edited.
  return [...order, ...project.units.filter((unit) => !seen.has(unit.id))];
}

function arrange(
  equipment: EquipmentInstance[],
  streamCount: number,
  spacing: number,
) {
  const items = equipment.map((item) => ({
    ...item,
    position: [...item.position] as Point,
  }));
  if (items.length <= 4) {
    const column = items.find((item) => item.kind === "Distillation");
    const feeds = items.filter((item) => item.kind === "Feed");
    const products = items.filter((item) => item.kind === "Product");
    if (
      items.length === 4 &&
      column &&
      feeds.length === 1 &&
      products.length === 2
    ) {
      feeds[0].position = [-5.5 * spacing, 0, 0];
      column.position = [0, 0, 0];
      products.forEach((item, i) => {
        item.position = [5.5 * spacing, 0, (i ? 2.3 : -2.3) * spacing];
      });
    } else
      items.forEach((item, i) => {
        item.position = [(i - (items.length - 1) / 2) * 5.8 * spacing, 0, 0];
      });
    return { items, site: undefined };
  }
  const process = items.filter(
    (item) => item.kind !== "Feed" && item.kind !== "Product",
  );
  const width = Math.max(
    7,
    Math.ceil(Math.sqrt(Math.max(process.length, 1)) * 4.2),
  );
  const compact = process.filter(
    (item) => item.kind === "Mixer" || item.kind === "Splitter",
  );
  const tall = process.filter(
    (item) => item.kind === "PBR" || item.kind === "Distillation",
  );
  const thermal = process.filter(
    (item) => item.kind === "Heater" || item.kind === "Cooler",
  );
  const band = (
    group: EquipmentInstance[],
    pitch: number,
    zStart: number,
    zPitch: number,
    turn: 0 | 1,
  ) => {
    const capacity = Math.max(1, Math.floor(width / pitch));
    group.forEach((item, i) => {
      const row = Math.floor(i / capacity);
      const rowCount = Math.min(capacity, group.length - row * capacity);
      item.position = [
        ((i % capacity) - (rowCount - 1) / 2) * pitch * spacing,
        0,
        (zStart + row * zPitch) * spacing,
      ];
      item.turn = turn;
    });
  };
  band(compact, 3.2, -3.8, -5, 1);
  const compactRows = Math.ceil(
    compact.length / Math.max(1, Math.floor(width / 3.2)),
  );
  band(
    tall,
    4.7,
    compactRows ? -3.8 - (compactRows - 1) * 5 - 4.2 : -3.8,
    -3.5,
    0,
  );
  band(thermal, 3.3, 3.8, 5, 1);
  for (const [kind, side] of [
    ["Feed", -1],
    ["Product", 1],
  ] as const) {
    const bank = items.filter((item) => item.kind === kind);
    const columns = Math.max(1, Math.ceil(Math.sqrt(bank.length / 2)));
    const rows = Math.ceil(bank.length / columns);
    bank.forEach((item, i) => {
      const col = Math.floor(i / rows),
        row = i % rows;
      item.position = [
        side * (width / 2 + 3 + col * 3) * spacing,
        0,
        (row - (rows - 1) / 2) * (kind === "Feed" ? 3.1 : 4.6) * spacing,
      ];
      item.turn = kind === "Feed" ? 0 : 1;
    });
  }
  const start = -(width / 2 + 0.7) * spacing,
    end = -start;
  const spans = Math.ceil((end - start) / 3.5);
  const rack: PlantRack = {
    start,
    end,
    halfWidth: 1.45,
    levels: Array.from(
      { length: Math.max(2, Math.ceil(streamCount / 9)) },
      (_, i) => 3.35 + i * 0.7,
    ),
    frames: Array.from(
      { length: spans + 1 },
      (_, i) => start + ((end - start) * i) / spans,
    ),
  };
  const footprint = equipmentFootprint(items);
  return {
    items,
    site: {
      rack,
      bounds: { min: footprint.min, max: footprint.max },
      equipmentArea: footprint.area,
      previousEquipmentArea: footprint.area,
    },
  };
}

function buildArrangement(project: Project): SystemExample {
  const equipment: EquipmentInstance[] = processOrder(project).map((unit) => ({
    id: unit.id,
    kind: unit.kind,
    tag: unit.id,
    title: unit.name,
    position: [0, 0, 0],
    trayCount: unit.params.trayCount,
    color:
      colors[
        (
          project.edges.find((edge) => edge.source === unit.id) ??
          project.edges.find((edge) => edge.target === unit.id)
        )?.color ?? "teal"
      ],
  }));
  const kinds = new Map(project.units.map((unit) => [unit.id, unit.kind]));
  const connections: PlantConnection[] = project.edges.map((edge) => {
    const source = kinds.get(edge.source),
      target = kinds.get(edge.target);
    if (!source || !target) throw new Error(`Missing equipment for ${edge.id}`);
    return {
      id: edge.id,
      from: [edge.source, modelPort(source, edge.sourcePort)],
      to: [edge.target, modelPort(target, edge.targetPort)],
      color: colors[edge.color],
    };
  });
  let failure: unknown;
  const preferred = templateArrangement(equipment);
  const candidates: { items: EquipmentInstance[]; site?: PlantSite }[] = [
    ...(preferred ? [preferred] : []),
    ...[1, 1.2, 1.5].map((spacing) =>
      arrange(equipment, connections.length, spacing),
    ),
  ];
  for (const { items, site } of candidates) {
    try {
      return {
        id: "workspace",
        title: project.name,
        description: "Equipment arranged in compact process bays.",
        operation: "Illustrative equipment operation.",
        equipment: items,
        streams: routePlant(items, connections, site?.rack),
        site,
      };
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

const layouts = new Map<string, SystemExample>();

/** A derived 3D arrangement. Never changes saved equipment IDs, graph, or 2D positions.
 * Retain the same scene across 2D drags and operating-condition edits: those edits
 * do not change physical geometry and must not reroute pipes or reset the camera. */
export function buildProjectPlant(project: Project): SystemExample {
  const key = JSON.stringify([
    project.name,
    project.units.map(({ id, kind, name, params }) => [
      id,
      kind,
      name,
      params.trayCount,
    ]),
    project.edges.map(
      ({ id, source, target, sourcePort, targetPort, color }) => [
        id,
        source,
        target,
        sourcePort,
        targetPort,
        color,
      ],
    ),
  ]);
  const previous = layouts.get(key);
  if (previous) {
    layouts.delete(key);
    layouts.set(key, previous);
    return previous;
  }
  const layout = buildArrangement(project);
  if (layouts.size >= 8) layouts.delete(layouts.keys().next().value!);
  layouts.set(key, layout);
  return layout;
}

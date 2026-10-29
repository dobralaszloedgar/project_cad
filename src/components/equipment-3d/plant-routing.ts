import { columnLayout } from "./column-layout";
import type { Point } from "./operation";
import {
  worldPort,
  rotatePoint,
  rackMembers,
  type EquipmentInstance,
  type PlantRack,
  type ProcessStream,
} from "./system-geometry";

export type PlantConnection = {
  id: string;
  from: [string, string];
  to: [string, string];
  color: string;
  radius?: number;
};
type Bounds = { min: Point; max: Point };
type Segment = { a: Point; b: Point };
const rounded = (point: Point): Point =>
  point.map((v) => Number(v.toFixed(6))) as Point;

/** Conservative routing envelopes around assemblies. The straight nozzle leads
 * leave their own envelope before joining the shared routing grid. */
export function equipmentEnvelope(item: EquipmentInstance): Bounds {
  const boxes: Record<EquipmentInstance["kind"], [Point, Point]> = {
    Feed: [
      [-0.98, 0, -0.98],
      [0.98, 2.98, 1.05],
    ],
    Product: [
      [-1.36, 0, -0.9],
      [1.92, 1.95, 0.9],
    ],
    Mixer: [
      [-1.95, 0, -0.8],
      [1.94, 2.44, 0.8],
    ],
    Splitter: [
      [-1.38, 0, -0.95],
      [1.4, 1.85, 0.95],
    ],
    Heater: [
      [-1.78, 0, -0.88],
      [1.78, 2.55, 0.88],
    ],
    Cooler: [
      [-1.57, 0, -0.9],
      [1.57, 2.55, 0.82],
    ],
    PBR: [
      [-0.85, 0, -0.93],
      [1.06, 4.18, 1.08],
    ],
    Distillation: [
      [-1.12, 0, -0.98],
      [2.22, columnLayout(item).totalHeight, 1.12],
    ],
  };
  const [min, max] = boxes[item.kind];
  const corners = [rotatePoint(min, item.turn), rotatePoint(max, item.turn)];
  return {
    min: min.map(
      (_, axis) =>
        Math.min(...corners.map((p) => p[axis])) + item.position[axis],
    ) as Point,
    max: max.map(
      (_, axis) =>
        Math.max(...corners.map((p) => p[axis])) + item.position[axis],
    ) as Point,
  };
}

function portDirection(item: EquipmentInstance, port: string): Point {
  const local: Point =
    item.kind === "Mixer"
      ? [0, 1, 0]
      : item.kind === "Cooler"
        ? [0, 0, 1]
        : item.kind === "PBR" && port === "in"
          ? [0, -1, 0]
          : [port === "in" || port === "in2" ? -1 : 1, 0, 0];
  return rotatePoint(local, item.turn);
}

function lead(
  equipment: EquipmentInstance[],
  endpoint: [string, string],
): Segment {
  const item = equipment.find((unit) => unit.id === endpoint[0])!;
  const a = worldPort(equipment, endpoint);
  const direction = portDirection(item, endpoint[1]);
  const axis = direction.findIndex((value) => value !== 0);
  const bounds = equipmentEnvelope(item);
  const alreadyOutside = a.some(
    (value, i) => value < bounds.min[i] - 0.1 || value > bounds.max[i] + 0.1,
  );
  const boundary =
    direction[axis] > 0 ? bounds.max[axis] + 0.28 : bounds.min[axis] - 0.28;
  const distance = alreadyOutside
    ? 0.42
    : Math.max(0.42, (boundary - a[axis]) * direction[axis]);
  const b = rounded(
    a.map((value, i) => value + direction[i] * distance) as Point,
  );
  return { a, b };
}

export function segmentTouchesBox(
  a: Point,
  b: Point,
  box: Bounds,
  clearance = 0,
): boolean {
  // Every routing-grid edge is axis aligned, so this interval test is exact.
  return a.every(
    (_, axis) =>
      Math.max(a[axis], b[axis]) >= box.min[axis] - clearance &&
      Math.min(a[axis], b[axis]) <= box.max[axis] + clearance,
  );
}
function segmentBox(segment: Segment): Bounds {
  return {
    min: segment.a.map((value, i) => Math.min(value, segment.b[i])) as Point,
    max: segment.a.map((value, i) => Math.max(value, segment.b[i])) as Point,
  };
}

class PriorityQueue {
  private items: { id: number; score: number }[] = [];
  push(item: { id: number; score: number }) {
    let i = this.items.push(item) - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].score <= item.score) break;
      this.items[i] = this.items[parent];
      i = parent;
    }
    this.items[i] = item;
  }
  pop() {
    if (!this.items.length) return undefined;
    const first = this.items[0],
      last = this.items.pop()!;
    if (this.items.length) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let child = i * 2 + 1;
        if (
          child + 1 < this.items.length &&
          this.items[child + 1].score < this.items[child].score
        )
          child++;
        if (this.items[child].score >= last.score) break;
        this.items[i] = this.items[child];
        i = child;
      }
      this.items[i] = last;
    }
    return first;
  }
}

const key = (point: Point) => point.map((value) => value.toFixed(6)).join(",");
const distance = (a: Point, b: Point) =>
  a.reduce((sum, value, axis) => sum + Math.abs(value - b[axis]), 0);
const simplify = (points: Point[]) =>
  points.filter((point, i) => {
    if (!i || i === points.length - 1) return true;
    const before = points[i - 1],
      after = points[i + 1];
    return point.some(
      (value, axis) => value !== before[axis] && value === after[axis],
    );
  });

/** Routes the large examples in three dimensions, avoiding equipment envelopes,
 * every reserved nozzle lead, and previously routed pipes. No crossing is a
 * hidden junction. Clearances also leave room for the shared rounded elbows. */
export function routePlant(
  equipment: EquipmentInstance[],
  connections: PlantConnection[],
  rack?: PlantRack,
): ProcessStream[] {
  const terminals = connections.map((connection) => ({
    source: lead(equipment, connection.from),
    target: lead(equipment, connection.to),
  }));
  const boxes = equipment.map(equipmentEnvelope);
  const steel = rack
    ? rackMembers(rack).map(({ center, size }) => ({
        min: center.map((v, i) => v - size[i] / 2) as Point,
        max: center.map((v, i) => v + size[i] / 2) as Point,
      }))
    : [];
  // Give each long connection its own supported lane. Parallel pipes remain
  // separate streams; sharing the rack never creates an implicit junction.
  let lane = 0;
  const trunks: (Segment | undefined)[] = terminals.map(
    ({ source, target }) => {
      if (!rack || distance(source.b, target.b) < 5) return undefined;
      const clamp = (x: number) =>
        Math.max(rack.start + 0.3, Math.min(rack.end - 0.3, x));
      let x1 = clamp(source.b[0]),
        x2 = clamp(target.b[0]);
      if (Math.abs(x1 - x2) < 0.6) {
        const middle = Math.max(
          rack.start + 0.7,
          Math.min(rack.end - 0.7, (x1 + x2) / 2),
        );
        x1 = middle - 0.35;
        x2 = middle + 0.35;
      }
      const z = -1.12 + (lane % 9) * 0.28;
      const y = rack.levels[Math.floor(lane / 9)];
      if (y === undefined) throw new Error("Pipe rack has no free lane");
      lane++;
      return { a: rounded([x1, y, z]), b: rounded([x2, y, z]) };
    },
  );
  const coordinates = [new Set<number>(), new Set<number>(), new Set<number>()];
  for (const item of equipment) {
    for (const offset of [-2.35, 2.35])
      coordinates[0].add(item.position[0] + offset);
    for (const offset of [-2.25, 2.25])
      coordinates[2].add(item.position[2] + offset);
  }
  for (const y of [
    0.42, 0.72, 1.02, 1.32, 1.62, 1.92, 2.7, 3.2, 3.8, 4.5, 5.3, 6.2, 7.2,
  ])
    coordinates[1].add(y);
  for (const pair of terminals)
    for (const point of [pair.source.b, pair.target.b])
      point.forEach((value, axis) => coordinates[axis].add(value));
  for (const trunk of trunks) {
    if (!trunk) continue;
    for (const point of [trunk.a, trunk.b])
      point.forEach((value, axis) => coordinates[axis].add(value));
  }
  if (rack) {
    for (const y of rack.levels)
      for (const dy of [-0.32, 0, 0.32]) coordinates[1].add(y + dy);
    for (const z of [-rack.halfWidth - 0.35, rack.halfWidth + 0.35])
      coordinates[2].add(z);
    for (const x of [rack.start - 0.4, rack.end + 0.4]) coordinates[0].add(x);
  }
  const axes = coordinates.map((values) =>
    [...new Set([...values].map((v) => Number(v.toFixed(6))))].sort(
      (a, b) => a - b,
    ),
  );
  const ny = axes[1].length,
    nz = axes[2].length;
  const encode = (x: number, y: number, z: number) => (x * ny + y) * nz + z;
  const decode = (id: number): Point => [
    Math.floor(id / (ny * nz)),
    Math.floor(id / nz) % ny,
    id % nz,
  ];
  const pointAt = (id: number): Point =>
    decode(id).map((index, axis) => axes[axis][index]) as Point;
  const idAt = (point: Point) =>
    encode(...(point.map((value, axis) => axes[axis].indexOf(value)) as Point));
  const staticEdges = new Map<string, boolean>();
  const routed: Segment[] = [];

  return connections.map((connection, routeIndex) => {
    const { source, target } = terminals[routeIndex];
    const occupied = routed.map(segmentBox);
    trunks.forEach((trunk, index) => {
      if (trunk && index !== routeIndex) occupied.push(segmentBox(trunk));
    });
    terminals.forEach((pair, index) => {
      if (index !== routeIndex)
        occupied.push(segmentBox(pair.source), segmentBox(pair.target));
    });
    const trunk = trunks[routeIndex];
    function findPath(from: Point, to: Point): Point[] {
      let ownTrunk: Bounds | undefined;
      if (trunk) {
        const joint = from === source.b ? trunk.a : trunk.b;
        const far = from === source.b ? trunk.b : trunk.a;
        const near: Point = [
          joint[0] + Math.sign(far[0] - joint[0]) * 0.24,
          joint[1],
          joint[2],
        ];
        ownTrunk = segmentBox({ a: near, b: far });
      }
      const start = idAt(from),
        goal = idAt(to);
      const queue = new PriorityQueue();
      const costs = new Map<number, number>([[start, 0]]);
      const parent = new Map<number, number>();
      const closed = new Set<number>();
      queue.push({ id: start, score: distance(from, to) });
      let found = false;
      while (true) {
        const next = queue.pop();
        if (!next) break;
        const id = next.id;
        if (closed.has(id)) continue;
        if (id === goal) {
          found = true;
          break;
        }
        closed.add(id);
        const indices = decode(id),
          a = pointAt(id);
        for (let axis = 0; axis < 3; axis++)
          for (const sign of [-1, 1]) {
            const index = indices[axis] + sign;
            if (index < 0 || index >= axes[axis].length) continue;
            const neighborIndices = [...indices] as Point;
            neighborIndices[axis] = index;
            const neighbor = encode(...neighborIndices);
            if (closed.has(neighbor)) continue;
            const b = pointAt(neighbor);
            const edgeKey =
              id < neighbor ? `${id}:${neighbor}` : `${neighbor}:${id}`;
            let clear = staticEdges.get(edgeKey);
            if (clear === undefined) {
              clear =
                !boxes.some((box) => segmentTouchesBox(a, b, box, 0.1)) &&
                !steel.some((box) => segmentTouchesBox(a, b, box, 0.03));
              staticEdges.set(edgeKey, clear);
            }
            if (
              !clear ||
              (ownTrunk && segmentTouchesBox(a, b, ownTrunk, 0.2)) ||
              occupied.some((box) => segmentTouchesBox(a, b, box, 0.2))
            )
              continue;
            const previous = parent.get(id);
            const turn =
              previous !== undefined && pointAt(previous)[axis] === a[axis]
                ? 0.35
                : 0;
            const cost = costs.get(id)! + distance(a, b) + turn;
            if (cost >= (costs.get(neighbor) ?? Infinity)) continue;
            costs.set(neighbor, cost);
            parent.set(neighbor, id);
            queue.push({ id: neighbor, score: cost + distance(b, to) });
          }
      }
      if (!found)
        throw new Error(
          `No clear pipe route for ${connection.id} between ${from.join(",")} and ${to.join(",")}`,
        );
      const path = [to];
      let current = goal;
      while (current !== start) {
        current = parent.get(current)!;
        path.push(pointAt(current));
      }
      path.reverse();
      return path;
    }
    const first = findPath(source.b, trunk?.a ?? target.b);
    // Reserve the first branch while routing the second, so a stream cannot
    // fold through itself on its way back from the common rack.
    for (let i = 1; i < first.length; i++)
      occupied.push(segmentBox({ a: first[i - 1], b: first[i] }));
    const path = trunk ? [...first, ...findPath(trunk.b, target.b)] : first;
    const points = simplify(
      [source.a, ...path, target.a].filter(
        (point, index, list) => !index || key(point) !== key(list[index - 1]),
      ),
    );
    for (let i = 1; i < points.length; i++)
      routed.push({ a: points[i - 1], b: points[i] });
    return { ...connection, points, radius: connection.radius ?? 0.065 };
  });
}

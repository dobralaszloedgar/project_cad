import { Position } from "@xyflow/react";

export type FlowObstacle = { id: string; x: number; y: number };
type Point = { x: number; y: number };
type Rect = { left: number; right: number; top: number; bottom: number };
type Geometry = {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  source: string;
  target: string;
};
const bounds = (node: FlowObstacle): Rect => ({
  left: node.x - 32,
  right: node.x + 160,
  top: node.y - 32,
  bottom: node.y + 172,
});
function clearSegment(a: Point, b: Point, obstacles: Rect[]) {
  return !obstacles.some((rect) =>
    a.y === b.y
      ? a.y > rect.top &&
        a.y < rect.bottom &&
        Math.max(a.x, b.x) > rect.left &&
        Math.min(a.x, b.x) < rect.right
      : a.x > rect.left &&
        a.x < rect.right &&
        Math.max(a.y, b.y) > rect.top &&
        Math.min(a.y, b.y) < rect.bottom,
  );
}
function stub(
  point: Point,
  side: Position,
  rect: Rect,
  clearance: number,
): Point {
  if (side === Position.Left) return { x: rect.left - clearance, y: point.y };
  if (side === Position.Right) return { x: rect.right + clearance, y: point.y };
  if (side === Position.Top) return { x: point.x, y: rect.top - clearance };
  return { x: point.x, y: rect.bottom + clearance };
}
function path(points: Point[]) {
  const compact: Point[] = [];
  for (const point of points) {
    const last = compact.at(-1),
      before = compact.at(-2);
    if (last?.x === point.x && last.y === point.y) continue;
    if (
      before &&
      last &&
      ((before.x === last.x && last.x === point.x) ||
        (before.y === last.y && last.y === point.y))
    )
      compact.pop();
    compact.push(point);
  }
  return compact
    .map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`)
    .join(" ");
}
class Queue {
  items: { state: number; score: number }[] = [];
  push(item: { state: number; score: number }) {
    let index = this.items.length;
    this.items.push(item);
    while (index) {
      const parent = (index - 1) >> 1;
      if (this.items[parent].score <= item.score) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = item;
  }
  pop() {
    const result = this.items[0],
      last = this.items.pop()!;
    if (this.items.length) {
      let index = 0;
      while (index * 2 + 1 < this.items.length) {
        let child = index * 2 + 1;
        if (
          child + 1 < this.items.length &&
          this.items[child + 1].score < this.items[child].score
        )
          child++;
        if (last.score <= this.items[child].score) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return result;
  }
}

/** Route between the actual React Flow handles, around equipment and its labels. */
export function routedStreamPath(
  geometry: Geometry,
  nodes: FlowObstacle[],
  lane = 0,
): string | undefined {
  const source = nodes.find((node) => node.id === geometry.source),
    target = nodes.find((node) => node.id === geometry.target);
  if (!source || !target || source === target) return;
  const obstacles = nodes.map(bounds);
  const clearance = 8 + (lane % 8) * 4;
  const from = { x: geometry.sourceX, y: geometry.sourceY },
    to = { x: geometry.targetX, y: geometry.targetY };
  const a = stub(from, geometry.sourcePosition, bounds(source), clearance),
    b = stub(to, geometry.targetPosition, bounds(target), clearance);
  const candidates = [
    [a, { x: b.x, y: a.y }, b],
    [a, { x: a.x, y: b.y }, b],
  ];
  for (const candidate of candidates) {
    if (
      candidate
        .slice(1)
        .every((point, i) => clearSegment(candidate[i], point, obstacles))
    )
      return path([from, ...candidate, to]);
  }
  const xs = [
    ...new Set([
      a.x,
      b.x,
      ...obstacles.flatMap((rect) => [
        rect.left - clearance,
        rect.right + clearance,
      ]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      a.y,
      b.y,
      ...obstacles.flatMap((rect) => [
        rect.top - clearance,
        rect.bottom + clearance,
      ]),
    ]),
  ].sort((a, b) => a - b);
  const size = xs.length * ys.length * 3;
  const costs = new Float64Array(size).fill(Infinity),
    previous = new Int32Array(size).fill(-1),
    closed = new Uint8Array(size);
  const start = (xs.indexOf(a.x) * ys.length + ys.indexOf(a.y)) * 3;
  const goal = xs.indexOf(b.x) * ys.length + ys.indexOf(b.y);
  const queue = new Queue();
  costs[start] = 0;
  queue.push({
    state: start,
    score: Math.abs(a.x - b.x) + Math.abs(a.y - b.y),
  });
  while (queue.items.length) {
    const { state } = queue.pop();
    if (closed[state]) continue;
    closed[state] = 1;
    const cell = Math.floor(state / 3),
      direction = state % 3,
      x = Math.floor(cell / ys.length),
      y = cell % ys.length;
    if (cell === goal) {
      const points: Point[] = [];
      for (let cursor = state; cursor >= 0; cursor = previous[cursor]) {
        const index = Math.floor(cursor / 3);
        points.push({
          x: xs[Math.floor(index / ys.length)],
          y: ys[index % ys.length],
        });
      }
      return path([from, ...points.reverse(), to]);
    }
    const point = { x: xs[x], y: ys[y] };
    for (const [dx, dy, axis] of [
      [-1, 0, 1],
      [1, 0, 1],
      [0, -1, 2],
      [0, 1, 2],
    ]) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= xs.length || ny >= ys.length) continue;
      const next = (nx * ys.length + ny) * 3 + axis,
        end = { x: xs[nx], y: ys[ny] };
      if (closed[next] || !clearSegment(point, end, obstacles)) continue;
      const cost =
        costs[state] +
        Math.abs(end.x - point.x) +
        Math.abs(end.y - point.y) +
        (direction && direction !== axis ? 24 : 0);
      if (cost >= costs[next]) continue;
      costs[next] = cost;
      previous[next] = state;
      queue.push({
        state: next,
        score: cost + Math.abs(end.x - b.x) + Math.abs(end.y - b.y),
      });
    }
  }
}

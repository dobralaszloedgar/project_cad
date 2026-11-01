export type RoutePoint = { x: number; y: number };
type Side = "left" | "right" | "top" | "bottom";
export type RouteEndpoint = RoutePoint & { side: Side; nodeId: string };
export type StreamConnection = {
  id: string;
  source: RouteEndpoint;
  target: RouteEndpoint;
};
export type RouteObstacle = RoutePoint & {
  id: string;
  width: number;
  height: number;
};
export type StreamRoute = {
  points: RoutePoint[];
  path: string;
  label: RoutePoint;
};
type Segment = { a: RoutePoint; b: RoutePoint };

const LANE = 24;
const CLEARANCE = 8;
const RADIUS = 5;
const BEND_COST = 12;
const directions: Record<Side, RoutePoint> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};
const length = (a: RoutePoint, b: RoutePoint) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const overlap = (a: number, b: number, c: number, d: number) =>
  Math.max(
    0,
    Math.min(Math.max(a, b), Math.max(c, d)) -
      Math.max(Math.min(a, b), Math.min(c, d)),
  );
const segments = (points: RoutePoint[]): Segment[] =>
  points.slice(1).map((b, i) => ({ a: points[i], b }));

function simplify(points: RoutePoint[]) {
  const result: RoutePoint[] = [];
  for (const point of points) {
    if (result.length && length(result.at(-1)!, point) < 0.001) continue;
    const a = result.at(-2),
      b = result.at(-1);
    // Only collapse runs that continue in the same direction, never U-turns.
    if (
      a &&
      b &&
      ((a.x === b.x && b.x === point.x && (b.y - a.y) * (point.y - b.y) >= 0) ||
        (a.y === b.y && b.y === point.y && (b.x - a.x) * (point.x - b.x) >= 0))
    )
      result.pop();
    result.push(point);
  }
  return result;
}

function lead(
  endpoint: RouteEndpoint,
  obstacles: RouteObstacle[],
  extra: number,
): RoutePoint {
  const direction = directions[endpoint.side];
  const own = obstacles.find((obstacle) => obstacle.id === endpoint.nodeId);
  let distance = LANE;
  if (own) {
    const boundary =
      endpoint.side === "left"
        ? endpoint.x - own.x
        : endpoint.side === "right"
          ? own.x + own.width - endpoint.x
          : endpoint.side === "top"
            ? endpoint.y - own.y
            : own.y + own.height - endpoint.y;
    distance = Math.max(distance, boundary + CLEARANCE);
  }
  return {
    x: endpoint.x + direction.x * (distance + extra),
    y: endpoint.y + direction.y * (distance + extra),
  };
}

function obstacleLength({ a, b }: Segment, obstacle: RouteObstacle) {
  const left = obstacle.x - CLEARANCE,
    right = obstacle.x + obstacle.width + CLEARANCE;
  const top = obstacle.y - CLEARANCE,
    bottom = obstacle.y + obstacle.height + CLEARANCE;
  if (a.y === b.y)
    return a.y > top && a.y < bottom ? overlap(a.x, b.x, left, right) : 0;
  return a.x > left && a.x < right ? overlap(a.y, b.y, top, bottom) : 0;
}

type IndexedRun = { coordinate: number; low: number; high: number };

function lowerBound(runs: IndexedRun[], coordinate: number) {
  let low = 0,
    high = runs.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (runs[middle].coordinate < coordinate) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Only inspect lanes that can overlap or cross a candidate segment. */
class CongestionIndex {
  private horizontal: IndexedRun[] = [];
  private vertical: IndexedRun[] = [];

  constructor(occupied: Segment[]) {
    for (const { a, b } of occupied) {
      const horizontal = a.y === b.y;
      (horizontal ? this.horizontal : this.vertical).push({
        coordinate: horizontal ? a.y : a.x,
        low: horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y),
        high: horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y),
      });
    }
    this.horizontal.sort((a, b) => a.coordinate - b.coordinate);
    this.vertical.sort((a, b) => a.coordinate - b.coordinate);
  }

  adjacentLanes(horizontal: boolean) {
    return (horizontal ? this.horizontal : this.vertical).flatMap((run) => [
      run.coordinate - LANE,
      run.coordinate + LANE,
    ]);
  }

  sharesRun({ a, b }: Segment) {
    const horizontal = a.y === b.y;
    const runs = horizontal ? this.horizontal : this.vertical;
    const coordinate = horizontal ? a.y : a.x;
    const low = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
    const high = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
    for (
      let i = lowerBound(runs, coordinate - 0.5);
      i < runs.length && runs[i].coordinate < coordinate + 0.5;
      i++
    )
      if (runs[i].high > low && runs[i].low < high) return true;
    return false;
  }

  cost({ a, b }: Segment, grid = false) {
    const horizontal = a.y === b.y;
    const coordinate = horizontal ? a.y : a.x;
    const low = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
    const high = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
    const parallel = horizontal ? this.horizontal : this.vertical;
    const perpendicular = horizontal ? this.vertical : this.horizontal;
    let cost = 0;
    for (
      let i = lowerBound(parallel, coordinate - LANE);
      i < parallel.length && parallel[i].coordinate < coordinate + LANE;
      i++
    ) {
      const other = parallel[i];
      const distance = Math.abs(coordinate - other.coordinate);
      const shared = Math.max(
        0,
        Math.min(high, other.high) - Math.max(low, other.low),
      );
      // Shared runs are much harder to read than isolated crossings.
      cost += shared * (distance < 0.5 ? 1000 : 20 * (1 - distance / LANE));
    }
    for (
      let i = lowerBound(perpendicular, low);
      i < perpendicular.length && perpendicular[i].coordinate <= high;
      i++
    ) {
      const other = perpendicular[i];
      if (coordinate <= other.low || coordinate >= other.high) continue;
      if (other.coordinate > low && other.coordinate < high) cost += 60;
      // A grid can split a crossing in two. Charge half at each end so the
      // search cannot make crossings free by inserting a vertex on a stream.
      else if (grid) cost += 30;
    }
    return cost;
  }
}

function roundedRoute(points: RoutePoint[]): StreamRoute {
  let path = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1],
      corner = points[i],
      next = points[i + 1];
    const incoming = length(previous, corner),
      outgoing = length(corner, next);
    const radius = Math.min(RADIUS, incoming / 2, outgoing / 2);
    const before = {
      x: corner.x + ((previous.x - corner.x) * radius) / incoming,
      y: corner.y + ((previous.y - corner.y) * radius) / incoming,
    };
    const after = {
      x: corner.x + ((next.x - corner.x) * radius) / outgoing,
      y: corner.y + ((next.y - corner.y) * radius) / outgoing,
    };
    path += `L${before.x} ${before.y}Q${corner.x} ${corner.y} ${after.x} ${after.y}`;
  }
  const end = points.at(-1)!;
  path += `L${end.x} ${end.y}`;
  const runs = segments(points);
  let remaining = runs.reduce((sum, { a, b }) => sum + length(a, b), 0) / 2;
  let label = points[0];
  for (const { a, b } of runs) {
    const size = length(a, b);
    if (remaining <= size) {
      label = {
        x: a.x + ((b.x - a.x) * remaining) / size,
        y: a.y + ((b.y - a.y) * remaining) / size,
      };
      break;
    }
    remaining -= size;
  }
  return { points, path, label };
}

type SearchEntry = { state: number; score: number; cost: number };

class RouteQueue {
  private items: SearchEntry[] = [];

  push(entry: SearchEntry) {
    let index = this.items.length;
    this.items.push(entry);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.items[parent].score <= entry.score) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = entry;
  }

  pop(): SearchEntry | undefined {
    const first = this.items[0];
    const last = this.items.pop();
    if (last && this.items.length) {
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
    return first;
  }
}

/** Search equipment boundaries when a short dogleg cannot find a clear lane. */
function searchRoute(
  source: RouteEndpoint,
  target: RouteEndpoint,
  start: RoutePoint,
  end: RoutePoint,
  obstacles: RouteObstacle[],
  congestion: CongestionIndex,
  xLanes: number[],
  yLanes: number[],
  maxScore: number,
): RoutePoint[] | undefined {
  const first = { a: source, b: start },
    last = { a: end, b: target };
  // A lead trapped inside another unit cannot be repaired by the middle route.
  if (
    obstacles.some(
      (obstacle) =>
        (obstacle.id !== source.nodeId &&
          obstacleLength(first, obstacle) > 0) ||
        (obstacle.id !== target.nodeId && obstacleLength(last, obstacle) > 0),
    )
  )
    return;
  const xs = [
    ...new Set([
      start.x,
      end.x,
      ...xLanes,
      ...congestion.adjacentLanes(false),
      ...obstacles.flatMap((o) => [o.x - CLEARANCE, o.x + o.width + CLEARANCE]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      start.y,
      end.y,
      ...yLanes,
      ...congestion.adjacentLanes(true),
      ...obstacles.flatMap((o) => [
        o.y - CLEARANCE,
        o.y + o.height + CLEARANCE,
      ]),
    ]),
  ].sort((a, b) => a - b);
  const directionIndex: Record<Side, number> = {
    right: 0,
    bottom: 1,
    left: 2,
    top: 3,
  };
  const steps = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  const cellCount = xs.length * ys.length;
  const costs = new Float64Array(cellCount * 4).fill(Infinity);
  const previous = new Int32Array(cellCount * 4).fill(-1);
  // Each undirected grid edge is checked once, regardless of arrival direction.
  const edgeCosts = new Float64Array(cellCount * 2).fill(-1);
  const startCell = xs.indexOf(start.x) * ys.length + ys.indexOf(start.y);
  const goal = xs.indexOf(end.x) * ys.length + ys.indexOf(end.y);
  const initial = startCell * 4 + directionIndex[source.side];
  const finalDirection = (directionIndex[target.side] + 2) % 4;
  const leadCost =
    length(source, start) +
    length(end, target) +
    congestion.cost(first) +
    congestion.cost(last);
  const limit = maxScore - leadCost;
  const queue = new RouteQueue();
  costs[initial] = 0;
  queue.push({ state: initial, cost: 0, score: length(start, end) });
  let entry: SearchEntry | undefined;
  while ((entry = queue.pop())) {
    const { state, cost, score } = entry;
    if (score >= limit) break;
    if (cost !== costs[state]) continue;
    const cell = Math.floor(state / 4),
      direction = state % 4;
    if (cell === goal && direction !== (finalDirection + 2) % 4) {
      const points: RoutePoint[] = [];
      for (let cursor = state; cursor !== -1; cursor = previous[cursor]) {
        const index = Math.floor(cursor / 4);
        points.push({
          x: xs[Math.floor(index / ys.length)],
          y: ys[index % ys.length],
        });
      }
      return points.reverse();
    }
    const x = Math.floor(cell / ys.length),
      y = cell % ys.length;
    const a = { x: xs[x], y: ys[y] };
    for (let nextDirection = 0; nextDirection < steps.length; nextDirection++) {
      if (nextDirection === (direction + 2) % 4) continue;
      const [dx, dy] = steps[nextDirection];
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= xs.length || ny >= ys.length) continue;
      const nextCell = nx * ys.length + ny;
      if (nextCell === goal && nextDirection === (finalDirection + 2) % 4)
        continue;
      const b = { x: xs[nx], y: ys[ny] };
      const edge = Math.min(cell, nextCell) * 2 + (dx ? 0 : 1);
      let edgeCost = edgeCosts[edge];
      if (edgeCost < 0) {
        const run = { a, b };
        edgeCost = obstacles.some((o) => obstacleLength(run, o) > 0)
          ? Infinity
          : length(a, b) + congestion.cost(run, true);
        edgeCosts[edge] = edgeCost;
      }
      const next = nextCell * 4 + nextDirection;
      const nextCost =
        cost + edgeCost + (direction === nextDirection ? 0 : BEND_COST);
      const remaining =
        length(b, end) +
        (nextCell === goal && nextDirection !== finalDirection ? BEND_COST : 0);
      if (nextCost >= costs[next] || nextCost + remaining >= limit) continue;
      costs[next] = nextCost;
      previous[next] = state;
      queue.push({ state: next, cost: nextCost, score: nextCost + remaining });
    }
  }
}

/**
 * Route the displayed graph together in a stable order. Candidate lanes include
 * equipment boundaries and adjacent lanes of earlier streams, with a grid search
 * for obstructed or shared runs. Overlapping equipment can still force crossings.
 * Nothing is persisted, and zoom/selection do not participate in the geometry.
 */
export function routeStreams(
  connections: StreamConnection[],
  obstacles: RouteObstacle[],
): Map<string, StreamRoute> {
  const routes = new Map<string, StreamRoute>();
  const ordered = [...connections].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const routeSegments = new Map<string, Segment[]>();
  const searchedRoutes = new Set<string>();
  // A second pass lets earlier streams move out around later ones. In particular,
  // two backward connections can form nested loops instead of crossing twice.
  for (let pass = 0; pass < 2; pass++)
    for (const connection of ordered) {
      const occupied = [...routeSegments.entries()].flatMap(([id, runs]) =>
        id === connection.id ? [] : runs,
      );
      const congestion = new CongestionIndex(occupied);
      const existing = routes.get(connection.id);
      if (
        pass &&
        existing &&
        !routeSegments
          .get(connection.id)!
          .some((run) => congestion.cost(run) > 0)
      )
        continue;
      const { source, target } = connection;
      const start = lead(source, obstacles, 0),
        end = lead(target, obstacles, 0);
      const xs = new Set([(start.x + end.x) / 2]);
      const ys = new Set([(start.y + end.y) / 2]);
      const minX = Math.min(start.x, end.x) - LANE * 4,
        maxX = Math.max(start.x, end.x) + LANE * 4;
      const minY = Math.min(start.y, end.y) - LANE * 4,
        maxY = Math.max(start.y, end.y) + LANE * 4;
      const addX = (x: number) => {
        if (x >= minX && x <= maxX) xs.add(x);
      };
      const addY = (y: number) => {
        if (y >= minY && y <= maxY) ys.add(y);
      };
      for (const offset of [-LANE, LANE]) {
        addX(start.x + offset);
        addX(end.x + offset);
        addY(start.y + offset);
        addY(end.y + offset);
      }
      for (const obstacle of obstacles) {
        if (
          obstacle.x > maxX ||
          obstacle.x + obstacle.width < minX ||
          obstacle.y > maxY ||
          obstacle.y + obstacle.height < minY
        )
          continue;
        addX(obstacle.x - CLEARANCE);
        addX(obstacle.x + obstacle.width + CLEARANCE);
        addY(obstacle.y - CLEARANCE);
        addY(obstacle.y + obstacle.height + CLEARANCE);
      }
      for (const { a, b } of occupied) {
        if (a.x === b.x) {
          addX(a.x - LANE);
          addX(a.x + LANE);
        } else {
          addY(a.y - LANE);
          addY(a.y + LANE);
        }
      }
      // Extra lead lengths let both ends of backward routes use separate lanes.
      const extras = (endpoint: RouteEndpoint, base: RoutePoint) => {
        const direction = directions[endpoint.side];
        const result = new Set([0, LANE, LANE * 2]);
        for (const coordinate of direction.x ? xs : ys) {
          const extra = direction.x
            ? (coordinate - base.x) * direction.x
            : (coordinate - base.y) * direction.y;
          if (extra > 0) result.add(extra);
        }
        // Bound the search during dragging even in a dense imported flowsheet.
        return [...result].sort((a, b) => a - b).slice(0, 6);
      };
      const lanes = (coordinates: Set<number>, center: number) => {
        const sorted = [...coordinates].sort((a, b) => a - b);
        // Keep the outer escape lanes as well as the nearest interior lanes.
        return [
          ...new Set([
            sorted[0],
            sorted.at(-1)!,
            ...sorted
              .sort((a, b) => Math.abs(a - center) - Math.abs(b - center))
              .slice(0, 22),
          ]),
        ];
      };
      const xLanes = lanes(xs, (start.x + end.x) / 2);
      const yLanes = lanes(ys, (start.y + end.y) / 2);
      const costs = new Map<string, number>();
      const segmentCost = (run: Segment, first: boolean, last: boolean) => {
        const key = `${run.a.x},${run.a.y},${run.b.x},${run.b.y},${first},${last}`;
        const cached = costs.get(key);
        if (cached !== undefined) return cached;
        let cost = 0;
        for (const obstacle of obstacles) {
          if (
            (first && obstacle.id === source.nodeId) ||
            (last && obstacle.id === target.nodeId)
          )
            continue;
          cost += obstacleLength(run, obstacle) * 100000;
        }
        cost += congestion.cost(run);
        costs.set(key, cost);
        return cost;
      };
      let best: RoutePoint[] | undefined;
      let bestScore = Infinity;
      const consider = (middle: RoutePoint[]) => {
        // Length alone is a lower bound; avoid allocating simplified candidates
        // and scoring their segments when they cannot improve the current route.
        let distance = 0;
        let previous: RoutePoint = source;
        for (const point of middle) {
          distance += length(previous, point);
          previous = point;
        }
        distance += length(previous, target);
        if (distance >= bestScore) return;
        const points = simplify([source, ...middle, target]);
        const runs = segments(points);
        // Reject U-turns at ports and anywhere inside a route.
        for (let i = 1; i < runs.length; i++) {
          const previous = runs[i - 1],
            current = runs[i];
          if (
            (previous.b.x - previous.a.x) * (current.b.x - current.a.x) +
              (previous.b.y - previous.a.y) * (current.b.y - current.a.y) <
            0
          )
            return;
        }
        let score = (points.length - 2) * BEND_COST + distance;
        if (score >= bestScore) return;
        for (let i = 0; i < runs.length; i++) {
          score += segmentCost(runs[i], i === 0, i === runs.length - 1);
          if (score >= bestScore) return;
        }
        if (score < bestScore) {
          best = points;
          bestScore = score;
        }
      };
      if (existing) consider(existing.points);
      const sourceLeads = extras(source, start).map((extra) =>
        lead(source, obstacles, extra),
      );
      const targetLeads = extras(target, end).map((extra) =>
        lead(target, obstacles, extra),
      );
      const sourceHorizontal = directions[source.side].x !== 0;
      const targetHorizontal = directions[target.side].x !== 0;
      consider([start, { x: end.x, y: start.y }, end]);
      consider([start, { x: start.x, y: end.y }, end]);
      // Extending a lead along a candidate's first/last run produces the same
      // simplified path. Only vary leads perpendicular to those runs.
      for (const a of sourceHorizontal ? [start] : sourceLeads)
        for (const b of targetHorizontal ? [end] : targetLeads)
          for (const x of xLanes)
            consider([a, { x, y: a.y }, { x, y: b.y }, b]);
      for (const a of sourceHorizontal ? sourceLeads : [start])
        for (const b of targetHorizontal ? targetLeads : [end])
          for (const y of yLanes)
            consider([a, { x: a.x, y }, { x: b.x, y }, b]);
      // The bounded dogleg candidates are fast, but cannot weave between
      // staggered units or escape a tall column outside their local lane range.
      // Search also separates shared runs when another bend can open a lane.
      if (
        !best ||
        (pass > 0 && searchedRoutes.has(connection.id)) ||
        segments(best).some(
          (run, index, runs) =>
            congestion.sharesRun(run) ||
            obstacles.some(
              (obstacle) =>
                !(
                  (index === 0 && obstacle.id === source.nodeId) ||
                  (index === runs.length - 1 && obstacle.id === target.nodeId)
                ) && obstacleLength(run, obstacle) > 0,
            ),
        )
      ) {
        const detour = searchRoute(
          source,
          target,
          start,
          end,
          obstacles,
          congestion,
          xLanes,
          yLanes,
          bestScore,
        );
        if (detour) {
          consider(detour);
          searchedRoutes.add(connection.id);
        }
      }
      // At least one orthogonal candidate exists even when equipment overlaps.
      const points =
        best ??
        simplify([source, start, { x: start.x, y: end.y }, end, target]);
      const route = roundedRoute(points);
      routes.set(connection.id, route);
      routeSegments.set(connection.id, segments(points));
    }
  return routes;
}

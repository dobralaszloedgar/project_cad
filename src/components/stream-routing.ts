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

/** Penalize shared runs much more than an isolated, readable crossing. */
function congestion(segment: Segment, other: Segment) {
  const { a, b } = segment,
    { a: c, b: d } = other;
  const horizontal = a.y === b.y;
  if (horizontal === (c.y === d.y)) {
    const distance = horizontal ? Math.abs(a.y - c.y) : Math.abs(a.x - c.x);
    if (distance >= LANE) return 0;
    const shared = horizontal
      ? overlap(a.x, b.x, c.x, d.x)
      : overlap(a.y, b.y, c.y, d.y);
    return shared * (distance < 0.5 ? 1000 : 20 * (1 - distance / LANE));
  }
  const h = horizontal ? segment : other,
    v = horizontal ? other : segment;
  return v.a.x > Math.min(h.a.x, h.b.x) &&
    v.a.x < Math.max(h.a.x, h.b.x) &&
    h.a.y > Math.min(v.a.y, v.b.y) &&
    h.a.y < Math.max(v.a.y, v.b.y)
    ? 60
    : 0;
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

/**
 * Route the displayed graph together in a stable order. Candidate lanes include
 * equipment boundaries and adjacent lanes of earlier streams. This is a bounded
 * visual heuristic: crowded/overlapping equipment can still force crossings.
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
  // A second pass lets earlier streams move out around later ones. In particular,
  // two backward connections can form nested loops instead of crossing twice.
  for (let pass = 0; pass < 2; pass++)
    for (const connection of ordered) {
      const occupied = [...routes.entries()].flatMap(([id, route]) =>
        id === connection.id ? [] : segments(route.points),
      );
      const existing = routes.get(connection.id);
      if (
        pass &&
        existing &&
        !segments(existing.points).some((run) =>
          occupied.some((other) => congestion(run, other) > 0),
        )
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
        for (const other of occupied) cost += congestion(run, other);
        costs.set(key, cost);
        return cost;
      };
      let best: RoutePoint[] | undefined;
      let bestScore = Infinity;
      const consider = (middle: RoutePoint[]) => {
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
        let score =
          (points.length - 2) * 12 +
          runs.reduce((total, run) => total + length(run.a, run.b), 0);
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
      // At least one orthogonal candidate exists even when equipment overlaps.
      const points =
        best ??
        simplify([source, start, { x: start.x, y: end.y }, end, target]);
      const route = roundedRoute(points);
      routes.set(connection.id, route);
    }
  return routes;
}

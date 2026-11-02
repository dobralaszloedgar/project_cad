import { test } from "vitest";
import assert from "node:assert/strict";
import {
  routeStreams,
  type RouteObstacle,
  type RoutePoint,
  type StreamConnection,
  type StreamRoute,
} from "../src/components/stream-routing";

function assertClear(route: StreamRoute, obstacles: RouteObstacle[]) {
  assert.ok(!/NaN|Infinity/.test(route.path));
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1],
      b = route.points[i];
    assert.ok(a.x === b.x || a.y === b.y, "segments stay orthogonal");
    for (const o of obstacles) {
      const intersects =
        a.y === b.y
          ? a.y > o.y - 8 &&
            a.y < o.y + o.height + 8 &&
            Math.max(a.x, b.x) > o.x - 8 &&
            Math.min(a.x, b.x) < o.x + o.width + 8
          : a.x > o.x - 8 &&
            a.x < o.x + o.width + 8 &&
            Math.max(a.y, b.y) > o.y - 8 &&
            Math.min(a.y, b.y) < o.y + o.height + 8;
      assert.equal(intersects, false, `segment ${i} crosses ${o.id}`);
    }
  }
}

const routeLength = (route: StreamRoute) =>
  route.points
    .slice(1)
    .reduce(
      (sum, p, i) =>
        sum +
        Math.abs(p.x - route.points[i].x) +
        Math.abs(p.y - route.points[i].y),
      0,
    );

function sharedLength(a: StreamRoute, b: StreamRoute) {
  let total = 0;
  for (let i = 1; i < a.points.length; i++) {
    const p = a.points[i - 1],
      q = a.points[i];
    for (let j = 1; j < b.points.length; j++) {
      const r = b.points[j - 1],
        s = b.points[j];
      const axis =
        p.x === q.x && r.x === s.x && p.x === r.x
          ? "y"
          : p.y === q.y && r.y === s.y && p.y === r.y
            ? "x"
            : undefined;
      if (axis)
        total += Math.max(
          0,
          Math.min(Math.max(p[axis], q[axis]), Math.max(r[axis], s[axis])) -
            Math.max(Math.min(p[axis], q[axis]), Math.min(r[axis], s[axis])),
        );
    }
  }
  return total;
}

function crossings(a: StreamRoute, b: StreamRoute) {
  let count = 0;
  for (let i = 1; i < a.points.length; i++) {
    const p = a.points[i - 1],
      q = a.points[i];
    for (let j = 1; j < b.points.length; j++) {
      const r = b.points[j - 1],
        s = b.points[j];
      const horizontal = p.y === q.y;
      if (horizontal === (r.y === s.y)) continue;
      const [h1, h2, v1, v2] = horizontal ? [p, q, r, s] : [r, s, p, q];
      if (
        v1.x > Math.min(h1.x, h2.x) &&
        v1.x < Math.max(h1.x, h2.x) &&
        h1.y > Math.min(v1.y, v2.y) &&
        h1.y < Math.max(v1.y, v2.y)
      )
        count++;
    }
  }
  return count;
}
const backward: StreamConnection[] = [0, 1].map((i) => ({
  id: `s${i}`,
  source: { x: 144.5, y: 64 + i * 48, side: "right", nodeId: "splitter" },
  target: { x: 99.5, y: 356 + i * 24, side: "left", nodeId: "pfr" },
}));
const obstacles = [
  { id: "splitter", x: 0, y: 0, width: 160, height: 180 },
  { id: "pfr", x: 80, y: 300, width: 160, height: 204 },
];

test("splitter outlets looping back into a lower reactor keep separate runs", () => {
  const routes = routeStreams(backward, obstacles);
  assert.equal(sharedLength(routes.get("s0")!, routes.get("s1")!), 0);
  assert.equal(crossings(routes.get("s0")!, routes.get("s1")!), 0);
  for (const stream of backward) {
    const route = routes.get(stream.id)!;
    assert.deepEqual(route.points[0], stream.source);
    assert.deepEqual(route.points.at(-1), stream.target);
    assert.ok(route.points[1].x > stream.source.x);
    assert.ok(route.points.at(-2)!.x < stream.target.x);
    assert.ok(!/NaN|Infinity/.test(route.path));
  }
  // Stream array order, labels and colors cannot reshuffle the chosen lanes.
  assert.deepEqual(routeStreams([...backward].reverse(), obstacles), routes);
});

test("top/bottom and mirrored ports also get separate nested lanes", () => {
  const rotate = (point: RoutePoint) => ({ x: -point.y, y: point.x });
  const sides = {
    right: "bottom",
    bottom: "left",
    left: "top",
    top: "right",
  } as const;
  let streams = backward,
    boxes = obstacles;
  for (let turn = 0; turn < 3; turn++) {
    streams = streams.map((stream) => ({
      ...stream,
      source: {
        ...stream.source,
        ...rotate(stream.source),
        side: sides[stream.source.side],
      },
      target: {
        ...stream.target,
        ...rotate(stream.target),
        side: sides[stream.target.side],
      },
    }));
    boxes = boxes.map((box) => ({
      ...box,
      x: -box.y - box.height,
      y: box.x,
      width: box.height,
      height: box.width,
    }));
    const routes = routeStreams(streams, boxes);
    assert.equal(sharedLength(routes.get("s0")!, routes.get("s1")!), 0);
    assert.equal(crossings(routes.get("s0")!, routes.get("s1")!), 0);
  }
});

test("forward doglegs on different equipment avoid a shared center lane", () => {
  const streams: StreamConnection[] = [0, 1, 2].map((i) => ({
    id: `s${i}`,
    source: { x: 0, y: i * 50, side: "right", nodeId: `source${i}` },
    target: { x: 400, y: 250 + i * 50, side: "left", nodeId: `target${i}` },
  }));
  const routes = [...routeStreams(streams, []).values()];
  for (let i = 0; i < routes.length; i++)
    for (let j = i + 1; j < routes.length; j++)
      assert.equal(sharedLength(routes[i], routes[j]), 0);
});

test("a straight stream stays straight when the corridor is clear", () => {
  const connection: StreamConnection = {
    id: "s",
    source: { x: 0, y: 0, side: "right", nodeId: "a" },
    target: { x: 400, y: 0, side: "left", nodeId: "b" },
  };
  assert.deepEqual(routeStreams([connection], []).get("s")!.points, [
    connection.source,
    connection.target,
  ]);
});

test("a stream detours around intervening equipment", () => {
  const connection: StreamConnection = {
    id: "s",
    source: { x: 0, y: 0, side: "right", nodeId: "a" },
    target: { x: 400, y: 0, side: "left", nodeId: "b" },
  };
  const route = routeStreams(
    [connection],
    [{ id: "blocker", x: 120, y: -80, width: 160, height: 160 }],
  ).get("s")!;
  assert.ok(route.points.some((p) => Math.abs(p.y) >= 88));
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1],
      b = route.points[i];
    if (a.y === b.y && Math.abs(a.y) < 88)
      assert.ok(Math.max(a.x, b.x) <= 112 || Math.min(a.x, b.x) >= 288);
    if (a.x === b.x && a.x > 112 && a.x < 288)
      assert.ok(Math.max(a.y, b.y) <= -88 || Math.min(a.y, b.y) >= 88);
  }
});

test("all port directions retain outward leads, orthogonal segments and finite paths", () => {
  const directions = {
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    top: { x: 0, y: -1 },
    bottom: { x: 0, y: 1 },
  };
  const dot = (a: RoutePoint, b: RoutePoint, direction: RoutePoint) =>
    (b.x - a.x) * direction.x + (b.y - a.y) * direction.y;
  for (const sourceSide of Object.keys(
    directions,
  ) as (keyof typeof directions)[])
    for (const targetSide of Object.keys(
      directions,
    ) as (keyof typeof directions)[])
      for (const target of [
        { x: 300, y: 220 },
        { x: -120, y: -250 },
        { x: 0, y: 0 },
      ]) {
        const connection: StreamConnection = {
          id: "s",
          source: { x: 0, y: 0, side: sourceSide, nodeId: "a" },
          target: { ...target, side: targetSide, nodeId: "b" },
        };
        const route = routeStreams([connection], []).get("s")!;
        assert.ok(
          dot(route.points[0], route.points[1], directions[sourceSide]) > 0,
        );
        assert.ok(
          dot(
            route.points.at(-1)!,
            route.points.at(-2)!,
            directions[targetSide],
          ) > 0,
        );
        for (let i = 1; i < route.points.length; i++) {
          const a = route.points[i - 1],
            b = route.points[i];
          assert.ok(a.x === b.x || a.y === b.y);
        }
        assert.ok(!/NaN|Infinity/.test(route.path));
      }
});

test("moving equipment reroutes the graph without retaining old lane coordinates", () => {
  const initial = routeStreams(backward, obstacles);
  const moved = backward.map((stream) => ({
    ...stream,
    target: { ...stream.target, x: stream.target.x + 500 },
  }));
  const routes = routeStreams(
    moved,
    obstacles.map((obstacle) =>
      obstacle.id === "pfr" ? { ...obstacle, x: obstacle.x + 500 } : obstacle,
    ),
  );
  assert.notEqual(routes.get("s0")!.path, initial.get("s0")!.path);
  assert.equal(sharedLength(routes.get("s0")!, routes.get("s1")!), 0);
});

const blockedConnection: StreamConnection = {
  id: "s",
  source: { x: 0, y: 0, side: "right", nodeId: "a" },
  target: { x: 800, y: 0, side: "left", nodeId: "b" },
};
const tallBlocker: RouteObstacle = {
  id: "column",
  x: 300,
  y: -400,
  width: 160,
  height: 800,
};

test("escapes tall equipment beyond the local candidate lanes", () => {
  const route = routeStreams([blockedConnection], [tallBlocker]).get("s")!;
  assertClear(route, [tallBlocker]);
  assert.equal(routeLength(route), 1616);
  assert.equal(route.points.length, 6);
  assert.deepEqual(route.points[0], blockedConnection.source);
  assert.deepEqual(route.points.at(-1), blockedConnection.target);
});

test("weaves between staggered obstacles instead of crossing them or taking a long outer loop", () => {
  const boxes = [
    { id: "first", x: 120, y: -400, width: 80, height: 500 },
    { id: "second", x: 360, y: -100, width: 80, height: 500 },
    { id: "third", x: 600, y: -400, width: 80, height: 500 },
  ];
  const route = routeStreams([blockedConnection], boxes).get("s")!;
  assertClear(route, boxes);
  assert.equal(routeLength(route), 1448);
  assert.deepEqual(
    routeStreams([blockedConnection], [...boxes].reverse()).get("s"),
    route,
  );
});

test("multiple streams keep separate escape lanes around tall equipment", () => {
  const connections = [0, 1, 2].map((i) => ({
    id: `s${i}`,
    source: { ...blockedConnection.source, y: i * 48, nodeId: `a${i}` },
    target: { ...blockedConnection.target, y: i * 48, nodeId: `b${i}` },
  }));
  const routes = routeStreams(connections, [tallBlocker]);
  for (const [id, route] of routes) {
    assertClear(route, [tallBlocker]);
    for (const [otherId, other] of routes) {
      if (id === otherId) continue;
      assert.equal(sharedLength(route, other), 0);
      assert.equal(crossings(route, other), 0);
    }
  }
  assert.deepEqual(
    routeStreams([...connections].reverse(), [tallBlocker]),
    routes,
  );
});

test("obstacle search respects rotated port directions", () => {
  const sides = {
    right: "bottom",
    bottom: "left",
    left: "top",
    top: "right",
  } as const;
  let connection = blockedConnection;
  let box = tallBlocker;
  for (let i = 0; i < 3; i++) {
    connection = {
      ...connection,
      source: {
        ...connection.source,
        x: -connection.source.y,
        y: connection.source.x,
        side: sides[connection.source.side],
      },
      target: {
        ...connection.target,
        x: -connection.target.y,
        y: connection.target.x,
        side: sides[connection.target.side],
      },
    };
    box = {
      ...box,
      x: -box.y - box.height,
      y: box.x,
      width: box.height,
      height: box.width,
    };
    const route = routeStreams([connection], [box]).get("s")!;
    assertClear(route, [box]);
    assert.equal(routeLength(route), 1616);
    const first = route.points[1],
      last = route.points.at(-2)!;
    for (const [endpoint, lead] of [
      [connection.source, first],
      [connection.target, last],
    ] as const) {
      if (endpoint.side === "left") assert.ok(lead.x < endpoint.x);
      if (endpoint.side === "right") assert.ok(lead.x > endpoint.x);
      if (endpoint.side === "top") assert.ok(lead.y < endpoint.y);
      if (endpoint.side === "bottom") assert.ok(lead.y > endpoint.y);
    }
  }
});

test("moving an obstruction out of the way restores a straight route", () => {
  const blocked = routeStreams([blockedConnection], [tallBlocker]).get("s")!;
  const moved = { ...tallBlocker, y: 500 };
  const clear = routeStreams([blockedConnection], [moved]).get("s")!;
  assertClear(clear, [moved]);
  assert.notEqual(clear.path, blocked.path);
  assert.deepEqual(clear.points, [
    blockedConnection.source,
    blockedConnection.target,
  ]);
});

test("overlapping equipment still produces a finite route without mutating inputs", () => {
  const boxes = [
    { id: "enclosure", x: -100, y: -100, width: 1000, height: 200 },
  ];
  const original = structuredClone({ connection: blockedConnection, boxes });
  const route = routeStreams([blockedConnection], boxes).get("s")!;
  assert.ok(!/NaN|Infinity/.test(route.path));
  assert.deepEqual(route.points[0], blockedConnection.source);
  assert.deepEqual(route.points.at(-1), blockedConnection.target);
  assert.deepEqual({ connection: blockedConnection, boxes }, original);
});

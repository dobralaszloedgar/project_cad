import { test } from "vitest";
import assert from "node:assert/strict";
import {
  routeStreams,
  type RoutePoint,
  type StreamConnection,
  type StreamRoute,
} from "../src/components/stream-routing";

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

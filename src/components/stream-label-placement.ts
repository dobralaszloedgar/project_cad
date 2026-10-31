type Point = { x: number; y: number };
type Run = { start: Point; end: Point };

/** Keep the label inline, while leaving rounded bends outside its cutout. */
export function inlineStreamLabelPosition(
  path: string,
  center: Point,
  width: number,
  height: number,
  clearance: number,
): Point {
  const runs: Run[] = [];
  let point = center;
  let previous: Run | undefined;
  // SmoothStep emits absolute M/L/Q commands; a curve ends a straight run.
  for (const command of path.matchAll(/([MLQ])([^MLQ]+)/g)) {
    const values = command[2]
      .match(/[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi)
      ?.map(Number);
    if (!values?.length) continue;
    const end = { x: values.at(-2)!, y: values.at(-1)! };
    if (command[1] === "L") {
      const horizontal = point.y === end.y;
      if (
        previous &&
        previous.end.x === point.x &&
        previous.end.y === point.y &&
        (horizontal
          ? previous.start.y === end.y &&
            (point.x - previous.start.x) * (end.x - point.x) >= 0
          : previous.start.x === end.x &&
            (point.y - previous.start.y) * (end.y - point.y) >= 0)
      )
        previous.end = end;
      else {
        previous = { start: point, end };
        runs.push(previous);
      }
    } else previous = undefined;
    point = end;
  }
  const candidates = runs.flatMap(({ start, end }) => {
    const horizontal = start.y === end.y;
    const size = horizontal ? width : height;
    const low = Math.min(
      horizontal ? start.x : start.y,
      horizontal ? end.x : end.y,
    );
    const high = Math.max(
      horizontal ? start.x : start.y,
      horizontal ? end.x : end.y,
    );
    if (high - low < size + clearance * 2) return [];
    const position = Math.max(
      low + size / 2 + clearance,
      Math.min(high - size / 2 - clearance, horizontal ? center.x : center.y),
    );
    return [
      horizontal ? { x: position, y: start.y } : { x: start.x, y: position },
    ];
  });
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - center.x, a.y - center.y) -
      Math.hypot(b.x - center.x, b.y - center.y),
  );
  return candidates[0] ?? center;
}

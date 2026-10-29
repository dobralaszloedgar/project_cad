import { CurvePath, LineCurve3, QuadraticBezierCurve3, Vector3 } from "three";

export type Point = [number, number, number];

/** One clock drives fluid shaders, bubbles and machinery. Pausing preserves
 * phase; changing speed never jumps to a different point in the operation. */
export class OperationClock {
  readonly uniform = { value: 0 };
  advance(delta: number, playing: boolean, speed: number) {
    if (playing) this.uniform.value += Math.min(delta, 0.05) * speed;
  }
}

/** Shared by the metal pipe wall and its exposed liquid core. */
export function pipeCurve(points: Point[]) {
  const vertices = points.map((p) => new Vector3(...p));
  const path = new CurvePath<Vector3>();
  let start = vertices[0];
  for (let i = 1; i < vertices.length - 1; i++) {
    const corner = vertices[i],
      next = vertices[i + 1];
    const bend = Math.min(
      0.18,
      corner.distanceTo(start) * 0.35,
      corner.distanceTo(next) * 0.35,
    );
    const before = corner
      .clone()
      .add(start.clone().sub(corner).normalize().multiplyScalar(bend));
    const after = corner
      .clone()
      .add(next.clone().sub(corner).normalize().multiplyScalar(bend));
    path.add(new LineCurve3(start, before));
    path.add(new QuadraticBezierCurve3(before, corner, after));
    start = after;
  }
  path.add(new LineCurve3(start, vertices[vertices.length - 1]));
  return path;
}

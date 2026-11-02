/** Smooth interpolation shared by the lightweight DOM demo and lazy 3D scene. */
export function reveal(value: number, from: number, to: number) {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

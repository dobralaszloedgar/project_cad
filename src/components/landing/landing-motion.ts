// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

/** Smooth interpolation shared by the lightweight DOM demo and lazy 3D scene. */
export function reveal(value: number, from: number, to: number) {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/** Hold each equipment view before moving to the next one. */
export function tourWeights(progress: number) {
  const heater = reveal(progress, 1, 1.16);
  const reactor = reveal(progress, 1.24, 1.38);
  const column = reveal(progress, 1.46, 1.62);
  return [1 - heater, heater - reactor, reactor - column, column] as const;
}

export function tourStopAt(progress: number) {
  return progress < 1.08 ? 0 : progress < 1.31 ? 1 : progress < 1.54 ? 2 : 3;
}

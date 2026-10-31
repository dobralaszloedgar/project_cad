function requireCondition(
  condition: unknown,
  _code: string,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}

// Dormand–Prince 5(4), with a shared first/last derivative (FSAL). Integrating
// signed extents preserves stoichiometry; the caller checks species feasibility.
// The independent coordinate is W / W_trial, including for pressure profiles.
export function integrateExtents(
  derivative: (x: number[], position: number) => number[] | null,
  feasible: (x: number[]) => boolean,
  count: number,
  event?: (x: number[]) => number,
  sample?: (x: number[], position: number) => void,
) {
  const a = [
    [],
    [1 / 5],
    [3 / 40, 9 / 40],
    [44 / 45, -56 / 15, 32 / 9],
    [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
    [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
    [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
  ];
  const c = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
  const errorWeights = [
    35 / 384 - 5179 / 57600,
    0,
    500 / 1113 - 7571 / 16695,
    125 / 192 - 393 / 640,
    -2187 / 6784 + 92097 / 339200,
    11 / 84 - 187 / 2100,
    -1 / 40,
  ];
  const step = (x: number[], t: number, h: number, first: number[]) => {
    const stages = [first];
    let y = x;
    for (let j = 1; j < 7; j++) {
      y = x.map(
        (v, i) => v + h * a[j].reduce((s, n, k) => s + n * stages[k][i], 0),
      );
      const d = derivative(y, t + c[j] * h);
      if (!d) return null;
      stages.push(d);
    }
    if (!feasible(y)) return null;
    const error = Math.max(
      0,
      ...y.map(
        (v, i) =>
          Math.abs(
            h * errorWeights.reduce((s, n, j) => s + n * stages[j][i], 0),
          ) /
          (2e-13 + 2e-11 * Math.max(Math.abs(v), Math.abs(x[i]))),
      ),
    );
    return { y, error, last: stages[6] };
  };
  let x = Array<number>(count).fill(0),
    t = 0,
    h = 0.01;
  let first = derivative(x, t);
  requireCondition(
    first,
    "KINETIC_DEPLETION",
    "The inlet is outside the feasible reaction region.",
  );
  sample?.(x, 0);
  for (let attempt = 0; attempt < 30000 && t < 1; attempt++) {
    h = Math.min(h, 0.05, 1 - t);
    const trial = step(x, t, h, first);
    const error = trial?.error ?? Infinity;
    if (trial && error <= 1) {
      if (event && event(trial.y) >= 0) {
        // Locate the first bracketed crossing inside this accepted step. Each
        // candidate is reintegrated from its left endpoint, not interpolated.
        let low = 0,
          high = h,
          end = trial;
        for (let i = 0; i < 60; i++) {
          const mid = low + (high - low) / 2;
          if (mid === low || mid === high) break;
          const candidate = step(x, t, mid, first);
          requireCondition(
            candidate,
            "KINETIC_CONVERGENCE",
            "Could not resolve the conversion crossing.",
          );
          if (event(candidate.y) >= 0) {
            high = mid;
            end = candidate;
          } else low = mid;
          if (high - low <= 2e-12 * Math.max(t + high, 1e-12)) break;
        }
        sample?.(end.y, t + high);
        return { x: end.y, position: t + high, reachedTarget: true };
      }
      x = trial.y;
      t += h;
      first = trial.last;
      sample?.(x, t);
    }
    h *= error === 0 ? 4 : Math.max(0.1, Math.min(4, 0.9 * error ** -0.2));
    requireCondition(
      h > 1e-14 || t >= 1,
      "KINETIC_CONVERGENCE",
      "Packed-bed integration reached depletion, equilibrium or a singular/stiff rate law before completing the requested calculation. Check the target and rate units.",
    );
  }
  requireCondition(
    t >= 1,
    "KINETIC_CONVERGENCE",
    "Packed-bed integration exceeded its step limit; check stiffness, target and rate units.",
  );
  return { x, position: t, reachedTarget: false };
}

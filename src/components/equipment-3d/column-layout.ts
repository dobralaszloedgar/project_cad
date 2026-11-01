import { normalizeTrayCount } from "../../domain/column-geometry";
export { columnTrayLimits } from "../../domain/column-geometry";
export type EquipmentModelOptions = {
  trayCount?: number;
  column?: {
    diameter: number;
    traySpacing: number;
    feedTray?: number;
    trayType: "sieve";
  };
};

/** Shared by geometry, fluid, fittings and camera. Spacing is preserved: adding
 * trays extends the shell instead of stretching valves, ladders or internals. */
export function columnLayout(options: EquipmentModelOptions = {}) {
  const trayCount = normalizeTrayCount(options.trayCount);
  const traySpacing = options.column?.traySpacing ?? 0.46;
  const trays = Array.from(
    { length: trayCount },
    (_, i) => 1.45 + i * traySpacing,
  );
  const topOffset = (trayCount - 1) * traySpacing - 7 * 0.46;
  const radialScale = (options.column?.diameter ?? 1.2) / 1.2;
  const feedIndex =
    options.column?.feedTray === undefined
      ? Math.floor((trayCount - 1) / 2)
      : Math.max(
          0,
          Math.min(trayCount - 1, trayCount - options.column.feedTray),
        );
  const shellTop = 5.23 + topOffset;
  const platforms: number[] = [];
  const upperPlatform = trays[trays.length - 1] - 0.05;
  for (let y = 2.05; y < upperPlatform - 1.2; y += 2.4) platforms.push(y);
  platforms.push(upperPlatform);
  return {
    trayCount,
    traySpacing,
    radialScale,
    trays,
    topOffset,
    shellTop,
    platforms,
    shellBottom: 1.01,
    feedY: trays[feedIndex] + 0.14,
    distillateY: 5.06 + topOffset,
    totalHeight: 6.767 + topOffset,
  };
}

/** Every branch terminates at the SAME tee center. Rounding an elbow through
 * this point would pull the reflux off the product takeoff and leave a gap. */
export function columnOverhead(options: EquipmentModelOptions = {}) {
  const { topOffset } = columnLayout(options);
  const point = (x: number, y: number, z = 0): [number, number, number] => [
    x,
    y + topOffset,
    z,
  ];
  const split = point(1.52, 5.06);
  return {
    split,
    condenser: point(1.52, 6.16),
    receiver: point(1.52, 5.52),
    vapor: [point(0, 5.45), point(0, 6.7), point(1.52, 6.7), point(1.52, 6.48)],
    condensate: [point(1.52, 5.84), point(1.52, 5.7)],
    inlet: [point(1.52, 5.34), split],
    reflux: [split, point(0.54, 5.06)],
    distillate: [split, point(2.1, 5.06)],
  };
}

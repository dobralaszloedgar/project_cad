export type EquipmentModelOptions = { trayCount?: number };
export const columnTrayLimits = { min: 2, max: 80, default: 8 } as const;

/** Shared by geometry, fluid, fittings and camera. Spacing is preserved: adding
 * trays extends the shell instead of stretching valves, ladders or internals. */
export function columnLayout(options: EquipmentModelOptions = {}) {
  const input = options.trayCount ?? columnTrayLimits.default;
  const trayCount = Number.isFinite(input)
    ? Math.max(
        columnTrayLimits.min,
        Math.min(columnTrayLimits.max, Math.round(input)),
      )
    : columnTrayLimits.default;
  const traySpacing = 0.46;
  const trays = Array.from(
    { length: trayCount },
    (_, i) => 1.45 + i * traySpacing,
  );
  const topOffset = (trayCount - 8) * traySpacing;
  const shellTop = 5.23 + topOffset;
  const platforms: number[] = [];
  const upperPlatform = trays[trays.length - 1] - 0.05;
  for (let y = 2.05; y < upperPlatform - 1.2; y += 2.4) platforms.push(y);
  platforms.push(upperPlatform);
  return {
    trayCount,
    traySpacing,
    trays,
    topOffset,
    shellTop,
    platforms,
    shellBottom: 1.01,
    feedY: trays[Math.floor((trayCount - 1) / 2)] + 0.14,
    distillateY: 5.06 + topOffset,
    totalHeight: 6.767 + topOffset,
  };
}

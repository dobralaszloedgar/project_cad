/** Visual tray count shared by the flowsheet and physical model. */
export const columnTrayLimits = { min: 2, max: 80, default: 8 } as const;

export function normalizeTrayCount(input = columnTrayLimits.default as number) {
  return Number.isFinite(input)
    ? Math.max(
        columnTrayLimits.min,
        Math.min(columnTrayLimits.max, Math.round(input)),
      )
    : columnTrayLimits.default;
}

/** Like the reference flowsheet, grow the vessel, preserving the equipment's
 * width. Dense columns gently reduce tray pitch instead of stretching fittings. */
export function columnDiagramLayout(trayCount?: number) {
  const count = normalizeTrayCount(trayCount);
  const pitch = Math.min(10, Math.max(4, 300 / count));
  const first = 82;
  const last = first + (count - 1) * pitch;
  const height = last + 70;
  const feedTray = count - Math.floor((count - 1) / 2);
  return {
    count,
    pitch,
    first,
    last,
    height,
    width: 128,
    feedTray,
    feedY: first + (feedTray - 1) * pitch,
    distillateY: 56,
    bottomsY: height - 12,
    trays: Array.from({ length: count }, (_, i) => first + i * pitch),
  };
}

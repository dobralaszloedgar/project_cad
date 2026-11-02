// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

export const UNKNOWN_COMPOSITION_COLOR = "#94a3ab";

/** A schematic sRGB mixture, weighted by moles (not physical pigment optics).
 * Pure streams retain their swatch; trace impurities change it continuously. */
export function blendColors(
  parts: { color: string; amount: number }[],
): string {
  // Canonical summation prevents catalog reordering from moving a channel
  // across a rounding boundary in mixtures with many components.
  const ordered = [...parts].sort((a, b) =>
    a.color < b.color ? -1 : a.color > b.color ? 1 : a.amount - b.amount,
  );
  const total = ordered.reduce((sum, part) => sum + part.amount, 0);
  if (
    !Number.isFinite(total) ||
    total <= 0 ||
    parts.some(({ amount }) => !Number.isFinite(amount) || amount < 0)
  )
    return UNKNOWN_COMPOSITION_COLOR;
  const rgb = [0, 0, 0];
  for (const { color, amount } of ordered) {
    const value = Number.parseInt(color.slice(1), 16);
    for (let i = 0; i < 3; i++)
      rgb[i] += ((value >> (16 - i * 8)) & 255) * amount;
  }
  return `#${rgb
    .map((value) =>
      Math.round(value / total)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

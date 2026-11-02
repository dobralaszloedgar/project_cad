// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

/** Canvas styling is independent of the calculation engine. */
export const STREAM_COLOR_LABELS = [
  "Red",
  "Orange",
  "Yellow",
  "Green",
  "Cyan",
  "Blue",
  "Violet",
  "Pink",
] as const;
export const STREAM_COLOR_COUNT = STREAM_COLOR_LABELS.length;

export function streamColor(index: number) {
  return `var(--stream-rainbow-${index})`;
}

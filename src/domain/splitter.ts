// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { splitterOutlets } from "./material-ports";

/** Explicit fractions use outlet order. Legacy two-outlet projects keep their
 * existing split; newly connected outlets share the primary remainder. */
export function splitterFractions(
  params: { recycleFraction: number; splitFractions?: number[] },
  connected: readonly string[] = ["out", "out2"],
): number[] {
  if (params.splitFractions)
    return splitterOutlets.map(
      (_, index) => params.splitFractions![index] ?? 0,
    );
  const active = splitterOutlets.filter(
    (port, index) => index < 2 || connected.includes(port),
  );
  return splitterOutlets.map((port) =>
    port === "out2"
      ? params.recycleFraction
      : active.includes(port)
        ? (1 - params.recycleFraction) / (active.length - 1)
        : 0,
  );
}

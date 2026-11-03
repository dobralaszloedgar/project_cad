// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { newUnit, type Project } from "../../src/domain/schema";
import { mixerInlets, splitterOutlets } from "../../src/domain/material-ports";

export function fourBranchProject(legacy = false): Project {
  return {
    version: 1,
    name: "Four-branch mixing and splitting",
    units: [
      ...mixerInlets.map((_, index) => {
        const feed = newUnit("Feed", `F-${index + 1}`, 0, index * 180);
        feed.params.flow = index + 1;
        feed.params.fractionA = index % 2;
        return feed;
      }),
      newUnit("Mixer", "M", 300, 220),
      {
        ...newUnit("Splitter", "S", 600, 220),
        params: {
          ...newUnit("Splitter", "S", 600, 220).params,
          splitFractions: [0.1, 0.2, 0.3, 0.4],
        },
      },
      ...splitterOutlets.map((_, index) =>
        newUnit("Product", `P-${index + 1}`, 900, index * 180),
      ),
    ],
    edges: [
      ...mixerInlets.map((port, index) => ({
        id: `feed-${index + 1}`,
        source: `F-${index + 1}`,
        sourcePort: "out" as const,
        target: "M",
        targetPort: legacy ? mixerInlets[index % 2] : port,
        color: "teal" as const,
      })),
      {
        id: "mixed",
        source: "M",
        sourcePort: "out",
        target: "S",
        targetPort: "in",
        color: "teal",
      },
      ...splitterOutlets.map((port, index) => ({
        id: `product-${index + 1}`,
        source: "S",
        sourcePort: port,
        target: `P-${index + 1}`,
        targetPort: "in" as const,
        color: "teal" as const,
      })),
    ],
  };
}

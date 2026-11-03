// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import { EquipmentIcon } from "../EquipmentIcon";
import type { Kind } from "@/domain/schema";
import { useEffect } from "react";
import drawing from "./landing-drawing.json";
import styles from "./LandingPage.module.css";

/** A lightweight vector diagram keeps the page usable without a GPU. */
export default function SceneFallback({
  onUnavailable,
}: {
  onUnavailable?: () => void;
}) {
  useEffect(() => onUnavailable?.(), [onUnavailable]);
  return (
    <div className={styles.experienceStage} data-scene-fallback>
      <svg
        viewBox="-160 -300 2112 1500"
        width="100%"
        height="100%"
        role="img"
        aria-label="Connected process diagram"
      >
        {drawing.streams.map((stream) => (
          <path
            key={stream.id}
            d={stream.path}
            fill="none"
            stroke={stream.color}
            strokeWidth={3}
          />
        ))}
        {drawing.units.map((unit) => (
          <g
            key={unit.id}
            transform={"translate(" + unit.x + "," + unit.y + ")"}
          >
            <EquipmentIcon kind={unit.kind as Kind} size={128} trayCount={8} />
            <text
              x={unit.width / 2}
              y={-24}
              textAnchor="middle"
              fill="#263730"
              fontSize={20}
            >
              {unit.id}
            </text>
            <text
              x={unit.width / 2}
              y={-7}
              textAnchor="middle"
              fill="#53666b"
              fontSize={16}
            >
              {unit.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

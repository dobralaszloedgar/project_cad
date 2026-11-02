// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import { useEffect } from "react";
import { AccelerationHelp } from "../graphics/AccelerationHelp";
import styles from "./LandingPage.module.css";

export default function SceneFallback({
  onUnavailable,
}: {
  onUnavailable?: () => void;
}) {
  useEffect(() => onUnavailable?.(), [onUnavailable]);
  return (
    <div className={styles.plantFallback}>
      <span>Explore the equipment collection</span>
      <AccelerationHelp />
      <a href="/sandbox/equipment">Open the 3D sandbox ↗</a>
    </div>
  );
}

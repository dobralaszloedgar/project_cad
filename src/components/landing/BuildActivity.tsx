// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import { useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import {
  motion,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "motion/react";
import { constructionLabel, constructionSteps } from "./landing-construction";
import styles from "./LandingPage.module.css";

/** One compact status, driven by the construction and simulation clocks. */
export default function BuildActivity({
  construction,
  simulation,
}: {
  construction: MotionValue<number>;
  simulation: MotionValue<number>;
}) {
  const [built, setBuilt] = useState(construction.get());
  const [simulated, setSimulated] = useState(simulation.get());
  useMotionValueEvent(construction, "change", (value) =>
    setBuilt(
      Math.floor(value * constructionSteps.length) / constructionSteps.length,
    ),
  );
  useMotionValueEvent(simulation, "change", (value) =>
    setSimulated(Math.floor(value * 20) / 20),
  );
  const completion = useTransform(
    () => construction.get() * 0.8 + simulation.get() * 0.2,
  );
  const complete = simulated === 1;
  const label = complete
    ? "Simulation complete"
    : built === 1
      ? "Simulating process…"
      : constructionLabel(built);
  return (
    <div
      className={styles.buildReadout}
      data-build-activity
      data-complete={complete}
      data-phase={
        complete ? "complete" : built === 1 ? "simulating" : "building"
      }
    >
      {complete ? (
        <Check size={16} />
      ) : (
        <LoaderCircle size={16} className={styles.spinner} />
      )}
      <span>{label}</span>
      <span className={styles.buildCount}>
        {complete
          ? "Ready for 3D"
          : built === 1
            ? `${Math.round(simulated * 100)}%`
            : `${Math.min(constructionSteps.length, Math.floor(built * constructionSteps.length))} / ${constructionSteps.length}`}
      </span>
      <motion.i
        className={styles.buildProgress}
        style={{ scaleX: completion }}
        aria-hidden="true"
      />
    </div>
  );
}

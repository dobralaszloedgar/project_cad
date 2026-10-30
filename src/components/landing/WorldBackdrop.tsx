"use client";

import styles from "./LandingPage.module.css";

/** A restrained screen vignette; the entire world behind it is rendered in 3D. */
export default function WorldBackdrop() {
  return (
    <div className={styles.world} aria-hidden="true">
      <div className={styles.worldShade} />
      <div className={styles.grain} />
    </div>
  );
}

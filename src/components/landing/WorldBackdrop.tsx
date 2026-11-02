// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import styles from "./LandingPage.module.css";

/** A restrained screen vignette over the process scene. */
export default function WorldBackdrop() {
  return (
    <div className={styles.world} aria-hidden="true">
      <div className={styles.worldShade} />
    </div>
  );
}

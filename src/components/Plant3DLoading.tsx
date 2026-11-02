// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { LoaderCircle } from "lucide-react";
import styles from "./Plant3DLoading.module.css";

export default function Plant3DLoading({
  overlay = false,
}: {
  overlay?: boolean;
}) {
  return (
    <div
      className={overlay ? styles.overlay : styles.placeholder}
      role="status"
    >
      <span className={styles.spinner} aria-hidden="true">
        <LoaderCircle size={28} />
      </span>
      <span>Loading 3D workspace…</span>
    </div>
  );
}

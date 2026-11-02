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

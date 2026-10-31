import styles from "./graphics.module.css";

export function AccelerationHelp() {
  return (
    <div className={styles.help}>
      <p>
        Graphics acceleration may be off or unavailable. Integrated graphics are
        supported; a dedicated GPU is not required.
      </p>
      <p>
        In Chrome or Edge, open Settings → System, enable “Use graphics
        acceleration when available”, then restart the browser.
      </p>
      <p>
        In Firefox, open Settings → General → Performance and enable hardware
        acceleration. If it is already enabled, update your browser and graphics
        driver.
      </p>
      <p>You can continue working in the 2D flowsheet.</p>
    </div>
  );
}

export function AccelerationNotice({ className = "" }: { className?: string }) {
  return (
    <details className={`${styles.notice} ${className}`}>
      <summary>Limited graphics acceleration · Enable for smoother 3D</summary>
      <div className={styles.panel}>
        <p role="status">
          Your browser reports software or fallback rendering.
        </p>
        <AccelerationHelp />
      </div>
    </details>
  );
}

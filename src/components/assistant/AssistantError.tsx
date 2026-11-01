"use client";
import styles from "../AssistantPanel.module.css";

export default function AssistantError({
  message,
  onUpdate,
}: {
  message: string;
  onUpdate?: () => void;
}) {
  const schemaError =
    message.includes("invalid type: integer") &&
    message.includes("as u128, expected any value");
  if (!schemaError)
    return (
      <p className={styles.error} role="alert">
        {message}
      </p>
    );
  return (
    <div className={styles.agentStatus} role="alert">
      <strong>This connector issue is fixed in Assistant 0.1.3</strong>
      <p>
        If you’ve already updated, send your message again. Otherwise, install
        the latest assistant and reconnect. Your agent choices are saved.
      </p>
      {onUpdate ? (
        <button className={styles.textButton} onClick={onUpdate}>
          Update assistant
        </button>
      ) : null}
      <details>
        <summary>Technical details</summary>
        <p className={styles.error}>{message}</p>
      </details>
    </div>
  );
}

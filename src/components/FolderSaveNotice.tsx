"use client";

import { AlertCircle } from "lucide-react";
import styles from "./FolderSaveNotice.module.css";

export type FolderSaveNoticeProps = {
  message: string;
  folderName: string | null;
  needsPermission: boolean;
  busy: boolean;
  onRetry: () => void;
  onReconnect: () => void;
  onReload: () => void;
  onExport: () => void;
};

export default function FolderSaveNotice({
  message,
  folderName,
  needsPermission,
  busy,
  onRetry,
  onReconnect,
  onReload,
  onExport,
}: FolderSaveNoticeProps) {
  const reconnect = !!folderName && needsPermission;

  return (
    <div className={styles.notice} role="alert" aria-busy={busy}>
      <div className={styles.content}>
        <AlertCircle className={styles.icon} size={18} aria-hidden="true" />
        <div className={styles.details}>
          <p>{message}</p>
          {folderName ? <code>{folderName}/project.json</code> : null}
        </div>
      </div>
      <div className={styles.actions} role="group" aria-label="Save options">
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={reconnect ? onReconnect : onRetry}
        >
          {reconnect ? "Reconnect folder" : "Retry save"}
        </button>
        {folderName ? (
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={onReload}
          >
            Reload from folder
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={onExport}
        >
          Export local copy
        </button>
      </div>
    </div>
  );
}

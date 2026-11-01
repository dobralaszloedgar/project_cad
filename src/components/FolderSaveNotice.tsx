"use client";

import { AlertCircle } from "lucide-react";
import styles from "./FolderSaveNotice.module.css";

export type FolderSaveNoticeProps = {
  message: string;
  folderName: string | null;
  fileName?: string;
  needsPermission: boolean;
  busy: boolean;
  onRetry: () => void;
  onReconnect: () => void;
  onReload: () => void;
  onExport: () => void;
  onLocate?: () => void;
};

export default function FolderSaveNotice({
  message,
  folderName,
  fileName = "project.json",
  needsPermission,
  busy,
  onRetry,
  onReconnect,
  onReload,
  onExport,
  onLocate,
}: FolderSaveNoticeProps) {
  const reconnect = !!folderName && needsPermission;

  return (
    <div className={styles.notice} role="alert" aria-busy={busy}>
      <div className={styles.content}>
        <AlertCircle className={styles.icon} size={18} aria-hidden="true" />
        <div className={styles.details}>
          <p>{message}</p>
          {folderName ? (
            <code>
              {folderName}/{fileName}
            </code>
          ) : null}
        </div>
      </div>
      <div className={styles.actions} role="group" aria-label="Save options">
        {folderName && onLocate ? (
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={onLocate}
          >
            Locate project
          </button>
        ) : null}
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

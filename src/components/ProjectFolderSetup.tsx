"use client";

import { useEffect, useRef, useState } from "react";
import { FolderOpen, X } from "lucide-react";
import {
  chooseProjectDirectory,
  folderPermission,
  supportsProjectFolders,
  type ProjectDirectoryHandle,
} from "@/lib/project-directory";
import {
  getDefaultProjectDirectory,
  setDefaultProjectDirectory,
} from "@/lib/project-preferences";
import styles from "./ProjectFolderSetup.module.css";

export default function ProjectFolderSetup({
  onComplete,
  onConnected,
}: {
  onComplete: () => void;
  onConnected: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [directory, setDirectory] = useState<ProjectDirectoryHandle | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);

  useEffect(() => {
    if (!supportsProjectFolders()) {
      onComplete();
      return;
    }
    let active = true;
    async function checkFolder() {
      try {
        const saved = await getDefaultProjectDirectory();
        let dismissed = false;
        try {
          dismissed =
            localStorage.getItem("project-cad.folder-setup-dismissed") ===
            "true";
        } catch {
          /* Remembering dismissal is optional. */
        }
        if (!saved && dismissed) {
          if (active) onComplete();
          return;
        }
        const permission = saved ? await folderPermission(saved) : null;
        if (active) {
          if (saved && permission === "granted") {
            onComplete();
            return;
          }
          setDirectory(saved);
          setOpen(true);
        }
      } catch {
        if (active) {
          setError("Could not load your folder. Choose it again.");
          setOpen(true);
        }
      }
    }
    void checkFolder();
    return () => {
      active = false;
    };
  }, [onComplete]);

  async function connect(chooseNew: boolean) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      // Both picker and permission requests must start inside the user's click.
      const selected = chooseNew ? await chooseProjectDirectory() : directory;
      if (!selected) return;
      if (
        !chooseNew &&
        (await selected.requestPermission({ mode: "readwrite" })) !== "granted"
      )
        throw new Error("Allow folder access or choose another folder.");
      await setDefaultProjectDirectory(selected);
      setDirectory(selected);
      onComplete();
      onConnected();
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Could not save your folder. Try again.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <section
      className={styles.notice}
      aria-label={
        directory ? "Reconnect project folder" : "Choose project folder"
      }
      aria-busy={busy}
    >
      <FolderOpen size={18} aria-hidden="true" />
      <div className={styles.content}>
        <strong>
          {directory
            ? `Reconnect ${directory.name}`
            : "Save projects to a folder"}
        </strong>
        <p>
          {directory
            ? "Restore access to save changes on this computer."
            : "Choose a folder for automatic saving, or keep working in this browser."}
        </p>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className={styles.actions}>
        {directory ? (
          <button
            className="btn btn-sm"
            disabled={busy}
            onClick={() => void connect(true)}
          >
            Change folder
          </button>
        ) : null}
        <button
          className="btn btn-sm btn-primary"
          disabled={busy}
          onClick={() => void connect(!directory)}
        >
          {busy
            ? "Connecting…"
            : directory
              ? "Reconnect folder"
              : "Choose folder"}
        </button>
        <button
          className="btn btn-sm"
          aria-label={
            directory ? "Dismiss folder reconnect" : "Dismiss folder setup"
          }
          disabled={busy}
          onClick={() => {
            try {
              if (!directory)
                localStorage.setItem(
                  "project-cad.folder-setup-dismissed",
                  "true",
                );
            } catch {
              /* Dismiss even when browser storage is unavailable. */
            }
            onComplete();
          }}
        >
          <X size={16} />
        </button>
      </div>
    </section>
  );
}

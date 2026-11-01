"use client";

import { useEffect, useRef, useState } from "react";
import { FolderOpen } from "lucide-react";
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
import Dialog from "./Dialog";
import styles from "./CreateProjectDialog.module.css";
import { connectProjectRoot } from "@/lib/storage";

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
  const chooseButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!supportsProjectFolders()) {
      onComplete();
      return;
    }
    let active = true;
    async function checkFolder() {
      try {
        const saved = await getDefaultProjectDirectory();
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
      await connectProjectRoot(selected);
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
    <Dialog
      title={directory ? "Reconnect project folder" : "Choose project folder"}
      className={styles.dialog}
      initialFocusRef={chooseButton}
      onClose={() => {
        if (!locked.current) onComplete();
      }}
    >
      <div className={styles.form} aria-busy={busy}>
        {directory ? (
          <div className={styles.folderName}>
            <FolderOpen size={20} aria-hidden="true" />
            <span>{directory.name}</span>
          </div>
        ) : (
          <p className={styles.hint}>New projects save here automatically.</p>
        )}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.actions}>
          {directory ? (
            <button
              className="btn"
              disabled={busy}
              onClick={() => void connect(true)}
            >
              Change folder
            </button>
          ) : null}
          <button
            ref={chooseButton}
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void connect(!directory)}
          >
            {busy
              ? "Connecting…"
              : directory
                ? "Reconnect folder"
                : "Choose folder"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

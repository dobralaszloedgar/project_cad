"use client";

import { useEffect, useRef, useState } from "react";
import { FolderOpen } from "lucide-react";
import {
  chooseProjectDirectory,
  supportsProjectFolders,
  type ProjectDirectoryHandle,
} from "@/lib/project-directory";
import {
  getDefaultProjectDirectory,
  setDefaultProjectDirectory,
} from "@/lib/project-preferences";
import styles from "./CreateProjectDialog.module.css";
import { connectProjectRoot } from "@/lib/storage";

export default function ProjectStorageSettings() {
  const [directory, setDirectory] = useState<ProjectDirectoryHandle | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const [supported] = useState(supportsProjectFolders);

  useEffect(() => {
    let active = true;
    getDefaultProjectDirectory()
      .then((saved) => {
        if (active) setDirectory(saved);
      })
      .catch(() => {
        if (active)
          setError(
            "Could not read your saved folder preference. Choose a folder to try again.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function change() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await chooseProjectDirectory();
      if (!next) return;
      await setDefaultProjectDirectory(next);
      await connectProjectRoot(next);
      setDirectory(next);
      window.dispatchEvent(new Event("project-cad-folders-changed"));
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Could not save your folder preference.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      className="project-storage-settings"
      aria-label="Save location"
      aria-busy={loading || busy}
    >
      <h3>Project folder</h3>
      <div className={styles.folderRow}>
        <div className={styles.folderName}>
          <FolderOpen size={20} aria-hidden="true" />
          <span>
            {loading
              ? "Loading folder…"
              : (directory?.name ?? "No folder selected")}
          </span>
        </div>
        <button
          className="btn"
          disabled={loading || busy || !supported}
          onClick={() => void change()}
        >
          {busy ? "Saving…" : directory ? "Change folder" : "Choose folder"}
        </button>
      </div>
      {!supported ? (
        <p className={styles.notice} role="status">
          Use desktop Chrome or Edge to choose a folder.
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

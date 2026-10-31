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

export default function ProjectStorageSettings() {
  const [directory, setDirectory] = useState<ProjectDirectoryHandle | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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

  async function change(clear = false) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = clear ? null : await chooseProjectDirectory();
      if (!clear && !next) return;
      await setDefaultProjectDirectory(next);
      setDirectory(next);
      setNotice(
        next ? "Default folder saved." : "New projects will ask for a folder.",
      );
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
      <h3>Default project folder</h3>
      <p>
        New projects and duplicates start in this folder. Each project gets its
        own folder with a <code>project.json</code> file containing the project
        and revision history.
      </p>
      <div className={styles.folderRow}>
        <div className={styles.folderName}>
          <FolderOpen size={20} aria-hidden="true" />
          <span>
            {loading
              ? "Loading folder…"
              : (directory?.name ?? "Ask for each project")}
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
      {directory ? (
        <div className={styles.destination}>
          <span>New projects save to</span>
          <code>{directory.name}/Project name/project.json</code>
        </div>
      ) : null}
      {directory ? (
        <button
          className="btn"
          disabled={busy || loading}
          onClick={() => void change(true)}
        >
          Ask every time
        </button>
      ) : null}
      <p>
        Existing projects keep their save locations. Use a project’s “Save to
        folder…” action to choose a new location; its previous file stays in
        place.
      </p>
      {!supported ? (
        <p className={styles.notice} role="status">
          Folder access requires desktop Chrome or Edge on HTTPS or localhost.
          Your existing browser projects remain available.
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FolderOpen } from "lucide-react";
import type { Project } from "@/domain/schema";
import {
  chooseProjectDirectory,
  supportsProjectFolders,
  validateProjectFolderName,
  type ProjectDirectoryHandle,
} from "@/lib/storage";
import Dialog from "./Dialog";
import styles from "./CreateProjectDialog.module.css";

export default function CreateProjectDialog({
  seed,
  onCreate,
  onClose,
}: {
  seed: Project;
  onCreate: (name: string, directory: ProjectDirectoryHandle) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(seed.name);
  const [directory, setDirectory] = useState<ProjectDirectoryHandle | null>(
    null,
  );
  const [supported] = useState(supportsProjectFolders);
  const [touched, setTouched] = useState(false);
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const container = useRef<HTMLDivElement>(null);
  const id = useId();
  const busy = picking || creating;
  let validName = "";
  let nameError = "";
  try {
    validName = validateProjectFolderName(name);
  } catch (value) {
    nameError =
      value instanceof Error ? value.message : "Enter a valid project name.";
  }
  const showNameError = !!nameError && (touched || name.length > 0);

  useEffect(() => {
    const element = container.current;
    function preventBusyDismissal(event: Event) {
      if (locked.current) event.preventDefault();
    }
    // Native dialog cancellation does not bubble, so guard it during capture.
    element?.addEventListener("cancel", preventBusyDismissal, true);
    return () =>
      element?.removeEventListener("cancel", preventBusyDismissal, true);
  }, []);

  function close() {
    if (!locked.current) onClose();
  }

  async function chooseFolder() {
    if (locked.current || !supported) return;
    locked.current = true;
    setPicking(true);
    setError("");
    try {
      // Keep the picker in this click's user activation, before other async work.
      const selected = await chooseProjectDirectory();
      if (selected) setDirectory(selected);
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Could not open the folder picker. Please try again.",
      );
    } finally {
      locked.current = false;
      setPicking(false);
    }
  }

  async function create() {
    if (locked.current) return;
    setTouched(true);
    if (!validName || !directory || !supported) return;
    locked.current = true;
    setCreating(true);
    setError("");
    try {
      await onCreate(validName, directory);
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Could not create this project. Choose another folder or try again.",
      );
    } finally {
      locked.current = false;
      setCreating(false);
    }
  }

  return (
    <div ref={container}>
      <Dialog title="Create project" className={styles.dialog} onClose={close}>
        <form
          className={styles.form}
          aria-busy={busy}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <p className={styles.intro}>
            Keep this project in a folder on your laptop. Your work and revision
            history will save automatically to <code>project.json</code>.
          </p>
          <div className={styles.field}>
            <label htmlFor={`${id}-name`}>Project name</label>
            <input
              id={`${id}-name`}
              className="input"
              autoFocus
              autoComplete="off"
              maxLength={80}
              value={name}
              disabled={busy}
              aria-invalid={showNameError || undefined}
              aria-describedby={`${id}-name-help`}
              onBlur={() => setTouched(true)}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
            />
            <p
              id={`${id}-name-help`}
              className={showNameError ? styles.error : styles.hint}
            >
              {showNameError
                ? nameError
                : "A new project folder will use this name."}
            </p>
          </div>
          <div className={styles.field}>
            <span id={`${id}-folder-label`}>Parent folder</span>
            <div className={styles.folderRow}>
              <div className={styles.folderName}>
                <FolderOpen size={20} aria-hidden="true" />
                <span>{directory ? directory.name : "No folder selected"}</span>
              </div>
              <button
                className="btn"
                type="button"
                disabled={!supported || busy}
                aria-describedby={`${id}-folder-label`}
                onClick={() => void chooseFolder()}
              >
                {picking
                  ? "Choosing…"
                  : directory
                    ? "Change folder"
                    : "Choose folder"}
              </button>
            </div>
            {directory ? (
              <div className={styles.destination} aria-live="polite">
                <span>Project location</span>
                <code>
                  {directory.name}/{validName || "Project name"}/project.json
                </code>
              </div>
            ) : (
              <p className={styles.hint}>
                Choose where to create this project on your laptop.
              </p>
            )}
          </div>
          {!supported ? (
            <p className={styles.notice} role="status">
              Folder access is unavailable in this browser. Open Project CAD in
              desktop Chrome or Edge to save directly to a folder on your
              laptop.
            </p>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <div className={styles.actions}>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={close}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !supported || !validName || !directory}
            >
              {creating ? "Creating project…" : "Create project"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

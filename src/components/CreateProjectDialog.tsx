"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight, FolderOpen } from "lucide-react";
import type { Project } from "@/domain/schema";
import {
  chooseProjectDirectory,
  supportsProjectFolders,
  validateProjectFolderName,
  type ProjectDirectoryHandle,
} from "@/lib/storage";
import Dialog from "./Dialog";
import { getDefaultProjectDirectory } from "@/lib/project-preferences";
import styles from "./CreateProjectDialog.module.css";
import NewProjectDialog from "./NewProjectDialog";

type Props = {
  seed: Project;
  onCreate: (name: string, directory: ProjectDirectoryHandle) => Promise<void>;
  onClose: () => void;
  saveLocation?: boolean;
  initialDirectory?: ProjectDirectoryHandle | null;
  moving?: boolean;
};

export default function CreateProjectDialog(props: Props) {
  return props.saveLocation || props.moving ? (
    <ProjectFileDialog {...props} />
  ) : (
    <NewProjectDialog {...props} />
  );
}

function ProjectFileDialog({
  seed,
  onCreate,
  onClose,
  saveLocation = false,
  initialDirectory,
  moving = false,
}: Props) {
  const [name, setName] = useState(seed.name);
  const [directory, setDirectory] = useState<ProjectDirectoryHandle | null>(
    initialDirectory ?? null,
  );
  const [supported] = useState(supportsProjectFolders);
  const [touched, setTouched] = useState(false);
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [loadingDirectory, setLoadingDirectory] = useState(!initialDirectory);
  const locked = useRef(false);
  const container = useRef<HTMLDivElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const id = useId();
  const busy = picking || creating || loadingDirectory;
  const title = moving
    ? "Move project"
    : saveLocation
      ? "Save project to folder"
      : "Create project";
  let validName = "";
  let nameError = "";
  try {
    validName = validateProjectFolderName(name);
  } catch (value) {
    nameError =
      value instanceof Error ? value.message : "Enter a valid project name.";
  }
  const showNameError = !!nameError && (touched || name.length > 0);
  const folderPath = directory
    ? `${directory.name}/${validName.replace(/\.pcad$/i, "") || "Project name"}.pcad`
    : "";

  useEffect(() => {
    let active = true;
    if (initialDirectory) return;
    getDefaultProjectDirectory()
      .then((saved) => {
        if (active) setDirectory(saved);
      })
      .catch(() => {
        /* A preference failure must not block manual selection. */
      })
      .finally(() => {
        if (active) setLoadingDirectory(false);
      });
    return () => {
      active = false;
    };
  }, [initialDirectory]);

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
      // Remembered handles can require a fresh grant after restarting the browser.
      if (
        (await directory.requestPermission({ mode: "readwrite" })) !== "granted"
      )
        throw new Error(
          "Folder access was not granted. Choose a folder or allow access to continue.",
        );
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
      <Dialog
        title={title}
        className={styles.dialog}
        initialFocusRef={nameInput}
        onClose={close}
      >
        <form
          className={styles.form}
          aria-busy={busy}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <div className={styles.field}>
            <label htmlFor={`${id}-name`}>Project name</label>
            <input
              ref={nameInput}
              id={`${id}-name`}
              className="input"
              autoComplete="off"
              maxLength={80}
              value={name}
              disabled={picking || creating}
              aria-invalid={showNameError || undefined}
              aria-describedby={showNameError ? `${id}-name-error` : undefined}
              onBlur={() => setTouched(true)}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
            />
            {showNameError ? (
              <p id={`${id}-name-error`} className={styles.error}>
                {nameError}
              </p>
            ) : null}
          </div>
          <div className={styles.field}>
            <span id={`${id}-folder-label`}>Save location</span>
            <button
              className={styles.folderPicker}
              type="button"
              disabled={!supported || busy}
              aria-label={directory ? "Change folder" : "Choose folder"}
              aria-describedby={`${id}-folder-label ${id}-folder-value ${id}-folder-help`}
              title={folderPath || undefined}
              onClick={() => void chooseFolder()}
            >
              <FolderOpen size={18} aria-hidden="true" />
              <span
                id={`${id}-folder-value`}
                className={styles.folderPath}
                aria-live="polite"
              >
                {picking
                  ? "Choosing…"
                  : loadingDirectory
                    ? "Loading folder…"
                    : folderPath || "Choose folder"}
              </span>
              {directory ? (
                <span className={styles.changeFolder}>Change</span>
              ) : (
                <ChevronRight size={16} aria-hidden="true" />
              )}
            </button>
            <p id={`${id}-folder-help`} className={styles.hint}>
              {moving
                ? "Moves the project file and its history. Future edits save at the new location."
                : "One .pcad file contains your project and history. Your work saves automatically."}
            </p>
          </div>
          {!supported ? (
            <p className={styles.notice} role="status">
              Use desktop Chrome or Edge to save to a folder.
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
              className={`btn ${styles.cancel}`}
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
              {creating
                ? moving
                  ? "Moving project…"
                  : saveLocation
                    ? "Saving project…"
                    : "Creating project…"
                : moving
                  ? "Move project"
                  : saveLocation
                    ? "Save to folder"
                    : "Create project"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

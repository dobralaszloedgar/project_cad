"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  File,
  FolderOpen,
  FolderPlus,
} from "lucide-react";
import type { Project } from "@/domain/schema";
import {
  chooseProjectDirectory,
  connectProjectRoot,
  createProjectLibraryFolder,
  getProjectDirectoryPath,
  supportsProjectFolders,
  validateProjectFolderName,
  type ProjectDirectoryHandle,
} from "@/lib/storage";
import { folderPermission, projectFileName } from "@/lib/project-directory";
import { getDefaultProjectDirectory } from "@/lib/project-preferences";
import Dialog from "./Dialog";
import styles from "./CreateProjectDialog.module.css";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function NewProjectDialog({
  seed,
  initialDirectory,
  onCreate,
  onClose,
}: {
  seed: Project;
  initialDirectory?: ProjectDirectoryHandle | null;
  onCreate: (name: string, directory: ProjectDirectoryHandle) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(seed.name);
  const [directory, setDirectory] = useState(initialDirectory ?? null);
  const [parentPath, setParentPath] = useState(initialDirectory?.name ?? "");
  const [permission, setPermission] = useState<PermissionState>("prompt");
  const [step, setStep] = useState<"details" | "folder" | "reconnect">(
    "details",
  );
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<
    "folder" | "project" | "picker" | null
  >(null);
  const [supported] = useState(supportsProjectFolders);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState("");
  const [folderCreated, setFolderCreated] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const folderAction = useRef<HTMLButtonElement>(null);
  const locked = useRef(false);
  const id = useId();
  const busy = pending !== null;

  useEffect(() => {
    let active = true;
    void (async () => {
      const saved =
        initialDirectory ??
        (await getDefaultProjectDirectory().catch(() => null));
      if (saved) {
        const [access, path] = await Promise.all([
          folderPermission(saved),
          getProjectDirectoryPath(saved).catch(() => saved.name),
        ]);
        if (!active) return;
        setDirectory(saved);
        setPermission(access);
        setParentPath(path);
      }
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [initialDirectory]);

  useEffect(() => {
    if (folderOpen) folderInput.current?.focus();
  }, [folderOpen]);

  useEffect(() => {
    if (step === "details") input.current?.focus();
    else cancel.current?.focus();
  }, [step]);

  let validName = "";
  let fileName = "Project name.pcad";
  let nameError = "";
  try {
    fileName = projectFileName(name);
    validName = validateProjectFolderName(name);
  } catch (value) {
    nameError = errorMessage(value, "Enter a valid project name.");
  }
  let validFolder = "";
  try {
    validFolder = validateProjectFolderName(folderName);
  } catch {
    /* Draft can be incomplete. */
  }
  const showNameError = Boolean(nameError && (touched || name.length));
  const destination = [parentPath, folderOpen ? validFolder : "", fileName]
    .filter(Boolean)
    .join("/");

  function close() {
    if (!locked.current) onClose();
  }

  function toggleFolder(open: boolean) {
    setFolderOpen(open);
    setFolderName("");
    setFolderError("");
    setFolderCreated("");
    if (!open) requestAnimationFrame(() => folderAction.current?.focus());
  }

  async function requestAccess(selected: ProjectDirectoryHandle) {
    // This must start in the button's activation, before storage work.
    const access = await selected.requestPermission({ mode: "readwrite" });
    setPermission(access);
    if (access !== "granted")
      throw new Error(
        "Folder access was not granted. Reconnect or choose another folder.",
      );
  }

  async function makeFolder() {
    if (locked.current || loading || !directory || !supported) return;
    let nextName: string;
    try {
      nextName = validateProjectFolderName(folderName);
    } catch (value) {
      setFolderError(
        errorMessage(value, "Enter a valid subfolder name.").replace(
          "project name",
          "subfolder name",
        ),
      );
      folderInput.current?.focus();
      return;
    }
    locked.current = true;
    setPending("folder");
    setFolderError("");
    setError("");
    try {
      await requestAccess(directory);
      // Keep the parent registered so deeper folders retain the complete path.
      await connectProjectRoot(directory);
      const child = (await createProjectLibraryFolder(
        directory,
        nextName,
      )) as ProjectDirectoryHandle;
      setDirectory(child);
      setParentPath(`${parentPath}/${child.name}`);
      setFolderOpen(false);
      setFolderName("");
      setFolderCreated(`Created ${child.name}. This folder is now selected.`);
      requestAnimationFrame(() => folderAction.current?.focus());
    } catch (value) {
      setFolderError(
        errorMessage(
          value,
          "Could not create the subfolder. Please try again.",
        ),
      );
    } finally {
      locked.current = false;
      setPending(null);
    }
  }

  async function finish(selected: ProjectDirectoryHandle) {
    await requestAccess(selected);
    await onCreate(validName, selected);
  }

  async function submit() {
    if (locked.current || loading || !supported || folderOpen) return;
    setTouched(true);
    if (!validName) return;
    setError("");
    if (!directory) {
      setStep("folder");
      return;
    }
    if (step === "details" && permission !== "granted") {
      setStep("reconnect");
      return;
    }
    locked.current = true;
    setPending("project");
    try {
      await finish(directory);
    } catch (value) {
      setError(
        errorMessage(value, "Could not create this project. Please try again."),
      );
    } finally {
      locked.current = false;
      setPending(null);
    }
  }

  async function choose(create: boolean) {
    if (locked.current || loading || !supported) return;
    locked.current = true;
    setPending(create ? "project" : "picker");
    setError("");
    try {
      const selected = await chooseProjectDirectory();
      if (!selected) return;
      setDirectory(selected);
      setParentPath(selected.name);
      setFolderCreated("");
      if (create) await finish(selected);
      else {
        const [access, path] = await Promise.all([
          folderPermission(selected),
          getProjectDirectoryPath(selected).catch(() => selected.name),
        ]);
        setPermission(access);
        setParentPath(path);
      }
    } catch (value) {
      setError(
        errorMessage(value, "Could not open the folder. Please try again."),
      );
    } finally {
      locked.current = false;
      setPending(null);
    }
  }

  const title =
    step === "folder"
      ? "Choose a project folder"
      : step === "reconnect"
        ? "Reconnect your project folder"
        : "Create project";
  return (
    <Dialog
      title={title}
      className={`${styles.dialog} ${styles.newProject}`}
      initialFocusRef={input}
      onClose={close}
    >
      <form
        className={styles.form}
        noValidate
        aria-busy={busy || loading}
        onSubmit={(event) => {
          event.preventDefault();
          void (step === "folder" ? choose(true) : submit());
        }}
      >
        {step === "details" ? (
          <>
            <div className={styles.field}>
              <label htmlFor={`${id}-name`}>Project name</label>
              <input
                ref={input}
                id={`${id}-name`}
                className="input"
                autoComplete="off"
                maxLength={80}
                value={name}
                disabled={busy}
                aria-invalid={showNameError || undefined}
                aria-describedby={
                  showNameError ? `${id}-name-error` : undefined
                }
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
              <span id={`${id}-location-label`}>Save location</span>
              {directory ? (
                <div
                  className={styles.locationCard}
                  role="group"
                  aria-labelledby={`${id}-location-label`}
                >
                  <button
                    type="button"
                    className={styles.parentFolder}
                    disabled={busy || loading || folderOpen || !supported}
                    aria-label="Change folder"
                    onClick={() => void choose(false)}
                  >
                    <FolderOpen size={20} aria-hidden="true" />
                    <span>{parentPath}</span>
                    <span className={styles.parentChange}>Change</span>
                  </button>
                  <button
                    ref={folderAction}
                    type="button"
                    className={styles.newSubfolder}
                    disabled={busy || loading || !supported}
                    aria-label="New subfolder"
                    aria-describedby={`${id}-subfolder-parent`}
                    aria-expanded={folderOpen}
                    aria-controls={`${id}-inline-folder`}
                    onClick={() => toggleFolder(!folderOpen)}
                  >
                    <span className={styles.subfolderIcon}>
                      <FolderPlus size={21} aria-hidden="true" />
                    </span>
                    <span>
                      <strong>New subfolder</strong>
                      <small id={`${id}-subfolder-parent`}>
                        Create inside {directory.name}
                      </small>
                    </span>
                    <ChevronRight size={17} aria-hidden="true" />
                  </button>
                  {folderOpen ? (
                    <div
                      id={`${id}-inline-folder`}
                      className={styles.inlineFolder}
                      role="group"
                      aria-label="New subfolder"
                    >
                      <label htmlFor={`${id}-folder-name`}>
                        Subfolder name
                      </label>
                      <input
                        ref={folderInput}
                        id={`${id}-folder-name`}
                        className="input"
                        autoComplete="off"
                        maxLength={80}
                        placeholder="e.g. Utilities"
                        disabled={busy}
                        value={folderName}
                        aria-invalid={Boolean(folderError)}
                        aria-describedby={
                          folderError
                            ? `${id}-folder-error`
                            : `${id}-parent-note`
                        }
                        onChange={(event) => {
                          setFolderName(event.target.value);
                          setFolderError("");
                        }}
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" &&
                            !event.nativeEvent.isComposing
                          ) {
                            event.preventDefault();
                            void makeFolder();
                          }
                        }}
                      />
                      <p id={`${id}-parent-note`} className={styles.parentNote}>
                        Inside <strong>{parentPath}</strong>
                      </p>
                      {folderError ? (
                        <p
                          id={`${id}-folder-error`}
                          className={styles.error}
                          role="alert"
                        >
                          {folderError}
                        </p>
                      ) : null}
                      <div className={styles.inlineActions}>
                        <button
                          type="button"
                          className="btn"
                          disabled={busy}
                          onClick={() => toggleFolder(false)}
                        >
                          Cancel subfolder
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy || !folderName.trim()}
                          onClick={() => void makeFolder()}
                        >
                          {pending === "folder"
                            ? "Creating folder…"
                            : "Create folder"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className={styles.fileDestination}>
                    <File size={15} aria-hidden="true" />
                    <div>
                      <span>
                        {folderOpen && validFolder
                          ? "After creating the subfolder"
                          : "Project will save to"}
                      </span>
                      <strong>{destination}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <p className={styles.notice}>
                  No folder connected. Choose where to save this project in the
                  next step.
                </p>
              )}
              {folderCreated ? (
                <p className={styles.folderSuccess} role="status">
                  <Check size={14} aria-hidden="true" />
                  {folderCreated}
                </p>
              ) : loading ? (
                <p className={styles.hint}>Checking your project folder…</p>
              ) : directory && permission !== "granted" ? (
                <p className={styles.hint}>
                  This folder needs permission restored before saving.
                </p>
              ) : !directory ? (
                <p className={styles.hint}>
                  We’ll remember the folder for your next project.
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <p className={styles.hint}>
              {step === "folder" ? (
                <>
                  Choose where to save <strong>{fileName}</strong>. Your next
                  projects will use this folder automatically.
                </>
              ) : (
                <>
                  Restore access to <strong>{parentPath}</strong> to create{" "}
                  <strong>{fileName}</strong>.
                </>
              )}
            </p>
            <div className={styles.folderPicker}>
              <FolderOpen size={22} aria-hidden="true" />
              <div className={styles.folderPath}>
                <strong>{parentPath || "Your project folder"}</strong>
                <p className={styles.hint}>
                  {step === "folder"
                    ? "Choose an existing folder or create a new one in the folder picker."
                    : "Your project details are kept while you reconnect."}
                </p>
              </div>
            </div>
            {step === "reconnect" ? (
              <button
                type="button"
                className={styles.textButton}
                disabled={busy}
                onClick={() => void choose(true)}
              >
                Choose another folder{" "}
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            ) : null}
          </>
        )}
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
          {step !== "details" ? (
            <button
              type="button"
              className={`btn ${styles.cancel}`}
              disabled={busy}
              onClick={() => {
                setStep("details");
                setError("");
              }}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Back
            </button>
          ) : null}
          <button
            ref={cancel}
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
            disabled={busy || loading || !supported || !validName || folderOpen}
          >
            {pending === "project"
              ? "Creating project…"
              : step === "folder"
                ? "Choose folder & create"
                : step === "reconnect"
                  ? "Reconnect & create"
                  : directory && permission === "granted"
                    ? "Create project"
                    : "Continue"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

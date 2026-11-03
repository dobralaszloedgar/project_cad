// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FolderOpen } from "lucide-react";
import {
  chooseProjectDirectory,
  connectProjectRoot,
  getProjectDirectoryPath,
  supportsProjectFolders,
  validateProjectFolderName,
  type ProjectDirectoryHandle,
} from "@/lib/storage";
import {
  getDefaultProjectDirectory,
  setDefaultProjectDirectory,
} from "@/lib/project-preferences";
import Dialog from "./Dialog";
import styles from "./CreateProjectDialog.module.css";

export default function CreateFolderDialog({
  initialDirectory,
  onCreate,
  onClose,
}: {
  initialDirectory?: ProjectDirectoryHandle;
  onCreate: (directory: ProjectDirectoryHandle, name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [directory, setDirectory] = useState(initialDirectory ?? null);
  const [parentPath, setParentPath] = useState(initialDirectory?.name ?? "");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [supported] = useState(supportsProjectFolders);
  const locked = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const saved = initialDirectory ?? (await getDefaultProjectDirectory());
        const path = saved ? await getProjectDirectoryPath(saved) : "";
        if (active) {
          setDirectory(saved);
          setParentPath(path);
        }
      } catch {
        if (active) setError("Could not load your storage folder. Try again.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [initialDirectory]);

  function close() {
    if (!locked.current) onClose();
  }

  async function chooseStorageFolder() {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError("");
    try {
      const selected = await chooseProjectDirectory();
      if (!selected) return;
      await setDefaultProjectDirectory(selected);
      await connectProjectRoot(selected);
      setDirectory(selected);
      setParentPath(await getProjectDirectoryPath(selected));
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Could not choose a storage folder.",
      );
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  async function create() {
    if (locked.current || loading || !directory || !supported) return;
    setError("");
    let validName: string;
    try {
      validName = validateProjectFolderName(name);
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message.replace("project name", "folder name")
          : "Enter a valid folder name.",
      );
      input.current?.focus();
      return;
    }
    locked.current = true;
    setPending(true);
    try {
      await onCreate(directory, validName);
      onClose();
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Could not create folder.",
      );
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog
      title="New folder"
      className={styles.dialog}
      initialFocusRef={input}
      onClose={close}
    >
      <form
        className={styles.form}
        aria-busy={loading || pending}
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <div className={styles.field}>
          <label htmlFor={id}>Folder name</label>
          <input
            id={id}
            ref={input}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
            disabled={pending}
          />
        </div>
        {loading ? (
          <p className={styles.hint} role="status">
            Loading storage folder…
          </p>
        ) : directory ? (
          <div className={styles.destination}>
            <span>Create in</span>
            <code>
              {parentPath}/{name.trim() || "New folder"}
            </code>
          </div>
        ) : supported ? (
          <button
            type="button"
            className={styles.folderPicker}
            disabled={pending}
            onClick={() => void chooseStorageFolder()}
          >
            <FolderOpen size={18} />
            Choose storage folder
          </button>
        ) : null}
        {!supported ? (
          <p className={styles.notice}>
            Use desktop Chrome or Edge to create a folder on your computer.
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
            disabled={pending}
            onClick={close}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={
              loading || pending || !directory || !supported || !name.trim()
            }
          >
            {pending ? "Creating…" : "Create folder"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

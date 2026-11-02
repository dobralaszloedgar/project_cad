"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, RefreshCw } from "lucide-react";
import type { AssistantClient } from "@/assistant/client";
import type { ConnectorPreferences } from "@/assistant/connector";
import styles from "./AssistantConnectorSettings.module.css";

export default function AssistantConnectorSettings({
  assistant,
  onBack,
  onUpdate,
}: {
  assistant: AssistantClient;
  onBack: () => void;
  onUpdate: () => void;
}) {
  const supported = assistant.capabilities.includes("connector-settings-v1");
  const [saved, setSaved] = useState<ConnectorPreferences>();
  const [draft, setDraft] = useState<ConnectorPreferences>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const { getConnectorSettings, saveConnectorSettings } = assistant;
  useEffect(() => {
    if (!supported) return;
    let active = true;
    void getConnectorSettings()
      .then((value) => {
        if (active) {
          setSaved(value);
          setDraft(value);
          setError("");
        }
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not load connector settings.",
          );
      });
    return () => {
      active = false;
    };
  }, [getConnectorSettings, supported, attempt]);
  const dirty =
    draft?.accessMode !== saved?.accessMode ||
    draft?.projectsDirectory !== saved?.projectsDirectory;
  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const value = await saveConnectorSettings(draft);
      setSaved(value);
      setDraft(value);
      setMessage("Settings saved. Your assistant is ready.");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not save settings. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      className={styles.settings}
      aria-labelledby="connector-settings-title"
    >
      <button type="button" className={styles.back} onClick={onBack}>
        <ArrowLeft size={15} /> Back to chat
      </button>
      <h3 id="connector-settings-title">Connector settings</h3>
      <p className={styles.status}>
        <Check size={16} /> Connected to this computer
      </p>
      <p className={styles.description}>
        Your assistant runs in the background. Manage its access here and keep
        working in your project.
      </p>
      {!supported ? (
        <>
          <p>Update Project CAD Assistant to manage these settings here.</p>
          <button className={styles.primary} onClick={onUpdate}>
            Update assistant
          </button>
        </>
      ) : draft ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={saving}>
            <label htmlFor="connector-access">Connector access</label>
            <select
              id="connector-access"
              value={draft.accessMode}
              onChange={(event) => {
                setDraft({
                  ...draft,
                  accessMode: event.target
                    .value as ConnectorPreferences["accessMode"],
                });
                setMessage("");
              }}
            >
              <option value="yolo">Full device access (YOLO)</option>
              <option value="sandbox">Project folder and web (Sandbox)</option>
            </select>
            <p className={styles.hint}>
              {draft.accessMode === "sandbox"
                ? "Muse can use files in your CAD folder and search the web. Shell commands and other files are unavailable."
                : "Muse can use device tools, files, shell commands, and the web without tool approval prompts."}
            </p>
            <label htmlFor="connector-projects">CAD projects folder</label>
            <input
              id="connector-projects"
              value={draft.projectsDirectory}
              required
              maxLength={4096}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setDraft({ ...draft, projectsDirectory: event.target.value });
                setMessage("");
              }}
              aria-describedby="connector-folder-hint"
            />
            <p className={styles.hint} id="connector-folder-hint">
              Use the full folder path on this computer. This is the file access
              boundary in Sandbox mode.
            </p>
            <button
              className={styles.primary}
              type="submit"
              disabled={!dirty || !draft.projectsDirectory.trim()}
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
          </fieldset>
        </form>
      ) : !error ? (
        <p role="status">Loading connector settings…</p>
      ) : null}
      {error ? (
        <div role="alert" className={styles.error}>
          <p>{error}</p>
          {!draft ? (
            <button
              className={styles.back}
              onClick={() => {
                setError("");
                setAttempt((value) => value + 1);
              }}
            >
              <RefreshCw size={14} /> Try again
            </button>
          ) : null}
        </div>
      ) : null}
      <p className={styles.message} role="status">
        {message}
      </p>
    </section>
  );
}

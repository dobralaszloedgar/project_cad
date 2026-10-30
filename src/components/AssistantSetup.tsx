"use client";

import { useEffect, useState } from "react";
import { Download, MessageCircle } from "lucide-react";
import { assistantDownloads } from "@/assistant/downloads";
import styles from "./AssistantPanel.module.css";

export default function AssistantSetup({
  connect,
  connecting,
}: {
  connect: () => void;
  connecting: boolean;
}) {
  const [downloads, setDownloads] =
    useState<ReturnType<typeof assistantDownloads>>();
  const [selected, setSelected] = useState("");
  const download =
    downloads?.installers.find((file) => file.filename === selected) ||
    downloads?.installers[0];
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/downloads/assistant/downloads.json", {
      signal: abort.signal,
      cache: "no-cache",
    })
      .then(async (response) => {
        if (!response.ok) return;
        const available = assistantDownloads(await response.json());
        if (available && !abort.signal.aborted) {
          setDownloads(available);
          const system = /Windows/i.test(navigator.userAgent)
            ? "windows"
            : /Linux/i.test(navigator.userAgent)
              ? "linux"
              : "macos";
          setSelected(
            (
              available.installers.find((file) => file.platform === system) ||
              available.installers[0]
            ).filename,
          );
        }
      })
      .catch(() => {});
    return () => abort.abort();
  }, []);

  return (
    <div className={styles.connect}>
      <MessageCircle size={28} />
      <h2>Connect your assistant</h2>
      <p>
        Use Codex, Claude Code, or Muse with this project. Conversations stay on
        your laptop.
      </p>
      <ol className={styles.setupSteps}>
        <li>Install and open Project CAD Assistant.</li>
        <li>
          Sign in to Codex or Claude Code, or add your Muse key in Settings.
        </li>
        <li>Connect below and approve this website.</li>
      </ol>
      {download ? (
        <div className={styles.download}>
          {downloads && downloads.installers.length > 1 ? (
            <select
              aria-label="Assistant installer"
              value={download.filename}
              onChange={(event) => setSelected(event.target.value)}
            >
              {downloads.installers.map((file) => (
                <option key={file.filename} value={file.filename}>
                  {file.name} · {file.architecture}
                </option>
              ))}
            </select>
          ) : null}
          <a className="btn" href={download.url} download>
            <Download size={15} /> Download for {download.name}
          </a>
          <span>
            {download.architecture} · v{downloads?.version} ·{" "}
            {Math.ceil(download.bytes / 1_000_000)} MB
          </span>
          {downloads?.releaseUrl ? (
            <a
              href={downloads.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              All downloads and checksums
            </a>
          ) : null}
        </div>
      ) : (
        <p>Use your Project CAD Assistant installation to connect.</p>
      )}
      <button
        className="btn btn-primary"
        onClick={connect}
        disabled={connecting}
      >
        {connecting ? "Waiting for connection…" : "Connect local assistant"}
      </button>
      <details className={styles.development}>
        <summary>Run from source</summary>
        <p>In the Project CAD source folder, run:</p>
        <code>npm run assistant</code>
      </details>
    </div>
  );
}

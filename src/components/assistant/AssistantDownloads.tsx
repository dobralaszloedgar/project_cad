"use client";

import { useEffect, useState } from "react";
import { ArrowDownToLine, RefreshCw } from "lucide-react";
import { assistantDownloads } from "@/assistant/downloads";
import { detectAssistantPlatform } from "@/assistant/platform";
import styles from "../AssistantPanel.module.css";

export default function AssistantDownloads() {
  const [downloads, setDownloads] = useState<ReturnType<
    typeof assistantDownloads
  > | null>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/downloads/assistant/downloads.json", {
      cache: "no-cache",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Downloads unavailable");
        const available = assistantDownloads(await response.json());
        if (!available) throw new Error("Downloads unavailable");
        if (controller.signal.aborted) return;
        const platform = detectAssistantPlatform(navigator);
        setDownloads({
          ...available,
          installers: [...available.installers].sort(
            (a, b) =>
              Number(b.platform === platform) - Number(a.platform === platform),
          ),
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setDownloads(null);
      });
    return () => controller.abort();
  }, [attempt]);

  return (
    <>
      <h3>Download connector</h3>
      {downloads === undefined ? (
        <p role="status">Finding installers…</p>
      ) : downloads === null ? (
        <>
          <p role="alert">We couldn’t load the installers. Try again.</p>
          <button
            className={styles.option}
            onClick={() => {
              setDownloads(undefined);
              setAttempt((value) => value + 1);
            }}
          >
            <RefreshCw size={14} /> Retry downloads
          </button>
        </>
      ) : (
        <>
          <p>Project CAD Assistant · v{downloads.version}</p>
          {downloads.installers.map((file) => (
            <a
              key={file.filename}
              className={`${styles.option} ${styles.downloadOption}`}
              href={file.url}
              download
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>
                <strong>Download for {file.name}</strong>
                <small>
                  {file.architecture} · {Math.ceil(file.bytes / 1_000_000)} MB
                </small>
              </span>
              <ArrowDownToLine size={14} />
            </a>
          ))}
        </>
      )}
    </>
  );
}

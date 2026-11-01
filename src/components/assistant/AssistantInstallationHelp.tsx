"use client";

import { useId, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, ChevronRight, CircleHelp } from "lucide-react";
import type { AssistantDownload } from "@/assistant/downloads";
import styles from "./installation/InstallationGuide.module.css";

const InstallationGuide = dynamic(
  () => import("./installation/InstallationGuide"),
  {
    loading: () => (
      <p className={styles.loading} role="status">
        Loading installation guide…
      </p>
    ),
  },
);

export default function AssistantInstallationHelp({
  download,
  preview = false,
  initiallyOpen = false,
}: {
  download?: AssistantDownload;
  preview?: boolean;
  initiallyOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState(initiallyOpen);
  const regionId = useId();
  if (!preview && (!download || download.platform === "linux")) return null;

  return (
    <div className={styles.help}>
      <button
        type="button"
        className={styles.disclosure}
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded(!expanded)}
      >
        <CircleHelp size={18} />
        <span>Installer won’t open?</span>
        <span className={styles.guideLength}>Watch the steps</span>
        {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>
      <div id={regionId} hidden={!expanded}>
        {expanded ? (
          <InstallationGuide
            platform={
              download
                ? download.platform === "macos"
                  ? "mac"
                  : "windows"
                : undefined
            }
            architecture={
              download
                ? download.architecture === "ARM64"
                  ? "arm64"
                  : "x64"
                : undefined
            }
            previewControls={preview}
          />
        ) : null}
      </div>
    </div>
  );
}

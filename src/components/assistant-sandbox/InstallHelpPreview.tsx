"use client";

import { PackageOpen } from "lucide-react";
import AssistantInstallationHelp from "../assistant/AssistantInstallationHelp";
import styles from "./install-help-preview.module.css";

export default function InstallHelpPreview() {
  return (
    <section className={styles.preview} aria-label="Installer help preview">
      <header className={styles.introduction}>
        <PackageOpen size={27} strokeWidth={1.5} />
        <div>
          <h2>Open your downloaded installer</h2>
          <p>
            Follow the steps for your operating system, then return here to
            connect.
          </p>
        </div>
      </header>
      <AssistantInstallationHelp preview initiallyOpen />
      <p className={styles.previewNote}>
        Sandbox preview. The windows above are instructional recreations. No
        installation or security setting is changed here.
      </p>
    </section>
  );
}

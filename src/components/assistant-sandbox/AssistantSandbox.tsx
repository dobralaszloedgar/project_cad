"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, RotateCcw, Workflow } from "lucide-react";
import { useAssistant } from "@/assistant/client";
import type { Project } from "@/domain/schema";
import AssistantConnectionFlow from "../assistant/AssistantConnectionFlow";
import { useAssistantDiscovery } from "../assistant/useAssistantDiscovery";
import InstallHelpPreview from "./InstallHelpPreview";
import styles from "./assistant-sandbox.module.css";

type Scenario = "live" | "new" | "ready" | "install";
const scenarios: { id: Scenario; label: string }[] = [
  { id: "live", label: "This computer" },
  { id: "new", label: "New installation" },
  { id: "ready", label: "Assistant detected" },
  { id: "install", label: "Opening the installer" },
];
const sandboxProject: Project = {
  version: 1,
  name: "Assistant setup preview",
  units: [],
  edges: [],
};

function LiveConnection() {
  const assistant = useAssistant("assistant-setup-sandbox", sandboxProject);
  const discovery = useAssistantDiscovery(
    !assistant.connected && !assistant.connecting,
  );
  return (
    <AssistantConnectionFlow
      {...discovery}
      onCheck={discovery.checkAgain}
      connecting={assistant.connecting}
      connected={assistant.connected}
      error={assistant.error}
      onConnect={assistant.connect}
      onCancel={assistant.cancelConnect}
      onOpenApproval={assistant.openApproval}
      openingApproval={assistant.openingApproval}
    />
  );
}

function PreviewConnection({ initiallyReady }: { initiallyReady: boolean }) {
  const [ready, setReady] = useState(initiallyReady);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!checking) return;
    const timer = setTimeout(() => setChecking(false), 600);
    return () => clearTimeout(timer);
  }, [checking]);
  return (
    <>
      <AssistantConnectionFlow
        availability={ready ? "available" : "unavailable"}
        checking={checking}
        previouslyDetected={initiallyReady}
        connected={connected}
        connecting={connecting}
        preview
        onCheck={() => setChecking(true)}
        onConnect={() => setConnecting(true)}
        onCancel={() => setConnecting(false)}
      />
      <div className={styles.previewControls}>
        <p>
          <span /> Preview mode. Downloads and connections are simulated.
        </p>
        {!ready ? (
          <button onClick={() => setReady(true)}>
            Simulate app opened <ArrowRight size={14} />
          </button>
        ) : connecting ? (
          <button
            onClick={() => {
              setConnecting(false);
              setConnected(true);
            }}
          >
            Simulate approval <ArrowRight size={14} />
          </button>
        ) : connected ? (
          <span>Use Reset to try the flow again.</span>
        ) : (
          <span>Choose Connect assistant to continue.</span>
        )}
      </div>
    </>
  );
}

export default function AssistantSandbox({
  initialScenario = "live",
}: {
  initialScenario?: Scenario;
}) {
  const [scenario, setScenario] = useState<Scenario>(initialScenario);
  const [revision, setRevision] = useState(0);
  return (
    <main className={styles.sandbox}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <Workflow size={22} strokeWidth={1.6} /> Project CAD
        </Link>
        <span className={styles.headerDivider} />
        <span className={styles.breadcrumb}>Assistant sandbox</span>
        <span className={styles.previewTag}>Preview</span>
        <Link
          href="/workspace"
          className={styles.back}
          aria-label="Back to workspace"
        >
          <ArrowLeft size={14} />
          <span>Back to workspace</span>
        </Link>
      </header>
      <div
        className={`${styles.canvas} ${scenario === "install" ? styles.installCanvas : ""}`}
      >
        <div className={styles.sandboxHeading}>
          <div>
            {scenario !== "install" ? <p>ASSISTANT CONNECTION</p> : null}
            <h1>
              {scenario === "install"
                ? "A hand with the first launch."
                : "A little setup. Then you’re in."}
            </h1>
          </div>
          <span>Choose agents → Set up → Connect</span>
        </div>
        <div className={styles.toolbar}>
          <div
            className={styles.scenarios}
            role="group"
            aria-label="Connection scenario"
          >
            {scenarios.map((item) => (
              <button
                key={item.id}
                aria-pressed={scenario === item.id}
                onClick={() => {
                  setScenario(item.id);
                  setRevision((value) => value + 1);
                }}
              >
                {item.label}
                {item.id === "live" ? <i /> : null}
              </button>
            ))}
          </div>
          <button
            className={styles.reset}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
        {scenario === "live" ? (
          <LiveConnection key={`live-${revision}`} />
        ) : scenario === "install" ? (
          <InstallHelpPreview key={`install-${revision}`} />
        ) : (
          <PreviewConnection
            key={`${scenario}-${revision}`}
            initiallyReady={scenario === "ready"}
          />
        )}
        {scenario === "live" ? (
          <p className={styles.liveHint}>
            <span /> Live detection · Checks this computer for Project CAD
            Assistant.
          </p>
        ) : null}
      </div>
    </main>
  );
}

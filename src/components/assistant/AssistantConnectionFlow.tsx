"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  ExternalLink,
  LoaderCircle,
  Monitor,
  PackageOpen,
  Plug,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { assistantDownloads } from "@/assistant/downloads";
import {
  agentNames,
  type AgentSelection,
  type ProviderId,
} from "@/assistant/protocol";
import {
  rememberAgentSelection,
  savedAgentSelection,
} from "@/assistant/selection";
import type { AssistantAvailability } from "./useAssistantDiscovery";
import AssistantInstallationHelp from "./AssistantInstallationHelp";
import styles from "./AssistantConnectionFlow.module.css";

type Props = {
  availability: AssistantAvailability;
  checking: boolean;
  previouslyDetected?: boolean;
  connecting: boolean;
  connected: boolean;
  error?: string;
  preview?: boolean;
  embedded?: boolean;
  onCheck: () => void;
  onConnect: (agents: AgentSelection) => void;
  onCancel: () => void;
  initialAgents?: AgentSelection | null;
  manageAgents?: boolean;
  updating?: boolean;
  outdated?: boolean;
};

export default function AssistantConnectionFlow({
  availability,
  checking,
  previouslyDetected = false,
  connecting,
  connected,
  error,
  preview = false,
  embedded = false,
  onCheck,
  onConnect,
  onCancel,
  initialAgents,
  manageAgents = false,
  updating: requestedUpdate = false,
  outdated = false,
}: Props) {
  const updating = requestedUpdate || outdated;
  const [choosingAgents, setChoosingAgents] = useState(!updating);
  const [providers, setProviders] = useState<ProviderId[]>([]);
  const [preferred, setPreferred] = useState<ProviderId | "">("");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const saved = initialAgents ?? (preview ? null : savedAgentSelection());
      if (saved) {
        setProviders(saved.providers);
        setPreferred(saved.preferred);
        setChoosingAgents(manageAgents && !updating);
      }
      setHydrated(true);
    });
    return () => {
      active = false;
    };
    // Restore browser storage after hydration; drafts are owned by this flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const selection: AgentSelection | null =
    providers.length && preferred && providers.includes(preferred)
      ? { providers, preferred }
      : null;
  function toggleAgent(id: ProviderId) {
    const next = providers.includes(id)
      ? providers.filter((value) => value !== id)
      : [...providers, id];
    setProviders(next);
    if (!preferred || !next.includes(preferred)) setPreferred(next[0] ?? "");
  }
  const [downloads, setDownloads] =
    useState<ReturnType<typeof assistantDownloads>>();
  const [downloadResult, setDownloadResult] = useState<{
    attempt: number;
    error: boolean;
  }>();
  const [downloadStatus, setDownloadStatus] = useState<{
    url: string;
    available: boolean;
  }>();
  const [downloadAttempt, setDownloadAttempt] = useState(0);
  const checkingManifest = downloadResult?.attempt !== downloadAttempt;
  const downloadError = !checkingManifest && downloadResult?.error === true;
  const [selected, setSelected] = useState("");
  const [installing, setInstalling] = useState(false);
  const [showDownloads, setShowDownloads] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusWithin = useRef(false);
  const ready = availability === "available";
  const stage = !hydrated
    ? "checking"
    : choosingAgents
      ? "agents"
      : connected
        ? "connected"
        : connecting
          ? "approval"
          : updating
            ? installing
              ? "setup"
              : "download"
            : ready
              ? "connect"
              : availability === "checking"
                ? "checking"
                : installing || (previouslyDetected && !showDownloads)
                  ? "setup"
                  : "download";
  const step =
    stage === "agents"
      ? 0
      : stage === "setup" || stage === "download" || stage === "checking"
        ? 1
        : 2;
  const download =
    downloads?.installers.find((file) => file.filename === selected) ??
    downloads?.installers[0];
  const downloadUrl = download?.url;
  // The inline approval protocol requires desktop release 0.1.4 or newer.
  const version = downloads?.version.split(".").map(Number);
  const needsNewInstaller =
    !preview &&
    !!version &&
    version[0] === 0 &&
    (version[1] < 1 || (version[1] === 1 && version[2] < 4));
  // Blob supports cross-origin HEAD requests. GitHub release links do not.
  const verifyDownload =
    !preview &&
    !checkingManifest &&
    !downloadError &&
    !!downloadUrl &&
    !needsNewInstaller &&
    new URL(downloadUrl).hostname.endsWith(".public.blob.vercel-storage.com");
  const checkingDownload =
    verifyDownload && downloadStatus?.url !== downloadUrl;
  const checkingDownloads = checkingManifest || checkingDownload;
  const downloadUnavailable =
    verifyDownload &&
    downloadStatus?.url === downloadUrl &&
    !downloadStatus.available;

  useEffect(() => {
    if (stage !== "download" || !verifyDownload || !downloadUrl) return;
    const controller = new AbortController();
    void fetch(downloadUrl, {
      method: "HEAD",
      cache: "no-cache",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
    })
      .then((response) => {
        if (!controller.signal.aborted)
          setDownloadStatus({ url: downloadUrl, available: response.ok });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setDownloadStatus({ url: downloadUrl, available: false });
      });
    return () => controller.abort();
  }, [stage, verifyDownload, downloadUrl, downloadAttempt]);

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
        const platform = /Windows/i.test(navigator.userAgent)
          ? "windows"
          : /Linux/i.test(navigator.userAgent)
            ? "linux"
            : "macos";
        setDownloads(available);
        setSelected((current) =>
          available.installers.some((file) => file.filename === current)
            ? current
            : (
                available.installers.find(
                  (file) => file.platform === platform,
                ) ?? available.installers[0]
              ).filename,
        );
        setDownloadResult({ attempt: downloadAttempt, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setDownloadResult({ attempt: downloadAttempt, error: true });
      });
    return () => controller.abort();
  }, [downloadAttempt]);

  // Preserve keyboard position when a focused action disappears between steps.
  useEffect(() => {
    if (focusWithin.current) heading.current?.focus({ preventScroll: true });
  }, [stage]);

  const titles = {
    agents: "Choose your agents",
    checking: "Looking for your assistant",
    download: updating
      ? "Update Project CAD Assistant"
      : "Bring your AI into Project CAD",
    setup: "A quick setup on your computer",
    connect: "Your assistant is ready",
    approval: "Approve in Project CAD Assistant",
    connected: "You’re all connected",
  };
  const descriptions = {
    agents:
      "Select one or more agents to use with this project. You can change these later.",
    checking: "Checking for Project CAD Assistant on this computer…",
    download: updating
      ? "Install the latest assistant, reopen it, and reconnect here."
      : "Install Project CAD Assistant on this computer to connect your agents.",
    setup: "This page will detect the assistant when it’s running.",
    connect: "Connect, then approve this website in the assistant app.",
    approval:
      "In the assistant app, choose Approve connection. This page will continue automatically.",
    connected:
      "Your agent choices are synced with the app. Complete any agent sign-in there, then start a conversation here.",
  };

  function startSetup() {
    setShowDownloads(false);
    setInstalling(true);
  }
  function retryDownloads() {
    if (checkingDownloads) return;
    setDownloadStatus(undefined);
    setDownloadAttempt((value) => value + 1);
  }

  return (
    <section
      className={`${styles.panel}${embedded ? ` ${styles.embedded}` : ""}`}
      aria-label="Assistant connection"
    >
      {!embedded ? (
        <header className={styles.panelHeader}>
          <span>
            <Monitor size={17} strokeWidth={1.6} /> Assistant
          </span>
          <span
            className={styles.connectionStatus}
            data-ready={ready || connected || undefined}
          >
            <i />{" "}
            {connected
              ? "Connected"
              : ready
                ? "Assistant detected"
                : "Not connected"}
          </span>
        </header>
      ) : null}
      <div className={styles.panelBody}>
        <ol className={styles.steps} aria-label="Connection progress">
          {[
            "Agents",
            updating ? "Update" : "Set up",
            updating ? "Reconnect" : "Connect",
          ].map((label, index) => (
            <li
              key={label}
              aria-current={index === step && !connected ? "step" : undefined}
              data-complete={index < step || connected || undefined}
            >
              <span>
                {index < step || connected ? (
                  <Check size={13} strokeWidth={2.2} />
                ) : (
                  index + 1
                )}
              </span>
              {label}
            </li>
          ))}
        </ol>

        <div
          ref={content}
          className={styles.flowContent}
          data-stage={stage}
          onFocusCapture={() => {
            focusWithin.current = true;
          }}
          onBlurCapture={(event) => {
            if (
              event.relatedTarget &&
              !content.current?.contains(event.relatedTarget)
            )
              focusWithin.current = false;
          }}
        >
          <div
            className={styles.heroIcon}
            data-ready={ready || connected || undefined}
            aria-hidden="true"
          >
            {stage === "checking" ? (
              <LoaderCircle size={29} className={styles.spinner} />
            ) : stage === "connected" ? (
              <CircleCheck size={31} strokeWidth={1.5} />
            ) : stage === "setup" ? (
              <PackageOpen size={30} strokeWidth={1.5} />
            ) : stage === "connect" || stage === "approval" ? (
              <Plug size={30} strokeWidth={1.5} />
            ) : (
              <Monitor size={30} strokeWidth={1.5} />
            )}
          </div>

          <div className={styles.intro} aria-live="polite" aria-atomic="true">
            <h2 ref={heading} tabIndex={-1} data-assistant-setup-heading>
              {titles[stage]}
            </h2>
            <p>{descriptions[stage]}</p>
          </div>

          {stage === "agents" ? (
            <div className={styles.actions}>
              <div className={styles.agentSelection}>
                <fieldset
                  className={styles.agentChoices}
                  aria-label="Agents to connect"
                >
                  {(Object.keys(agentNames) as ProviderId[]).map((id) => (
                    <label
                      key={id}
                      className={styles.agentChoice}
                      data-selected={providers.includes(id) || undefined}
                    >
                      <input
                        type="checkbox"
                        aria-label={agentNames[id]}
                        checked={providers.includes(id)}
                        onChange={() => toggleAgent(id)}
                      />
                      <span>
                        <strong>{agentNames[id]}</strong>
                        <small>
                          {id === "codex"
                            ? "Use your ChatGPT or API sign-in."
                            : id === "claude"
                              ? "Use your Claude Code sign-in."
                              : "Use your Muse API key."}
                        </small>
                      </span>
                    </label>
                  ))}
                </fieldset>
                {providers.length > 1 ? (
                  <label className={styles.defaultAgent}>
                    Default agent
                    <select
                      aria-label="Default agent"
                      value={preferred}
                      onChange={(event) =>
                        setPreferred(event.target.value as ProviderId)
                      }
                    >
                      {providers.map((id) => (
                        <option key={id} value={id}>
                          {agentNames[id]}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <button
                className={styles.primary}
                data-connect-primary
                disabled={!selection}
                onClick={() => {
                  if (selection) {
                    if (!preview) rememberAgentSelection(selection);
                    setChoosingAgents(false);
                    if (ready && !updating) onConnect(selection);
                  }
                }}
              >
                {ready && !updating ? "Connect agents" : "Continue"}{" "}
                <ArrowRight size={16} />
              </button>
            </div>
          ) : null}
          {stage !== "agents" &&
          stage !== "checking" &&
          selection &&
          !connecting ? (
            <div className={styles.agentSummary}>
              <span>
                {providers.map((id) => agentNames[id]).join(", ")}
                {providers.length > 1 ? (
                  <small>Default: {agentNames[selection.preferred]}</small>
                ) : null}
              </span>
              {!updating ? (
                <button
                  className={styles.textButton}
                  onClick={() => setChoosingAgents(true)}
                >
                  Manage agents
                </button>
              ) : null}
            </div>
          ) : null}

          {stage === "download" ? (
            <div className={styles.actions} aria-busy={checkingDownloads}>
              {checkingDownloads ? (
                <div className={styles.notice} role="status">
                  <button
                    key="retry-downloads"
                    className={styles.secondary}
                    disabled
                  >
                    <LoaderCircle size={15} className={styles.spinner} />
                    {downloadAttempt > 0
                      ? "Checking downloads…"
                      : "Finding your download…"}
                  </button>
                </div>
              ) : downloadError ? (
                <div className={styles.notice} role="alert">
                  <p>
                    We couldn’t check for installers. Try again. Your agent
                    choices are saved.
                  </p>
                  <button
                    key="retry-downloads"
                    className={styles.secondary}
                    onClick={retryDownloads}
                  >
                    <RefreshCw size={15} /> Retry downloads
                  </button>
                </div>
              ) : needsNewInstaller ? (
                <div className={styles.notice} role="status">
                  <p>
                    {downloadAttempt > 0
                      ? "Checked again. The updated installer is still unavailable."
                      : "The updated installer is not available yet."}{" "}
                    This website needs version 0.1.4 or later; the available
                    download is version {downloads?.version}. Your agent choices
                    are saved.
                  </p>
                  <button
                    key="retry-downloads"
                    className={styles.secondary}
                    onClick={retryDownloads}
                  >
                    <RefreshCw size={15} /> Check for updates
                  </button>
                </div>
              ) : downloadUnavailable ? (
                <div className={styles.notice} role="alert">
                  <p>
                    Installer downloads are temporarily unavailable. Try again
                    shortly. Your agent choices are saved.
                  </p>
                  <button
                    key="retry-downloads"
                    className={styles.secondary}
                    onClick={retryDownloads}
                  >
                    <RefreshCw size={15} /> Retry downloads
                  </button>
                </div>
              ) : download ? (
                <>
                  <a
                    className={styles.primary}
                    data-connect-primary
                    href={download.url}
                    download
                    onClick={(event) => {
                      if (preview) event.preventDefault();
                      startSetup();
                    }}
                  >
                    <ArrowDownToLine size={17} /> Download for {download.name}
                  </a>
                  <p className={styles.fileInfo}>
                    {download.architecture} <span>·</span>{" "}
                    {preview ? (
                      "Simulated download"
                    ) : (
                      <>
                        {Math.ceil(download.bytes / 1_000_000)} MB{" "}
                        <span>·</span> v{downloads?.version}
                      </>
                    )}
                  </p>
                  <details className={styles.platforms}>
                    <summary>
                      Other platforms <ChevronDown size={13} />
                    </summary>
                    <label htmlFor="assistant-installer">
                      Choose your installer
                    </label>
                    <select
                      id="assistant-installer"
                      value={download.filename}
                      onChange={(event) => setSelected(event.target.value)}
                    >
                      {downloads?.installers.map((file) => (
                        <option key={file.filename} value={file.filename}>
                          {file.name} · {file.architecture}
                        </option>
                      ))}
                    </select>
                    {downloads?.releaseUrl || downloads?.checksumsUrl ? (
                      <a
                        href={downloads.releaseUrl ?? downloads.checksumsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {downloads.releaseUrl
                          ? "All downloads and checksums"
                          : "Download checksums"}{" "}
                        <ExternalLink size={12} />
                      </a>
                    ) : null}
                  </details>
                </>
              ) : (
                <button className={styles.primary} disabled>
                  <LoaderCircle size={16} className={styles.spinner} />
                  Finding your download…
                </button>
              )}
              <div className={styles.alreadyInstalled}>
                <span>Already have the app?</span>
                <button
                  className={styles.textButton}
                  onClick={() => {
                    startSetup();
                    onCheck();
                  }}
                >
                  Check for assistant <ArrowRight size={13} />
                </button>
              </div>
            </div>
          ) : null}

          {stage === "setup" ? (
            <div className={styles.setupContent}>
              <ol className={styles.instructions}>
                <li>
                  <PackageOpen size={18} />
                  <div>
                    <h3>Install the assistant</h3>
                    <p>
                      {download?.platform === "linux"
                        ? "Make the downloaded .run file executable, then run it in Terminal."
                        : download
                          ? `Open the downloaded ${download.platform === "windows" ? ".exe" : ".pkg"} file and follow the installer.`
                          : "Open your downloaded installer and follow the setup instructions."}
                    </p>
                  </div>
                </li>
                <li>
                  <Monitor size={18} />
                  <div>
                    <h3>Open Project CAD Assistant</h3>
                    <p>
                      {download?.platform === "macos"
                        ? "In Finder, choose Go → Home → Applications."
                        : download?.platform === "windows"
                          ? "You’ll find it in your Start menu."
                          : "Launch the assistant from its installed folder."}{" "}
                      Keep it running.
                    </p>
                  </div>
                </li>
                <li>
                  <SlidersHorizontal size={18} />
                  <div>
                    <h3>Return here to connect</h3>
                    <p>
                      Your agent choices will appear in the app after you
                      approve the connection. Complete any sign-in there if
                      needed.
                    </p>
                  </div>
                </li>
              </ol>
              {download ? (
                <AssistantInstallationHelp
                  key={download.filename}
                  download={download}
                />
              ) : null}
              {updating ? (
                <button
                  className={styles.primary}
                  disabled={!ready || !selection}
                  onClick={() => {
                    if (selection) onConnect(selection);
                  }}
                >
                  <Plug size={17} /> Reconnect assistant
                </button>
              ) : (
                <div className={styles.detection} role="status">
                  <span className={styles.searchDot} /> Looking for your
                  assistant…
                </div>
              )}
              <button
                className={styles.textButton}
                disabled={checking}
                onClick={onCheck}
              >
                <RefreshCw
                  size={13}
                  className={checking ? styles.spinner : undefined}
                />{" "}
                {checking ? "Checking…" : "Check again"}
              </button>
              <details className={styles.troubleshooting}>
                <summary>
                  Assistant not appearing? <ChevronDown size={13} />
                </summary>
                <p>
                  Make sure the app is running. If your browser asks for local
                  network access, allow it, then check again. In the assistant’s
                  settings, make sure the Project CAD website matches this
                  website’s address.
                </p>
                <button
                  className={styles.textButton}
                  onClick={() => {
                    setInstalling(false);
                    setShowDownloads(true);
                  }}
                >
                  Back to downloads
                </button>
                {download ? (
                  <a
                    href={download.url}
                    download
                    onClick={(event) => {
                      if (preview) event.preventDefault();
                    }}
                  >
                    Download installer again <ExternalLink size={12} />
                  </a>
                ) : null}
                <details className={styles.development}>
                  <summary>Run from source</summary>
                  <p>In the Project CAD source folder, run:</p>
                  <code>npm run assistant</code>
                </details>
              </details>
            </div>
          ) : null}

          {stage === "connect" ? (
            <div className={styles.actions}>
              <div className={styles.detectedApp}>
                <div>
                  <Monitor size={20} />
                </div>
                <span>
                  <strong>Running on this computer</strong>
                </span>
                <CircleCheck size={18} />
              </div>
              <button
                className={styles.primary}
                disabled={!selection}
                onClick={() => {
                  if (selection) {
                    if (!preview) rememberAgentSelection(selection);
                    onConnect(selection);
                  }
                }}
                data-connect-primary
              >
                <Plug size={17} /> Connect assistant <ArrowRight size={16} />
              </button>
            </div>
          ) : null}

          {stage === "approval" ? (
            <div className={styles.actions}>
              <div className={styles.approvalStatus} role="status">
                <LoaderCircle size={16} className={styles.spinner} /> Waiting
                for your approval
              </div>
              <button className={styles.textButton} onClick={onCancel}>
                Cancel connection
              </button>
            </div>
          ) : null}

          {stage === "connected" ? (
            <div className={styles.actions}>
              {preview ? (
                <p className={styles.successNote}>
                  <CircleCheck size={17} /> Connection preview complete
                </p>
              ) : (
                <Link className={styles.primary} href="/workspace">
                  Go to workspace <ArrowRight size={16} />
                </Link>
              )}
            </div>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

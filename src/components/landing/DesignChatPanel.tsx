"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  Folder,
  MessageCircle,
  Mic,
  Paperclip,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import type { Conversation } from "@/assistant/protocol";
import AssistantPopover from "@/components/assistant/AssistantPopover";
import AssistantTranscript from "@/components/assistant/AssistantTranscript";
import styles from "@/components/AssistantPanel.module.css";
import { makeLandingProject } from "./landing-construction";
import demo from "./DesignChat.module.css";

const prompt = "Build a process with reaction, separation, and recycle.";
const calls = [
  ["get_project", 0.7, 0.78],
  ["get_capabilities", 0.79, 0.88],
  ["propose_actions", 0.89, 1],
] as const;
const applied: string[] = [];
const noApply = async () => "";
const noDecision = async () => {};
const noError = () => {};

export default function DesignChatPanel({
  time,
  reduced,
  onReplay,
  onSend,
  onBuild,
}: {
  time: number;
  reduced: boolean;
  onReplay: () => void;
  onSend: () => void;
  onBuild: () => void;
}) {
  const project = useMemo(() => makeLandingProject(), []);
  const [provider, setProvider] = useState("Codex");
  const log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const sent = time >= 0.64;
  const complete = time >= 1;
  const typed = prompt.slice(
    0,
    Math.floor(Math.max(0, Math.min(1, (time - 0.32) / 0.27)) * prompt.length),
  );
  const chat: Conversation = {
    id: "landing-demo",
    projectId: "landing-demo",
    title: "Reaction & recycle",
    provider: "codex",
    model: "demo",
    mode: "review",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    runs: sent
      ? [
          {
            id: "example",
            requestId: "example",
            prompt,
            text: complete
              ? "The plan is ready. Review the process, then watch it take shape."
              : "",
            status: complete ? "completed" : "running",
            createdAt: "2026-01-01T00:00:00Z",
            activities: calls
              .filter(([, start]) => time >= start)
              .map(([name, , end]) => ({
                id: name,
                name,
                status: time >= end ? "done" : "running",
              })),
            proposals: [],
          },
        ]
      : [],
  };
  const activityCount = chat.runs[0]?.activities.length ?? 0;
  useLayoutEffect(() => {
    if (log.current && follow.current)
      log.current.scrollTop = log.current.scrollHeight;
  }, [sent, complete, activityCount]);
  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <h2 id="landing-assistant-title">Assistant</h2>
        <AssistantPopover
          label="About this assistant demo"
          trigger={
            <span className={styles.connectionPill}>
              <i />
              Project CAD
            </span>
          }
        >
          {() => (
            <>
              <h3>Interactive demo</h3>
              <p>
                Watch an example conversation. Open your workspace to connect
                your own assistant.
              </p>
            </>
          )}
        </AssistantPopover>
        <button
          className={styles.newChat}
          aria-label="Replay chat demo"
          title="Replay demo"
          disabled={reduced}
          onClick={onReplay}
        >
          <RotateCcw size={16} />
        </button>
      </header>
      <nav className={styles.navigation} aria-label="Demo conversation">
        <div className={styles.tabs}>
          <div className={styles.tab} data-active>
            <button
              type="button"
              onClick={onReplay}
              disabled={reduced}
              aria-label="Replay example conversation"
            >
              <span>Reaction &amp; recycle</span>
            </button>
          </div>
        </div>
        <span className={demo.demoLabel}>Demo</span>
      </nav>
      <div
        ref={log}
        className={styles.conversation}
        role="log"
        aria-label="Assistant conversation"
        aria-live="off"
        onScroll={(event) => {
          const element = event.currentTarget;
          follow.current =
            element.scrollHeight - element.clientHeight - element.scrollTop <
            48;
        }}
      >
        {sent ? (
          <AssistantTranscript
            chat={chat}
            project={project}
            appliedProposalIds={applied}
            onApply={noApply}
            decide={noDecision}
            onError={noError}
          />
        ) : (
          <div className={styles.welcome}>
            <span>
              <MessageCircle size={21} strokeWidth={1.6} />
            </span>
            <h3>How can I help you today?</h3>
          </div>
        )}
        {complete ? (
          <div
            className={styles.proposal}
            role="region"
            aria-label="Review example process"
          >
            <h3>Proposed changes</h3>
            <p>Reaction, separation, and recycle. 9 units · 9 streams.</p>
            <button className={demo.build} onClick={onBuild}>
              Build this flowsheet <ArrowRight size={15} />
            </button>
          </div>
        ) : null}
      </div>
      <div className={styles.composerArea}>
        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault();
            onSend();
          }}
        >
          <div className={styles.composerField}>
            <button
              type="button"
              className={styles.iconButton}
              disabled
              aria-label="Add files (available in workspace)"
            >
              <Paperclip size={17} />
            </button>
            <textarea
              aria-label="Example prompt"
              placeholder="Message Assistant…"
              rows={1}
              value={sent ? "" : typed}
              readOnly
            />
            <button
              type="button"
              className={styles.iconButton}
              disabled
              aria-label="Dictation (available in workspace)"
            >
              <Mic size={17} />
            </button>
          </div>
          <button
            className={styles.send}
            type="submit"
            disabled={sent}
            aria-label="Send example prompt"
          >
            <ArrowUp size={19} />
          </button>
        </form>
        <div className={styles.composerControls}>
          <AssistantPopover
            label="Choose demo provider"
            compact
            trigger={
              <>
                <MessageCircle size={13} />
                <span>{provider}</span>
                <span className={styles.divider}>/</span>
                <span className={styles.modelName}>Demo</span>
                <ChevronDown size={12} />
              </>
            }
          >
            {(close) => (
              <>
                <h3>Assistant provider</h3>
                {["Codex", "Claude Code", "Muse"].map((name) => (
                  <button
                    className={styles.option}
                    key={name}
                    aria-pressed={provider === name}
                    onClick={() => {
                      setProvider(name);
                      close();
                    }}
                  >
                    {name}
                    {provider === name ? <Check size={13} /> : null}
                  </button>
                ))}
                <p>Connect your own provider in the workspace.</p>
              </>
            )}
          </AssistantPopover>
          <div className={styles.composerRight}>
            <AssistantPopover
              label="Project context"
              align="right"
              trigger={
                <>
                  <Folder size={13} />
                  <span className={styles.contextName}>Example project</span>
                </>
              }
            >
              {() => (
                <>
                  <h3>Reaction, separation &amp; recycle</h3>
                  <p>
                    9 equipment units, 9 streams, and a live 3D process preview.
                  </p>
                </>
              )}
            </AssistantPopover>
            <AssistantPopover
              label="Assistant access"
              align="right"
              trigger={<ShieldCheck size={14} />}
            >
              {() => (
                <>
                  <h3>Review changes</h3>
                  <p>
                    You review proposed changes before applying them to your
                    project.
                  </p>
                </>
              )}
            </AssistantPopover>
          </div>
        </div>
      </div>
    </div>
  );
}

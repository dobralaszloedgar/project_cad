"use client";
import { useEffect, useState, type HTMLAttributes } from "react";
import {
  ArrowUp,
  MessageCircle,
  Minus,
  Plus,
  Square,
  RefreshCw,
  Check,
  LoaderCircle,
} from "lucide-react";
import type { Project } from "@/domain/schema";
import type { Proposal, ProviderId, AssistantMode } from "@/assistant/protocol";
import { projectRevision } from "@/assistant/tools";
import { useAssistant } from "@/assistant/client";
import AssistantSetup from "./AssistantSetup";
import styles from "./AssistantPanel.module.css";

export default function AssistantPanel({
  projectId,
  project,
  folderName,
  appliedProposalIds,
  onApply,
  onError,
  onClose,
  dragProps,
}: {
  projectId: string;
  project: Project;
  folderName: string | null;
  appliedProposalIds: string[];
  onApply: (proposal: Proposal) => Promise<string>;
  onError: (message: string) => void;
  onClose: () => void;
  dragProps: HTMLAttributes<HTMLElement>;
}) {
  const assistant = useAssistant(projectId, project);
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState<ProviderId>("codex");
  const [chosenModel, setModel] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [mode, setMode] = useState<AssistantMode>("review");
  const [revision, setRevision] = useState("");
  const [applying, setApplying] = useState<string | null>(null);
  const [applyError, setApplyError] = useState("");
  const [newChat, setNewChat] = useState(false);
  const chat = newChat ? undefined : assistant.conversation;
  const status = assistant.providers.find(
    (item) => item.id === (chat?.provider || provider),
  );
  const model =
    chat?.model ||
    (status?.models.some((item) => item.id === chosenModel)
      ? chosenModel
      : status?.models.find((item) => item.default)?.id ||
        status?.models[0]?.id ||
        "");
  const efforts =
    status?.models.find((item) => item.id === model)?.reasoning || [];
  const busy =
    assistant.sending || !!chat?.runs.some((run) => run.status === "running");
  useEffect(() => {
    let alive = true;
    void projectRevision(project).then((value) => {
      if (alive) setRevision(value);
    });
    return () => {
      alive = false;
    };
  }, [project]);
  async function send() {
    if (!prompt.trim() || busy || !status?.available) return;
    const value = prompt.trim();
    if (newChat) {
      assistant.select();
      setNewChat(false);
    }
    if (
      await assistant.send(value, {
        provider,
        model,
        mode,
        reasoning: efforts.includes(reasoning) ? reasoning : undefined,
      })
    )
      setPrompt("");
  }
  async function apply(proposal: Proposal) {
    setApplying(proposal.id);
    setApplyError("");
    try {
      const result = await onApply(proposal);
      await assistant.decide(proposal, "applied", result);
    } catch (failure) {
      const message =
        failure instanceof Error
          ? failure.message
          : "Could not apply this proposal.";
      setApplyError(message);
      onError(message);
    } finally {
      setApplying(null);
    }
  }
  return (
    <section
      className={`assistant ${styles.panel}`}
      aria-label="Project CAD assistant"
    >
      <header
        className="chat-header"
        {...dragProps}
        tabIndex={0}
        aria-label="Move assistant window"
        title="Drag to move · Shift + arrow keys to nudge"
      >
        <span>Assistant</span>
        <span className="chat-provider">
          <i className={assistant.connected ? "connected" : ""} />
          {chat ? status?.name || chat.provider : "Project CAD"}
        </span>
        <button
          className="icon-button"
          aria-label="Close assistant panel"
          title="Minimize assistant"
          onClick={onClose}
        >
          <Minus size={17} />
        </button>
      </header>
      <div className={styles.project}>
        {project.name}
        <span>
          {folderName ? `Folder: ${folderName}` : "Saved on this device"}
        </span>
      </div>
      {assistant.connected ? (
        <div className={styles.history}>
          <select
            aria-label="Conversation history"
            disabled={!!applying || busy}
            value={chat?.id || ""}
            onChange={(event) => {
              assistant.select(event.target.value || undefined);
              setNewChat(!event.target.value);
              setApplyError("");
            }}
          >
            <option value="">New conversation</option>
            {assistant.conversations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          <button
            className="icon-button"
            aria-label="New conversation"
            title="New conversation"
            disabled={busy || !!applying}
            onClick={() => {
              setNewChat(true);
              setApplyError("");
            }}
          >
            <Plus size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Refresh providers"
            title="Refresh providers"
            onClick={() => void assistant.refreshProviders()}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      ) : null}
      <div className="chat-content">
        {!assistant.connected ? (
          <AssistantSetup
            connect={assistant.connect}
            connecting={assistant.connecting}
          />
        ) : !chat?.runs.length ? (
          <div className="chat-welcome">
            <span>
              <MessageCircle size={22} />
            </span>
            <h2>What would you like to build?</h2>
            <p className={styles.intro}>
              Ask about the process, run a calculation, or prepare changes for
              review.
            </p>
          </div>
        ) : (
          <div className="chat-transcript">
            {chat.runs.map((run) => (
              <article className={styles.turn} key={run.id}>
                <div className="chat-user-message">{run.prompt}</div>
                {run.text ? (
                  <p className={`chat-response ${styles.response}`}>
                    {run.text}
                  </p>
                ) : null}
                {run.activities.length ? (
                  <details className={styles.activities}>
                    <summary>
                      {run.activities.length} project tool{" "}
                      {run.activities.length === 1 ? "call" : "calls"}
                    </summary>
                    <ul>
                      {run.activities.map((step) => (
                        <li key={step.id}>
                          {step.status === "done" ? (
                            <Check size={12} />
                          ) : step.status === "running" ? (
                            <LoaderCircle size={12} />
                          ) : (
                            "!"
                          )}{" "}
                          {step.name.replaceAll("_", " ")} · {step.status}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {run.status === "running" ? (
                  <p className="chat-working" role="status">
                    Working with the current project…
                  </p>
                ) : null}
                {run.error ? <p className={styles.error}>{run.error}</p> : null}
                {run.proposals.map((proposal) => (
                  <div
                    className="proposal"
                    role="region"
                    aria-label="Review proposed changes"
                    key={proposal.id}
                  >
                    <h3>
                      {proposal.status === "pending"
                        ? "Proposed changes"
                        : proposal.status === "applied"
                          ? "Changes applied"
                          : "Proposal dismissed"}
                    </h3>
                    <p>{proposal.plan.summary}</p>
                    <ol>
                      {proposal.plan.actions.map((action, i) => (
                        <li key={i}>
                          <strong>{action.type.replaceAll("_", " ")}</strong>
                          {"unit" in action
                            ? ` · ${action.unit.id} (${action.unit.kind})`
                            : "edge" in action
                              ? ` · ${action.edge.source} → ${action.edge.target}`
                              : "id" in action
                                ? ` · ${action.id}`
                                : ` · ${action.modelId}`}{" "}
                          {"params" in action ? (
                            <span className={styles.params}>
                              {Object.entries(action.params)
                                .map(([key, value]) => `${key}: ${value}`)
                                .join(", ")}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                    <details className={styles.details}>
                      <summary>Full change details</summary>
                      <pre>
                        {JSON.stringify(proposal.plan.actions, null, 2)}
                      </pre>
                    </details>
                    {proposal.status === "pending" ? (
                      <>
                        <div className={styles.actions}>
                          <button
                            className="btn btn-primary"
                            disabled={
                              !!applying ||
                              !proposal.plan.actions.length ||
                              (proposal.baseRevision !== revision &&
                                !appliedProposalIds.includes(proposal.id))
                            }
                            onClick={() => void apply(proposal)}
                          >
                            {applying === proposal.id
                              ? "Applying…"
                              : appliedProposalIds.includes(proposal.id)
                                ? "Confirm applied changes"
                                : "Apply reviewed actions"}
                          </button>
                          <button
                            className="btn"
                            disabled={!!applying}
                            onClick={() =>
                              void assistant
                                .decide(
                                  proposal,
                                  "dismissed",
                                  "Dismissed by you.",
                                )
                                .catch(() => {})
                            }
                          >
                            Dismiss
                          </button>
                        </div>
                        {proposal.baseRevision !== revision &&
                        !appliedProposalIds.includes(proposal.id) ? (
                          <p>The project changed. Ask for a fresh proposal.</p>
                        ) : null}
                      </>
                    ) : (
                      <p>{proposal.result}</p>
                    )}
                  </div>
                ))}
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="chat-bottom">
        {assistant.error || applyError ? (
          <p role="alert" className={styles.error}>
            {applyError || assistant.error}
          </p>
        ) : null}
        <form
          className="chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            aria-label="Process prompt"
            placeholder="Message Assistant…"
            rows={2}
            maxLength={12000}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void send();
              }
            }}
          />
          {busy ? (
            <button
              className="chat-send"
              type="button"
              aria-label="Stop response"
              onClick={() => void assistant.stop()}
            >
              <Square size={15} />
            </button>
          ) : (
            <button
              className="chat-send"
              type="submit"
              aria-label="Send message"
              disabled={
                !assistant.connected ||
                !status?.available ||
                !model ||
                !prompt.trim()
              }
            >
              <ArrowUp size={19} />
            </button>
          )}
        </form>
        <p className="chat-hint">
          {chat?.mode === "read-only" || (!chat && mode === "read-only")
            ? "Read only · project tools cannot propose edits"
            : "Changes are reviewed before applying"}
        </p>
        <div className={styles.settings}>
          <label>
            Provider
            <select
              aria-label="Assistant provider"
              disabled={!!chat || busy}
              value={chat?.provider || provider}
              onChange={(event) => {
                setProvider(event.target.value as ProviderId);
                setModel("");
                setReasoning("");
              }}
            >
              <option value="codex">Codex</option>
              <option value="claude">Claude Code</option>
              <option value="muse">Muse</option>
            </select>
          </label>
          <label>
            Model
            <select
              aria-label="Assistant model"
              disabled={!!chat || busy || !status?.models.length}
              value={model}
              onChange={(event) => {
                setModel(event.target.value);
                setReasoning("");
              }}
            >
              {!status?.models.length ? (
                <option value="">Connect to load models</option>
              ) : (
                status.models.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <label>
            Access
            <select
              aria-label="Assistant access"
              disabled={!!chat || busy}
              value={chat?.mode || mode}
              onChange={(event) => setMode(event.target.value as AssistantMode)}
            >
              <option value="review">Review changes</option>
              <option value="read-only">Read only</option>
            </select>
          </label>
          {efforts.length ? (
            <label>
              Reasoning
              <select
                aria-label="Reasoning level"
                disabled={!!chat || busy}
                value={chat?.reasoning || reasoning}
                onChange={(event) => setReasoning(event.target.value)}
              >
                <option value="">Default</option>
                {efforts.map((effort) => (
                  <option key={effort} value={effort}>
                    {effort}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {assistant.connected && status && !status.available ? (
          <p className="chat-hint">{status.message}</p>
        ) : null}
      </div>
    </section>
  );
}

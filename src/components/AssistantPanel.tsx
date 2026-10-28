"use client";
import { useEffect, useState, type HTMLAttributes } from "react";
import { ArrowUp, ChevronDown, MessageCircle, Minus, X } from "lucide-react";
import { type Project } from "@/domain/schema";
import { type Plan, planSchema } from "@/domain/actions";
export default function AssistantPanel({
  project,
  onApply,
  onError,
  onClose,
  dragProps,
}: {
  project: Project;
  onApply: (plan: Plan, base: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
  dragProps: HTMLAttributes<HTMLElement>;
}) {
  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState("muse-spark-1.3");
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [response, setResponse] = useState("");
  const [proposal, setProposal] = useState<{ plan: Plan; base: string } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    fetch("/api/ai")
      .then((r) => r.json())
      .then((status) => {
        if (active) {
          setEnabled(status.enabled === true);
          if (status.model) setModel(status.model);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  async function generate() {
    if (!enabled || busy || !prompt.trim()) return;
    const input = prompt.trim(),
      base = JSON.stringify(project);
    setBusy(true);
    setProposal(null);
    setSubmitted(input);
    setResponse("");
    setPrompt("");
    try {
      const r = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: input, project }),
      });
      const value = await r.json();
      if (!r.ok) throw new Error(value.error ?? "Meta request failed.");
      const plan = planSchema.parse(value.plan);
      setProposal({ plan, base });
      setModel(value.model);
      setResponse(plan.summary);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not generate a plan.";
      setResponse(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="assistant" aria-label="Meta assistant">
      <header
        className="chat-header"
        {...dragProps}
        tabIndex={0}
        aria-label="Move assistant window"
        title="Drag to move · Shift + arrow keys to nudge"
      >
        <span>Assistant</span>
        <span className="chat-provider">
          <i className={enabled ? "connected" : ""} />
          Meta
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
      <div className="chat-content" aria-live="polite">
        {!submitted ? (
          <div className="chat-welcome">
            <span>
              <MessageCircle size={22} />
            </span>
            <h2>How can I help you today?</h2>
          </div>
        ) : (
          <div className="chat-transcript">
            <div className="chat-user-message">{submitted}</div>
            {busy ? (
              <p className="chat-working">Preparing a proposal…</p>
            ) : (
              <p className="chat-response">{response}</p>
            )}
            {proposal ? (
              <div
                className="proposal"
                role="dialog"
                aria-label="Review Meta proposal"
              >
                <button
                  className="icon-button close-proposal"
                  aria-label="Dismiss proposal"
                  onClick={() => setProposal(null)}
                >
                  <X size={15} />
                </button>
                <h3>Proposed actions</h3>
                <ol>
                  {proposal.plan.actions.map((action, index) => (
                    <li key={index}>
                      {action.type} ·{" "}
                      {"unit" in action
                        ? action.unit.id
                        : "edge" in action
                          ? `${action.edge.source} → ${action.edge.target}`
                          : action.id}
                    </li>
                  ))}
                </ol>
                <button
                  className="btn btn-primary"
                  disabled={
                    !proposal.plan.actions.length ||
                    proposal.base !== JSON.stringify(project)
                  }
                  onClick={() => {
                    onApply(proposal.plan, proposal.base);
                    setProposal(null);
                  }}
                >
                  Apply reviewed actions
                </button>
                {proposal.base !== JSON.stringify(project) ? (
                  <p>Project changed. Generate a new proposal.</p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
      <div className="chat-bottom">
        <form
          className="chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void generate();
          }}
        >
          <textarea
            aria-label="Process prompt"
            placeholder="Message Assistant…"
            rows={1}
            maxLength={3000}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void generate();
              }
            }}
          />
          <button
            className="chat-send"
            type="submit"
            aria-label="Generate actions"
            title="Send message"
            disabled={!enabled || busy || !prompt.trim()}
          >
            <ArrowUp size={19} />
          </button>
        </form>
        <p className="chat-hint">
          {enabled
            ? "Enter to send · Shift+Enter for a new line"
            : "Meta is not configured. Templates and calculations are available."}
        </p>
        <div className="chat-model-row">
          <MessageCircle size={13} />
          <span>Meta</span>
          <span className="chat-slash">/</span>
          <details className="chat-model">
            <summary>
              {model}
              <ChevronDown size={12} />
            </summary>
            <div>
              Meta Model API · {enabled ? "Connected" : "Not configured"}.
              Actions are reviewed before they change the process.
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}

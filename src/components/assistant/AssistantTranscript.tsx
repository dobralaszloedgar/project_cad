"use client";
import { useEffect, useState } from "react";
import { Check, FileText, LoaderCircle } from "lucide-react";
import type { Conversation, Proposal } from "@/assistant/protocol";
import type { Project } from "@/domain/schema";
import { projectRevision } from "@/assistant/tools";
import { fileSize } from "@/assistant/attachments";
import AssistantMarkdown from "./AssistantMarkdown";
import AssistantError from "./AssistantError";
import styles from "../AssistantPanel.module.css";
export default function AssistantTranscript({
  chat,
  project,
  appliedProposalIds,
  onApply,
  onError,
  onUpdate,
  decide,
}: {
  chat: Conversation;
  project: Project;
  appliedProposalIds: string[];
  onApply: (proposal: Proposal) => Promise<string>;
  onError: (message: string) => void;
  onUpdate?: () => void;
  decide: (
    proposal: Proposal,
    status: "applied" | "dismissed",
    result: string,
  ) => Promise<void>;
}) {
  const [revision, setRevision] = useState("");
  const [applying, setApplying] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void projectRevision(project).then((value) => {
      if (alive) setRevision(value);
    });
    return () => {
      alive = false;
    };
  }, [project]);
  async function apply(proposal: Proposal) {
    setApplying(proposal.id);
    try {
      const result = await onApply(proposal);
      await decide(proposal, "applied", result);
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Could not apply this proposal.",
      );
    } finally {
      setApplying(null);
    }
  }
  return (
    <div className={styles.transcript}>
      {chat.runs.map((run) => (
        <article className={styles.turn} key={run.id}>
          <div className={`chat-user-message ${styles.userMessage}`}>
            <p>{run.prompt}</p>
            {run.attachments?.length ? (
              <div className={styles.fileList}>
                {run.attachments.map((file) => (
                  <span key={file.id} className={styles.fileChip}>
                    <FileText size={14} />
                    <span>
                      {file.name}
                      <small>{fileSize(file.size)}</small>
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {run.text ? <AssistantMarkdown text={run.text} /> : null}
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
            <p className={styles.working} role="status">
              Working with the current project…
            </p>
          ) : null}
          {run.error ? (
            <AssistantError message={run.error} onUpdate={onUpdate} />
          ) : null}
          {run.proposals.map((proposal) => (
            <div
              className={styles.proposal}
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
                <pre>{JSON.stringify(proposal.plan.actions, null, 2)}</pre>
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
                        void decide(
                          proposal,
                          "dismissed",
                          "Dismissed by you.",
                        ).catch(() => {})
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
  );
}

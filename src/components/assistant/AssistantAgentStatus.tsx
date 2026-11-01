"use client";
import { LoaderCircle, RefreshCw } from "lucide-react";
import {
  agentNames,
  type ProviderId,
  type ProviderStatus,
} from "@/assistant/protocol";
import styles from "../AssistantPanel.module.css";

export default function AssistantAgentStatus({
  id,
  provider,
  selected,
  checking,
  onCheck,
  onManage,
}: {
  id: ProviderId;
  provider?: ProviderStatus;
  selected: boolean;
  checking: boolean;
  onCheck: () => void;
  onManage: () => void;
}) {
  if (selected && provider?.available && provider.models.length) return null;
  const name = agentNames[id];
  return (
    <section
      className={styles.agentStatus}
      aria-label="Agent setup"
      aria-live="polite"
    >
      <strong>
        {!selected
          ? `${name} isn’t selected`
          : !provider && checking
            ? `Checking ${name}`
            : provider?.available
              ? `No models available for ${name}`
              : `Finish setting up ${name}`}
      </strong>
      <p>
        {!selected
          ? "Enable this agent in Manage agents to continue this conversation, or start a new conversation with your current selection."
          : !provider && checking
            ? "Checking your agent’s sign-in and available models…"
            : provider?.available
              ? "Refresh to load the models available to your account."
              : `Open Project CAD Assistant and ${id === "muse" ? "add your Muse API key in Settings" : `finish ${name} sign-in`}. Your agent choice is already saved. We’ll check again when you return.`}
      </p>
      {!selected ? (
        <button className={styles.textButton} onClick={onManage}>
          Manage agents
        </button>
      ) : (
        <button
          className={styles.textButton}
          onClick={onCheck}
          disabled={checking}
        >
          {checking ? (
            <LoaderCircle size={14} className={styles.spinner} />
          ) : (
            <RefreshCw size={14} />
          )}
          {checking ? "Checking…" : "Check again"}
        </button>
      )}
      {provider?.message && !provider.available ? (
        <details>
          <summary>Connection details</summary>
          <p>{provider.message}</p>
        </details>
      ) : null}
    </section>
  );
}

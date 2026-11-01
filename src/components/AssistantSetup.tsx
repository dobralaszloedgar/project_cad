"use client";

import { ArrowLeft } from "lucide-react";
import type { AssistantClient } from "@/assistant/client";
import AssistantConnectionFlow from "./assistant/AssistantConnectionFlow";
import { useAssistantDiscovery } from "./assistant/useAssistantDiscovery";
import styles from "./AssistantPanel.module.css";

export default function AssistantSetup({
  assistant,
  open,
  onBack,
  updating = false,
}: {
  assistant: AssistantClient;
  open: boolean;
  onBack: () => void;
  updating?: boolean;
}) {
  const discovery = useAssistantDiscovery(open && !assistant.connecting);
  return (
    <>
      {assistant.connected ? (
        <button className={styles.textButton} onClick={onBack}>
          <ArrowLeft size={14} /> Back to chat
        </button>
      ) : null}
      <AssistantConnectionFlow
        {...discovery}
        embedded
        initialAgents={assistant.agents}
        manageAgents={
          assistant.connected && !updating && !assistant.updateRequired
        }
        updating={updating || assistant.updateRequired}
        connecting={assistant.connecting}
        connected={false}
        error={assistant.error}
        onCheck={discovery.checkAgain}
        onConnect={(agents) => {
          assistant.connect(agents, onBack);
        }}
        onCancel={assistant.cancelConnect}
      />
    </>
  );
}

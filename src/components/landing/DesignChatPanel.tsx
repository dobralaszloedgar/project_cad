// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import AssistantPanel from "../AssistantPanel";
import AssistantMorphPreview from "../assistant/AssistantMorphPreview";
import type { AssistantClient } from "@/assistant/client";
import type { Conversation, Proposal } from "@/assistant/protocol";
import assistantStyles from "../AssistantPanel.module.css";
import { landingExample } from "./landing-example";
import { chatEase, chatTimeline, CHAT_PROPOSAL } from "./landing-chat-timeline";

const prompt = "Build a process with reaction, separation, and recycle.";
const id = "landing-example";
const noop = () => {};
const idle = async () => {};
const unavailable = (): never => {
  throw new Error("The example has no live connector");
};
const date = "2026-11-03T00:00:00.000Z";

/** The real assistant UI, supplied only with deterministic local example data. */
export default function DesignChatPanel({ time }: { time: number }) {
  const host = useRef<HTMLDivElement>(null);
  const { sent, proposed, applied, response } = chatTimeline(time);
  const typed = sent
    ? ""
    : prompt.slice(
        0,
        Math.floor(
          Math.max(0, Math.min(1, (time - 0.3) / 0.21)) * prompt.length,
        ),
      );
  const assistant = useMemo<AssistantClient>(() => {
    const proposal: Proposal = {
      id: "landing-plan",
      projectId: id,
      baseRevision: landingExample.baseRevision,
      plan: {
        summary:
          "Add 9 equipment units and connect 9 material streams, including the recycle loop.",
        actions: [
          ...landingExample.project.units.map((unit) => ({
            type: "add" as const,
            unit,
          })),
          ...landingExample.project.edges.map((edge) => ({
            type: "connect" as const,
            edge,
          })),
        ],
      },
      status: applied ? "applied" : "pending",
      ...(applied
        ? { result: "Changes applied to the example worksheet." }
        : {}),
    };
    const conversation: Conversation = {
      id,
      projectId: id,
      title: "Reaction & recycle",
      provider: "muse",
      model: "example",
      mode: "review",
      createdAt: date,
      updatedAt: date,
      runs: sent
        ? [
            {
              id: "landing-run",
              requestId: "landing-request",
              prompt,
              text: response,
              status: proposed ? "completed" : "running",
              createdAt: date,
              activities: [
                { id: "read-project", name: "get_project", status: "done" },
                {
                  id: "preview",
                  name: "preview_actions",
                  status: proposed ? "done" : "running",
                },
              ],
              proposals: proposed ? [proposal] : [],
            },
          ]
        : [],
    };
    return {
      connected: true,
      connecting: false,
      openingApproval: false,
      providers: [
        {
          id: "muse",
          name: "Muse",
          available: true,
          message: "Example data",
          models: [{ id: "example", name: "Default model", default: true }],
        },
      ],
      checkingProviders: false,
      updateRequired: false,
      agents: { providers: ["muse"], preferred: "muse" },
      conversations: [
        { id, title: conversation.title, provider: "muse", updatedAt: date },
      ],
      conversation,
      selectedId: id,
      activeConversation: undefined,
      capabilities: ["attachments-v1", "muse-connector-v1"],
      activity: undefined,
      error: "",
      sending: sent && !proposed,
      connect: idle,
      openApproval: () => undefined,
      select: noop,
      send: unavailable,
      stop: idle,
      decide: idle,
      refreshProviders: idle,
      getConnectorSettings: unavailable,
      saveConnectorSettings: unavailable,
      updateConversation: async () => false,
      getConversation: () => conversation,
      disconnect: noop,
      cancelConnect: noop,
    };
  }, [sent, proposed, applied, response]);
  const presentation = useMemo(() => ({ prompt: typed }), [typed]);
  useLayoutEffect(() => {
    const root = host.current;
    if (!root) return;
    const log = root.querySelector<HTMLElement>('[role="log"]');
    if (!log) return;
    const update = () => {
      const frame = chatTimeline(time);
      const working = log.querySelector<HTMLElement>('[role="status"]');
      if (working) working.style.opacity = String(frame.workingOpacity);
      const card = log.querySelector<HTMLElement>(
        '[aria-label="Review proposed changes"]',
      );
      if (!card) {
        log.scrollTop = 0;
        return;
      }
      const actions = card.querySelector<HTMLElement>(
        `.${assistantStyles.actions}`,
      );
      if (actions) actions.style.opacity = String(frame.actionOpacity);
      if (applied) {
        const result = card.lastElementChild as HTMLElement;
        // Keep the actual button row's footprint during the confirmation.
        result.style.minHeight = "34px";
        result.style.marginTop = "12px";
        result.style.display = "flex";
        result.style.alignItems = "center";
        result.style.opacity = String(frame.appliedOpacity);
      }
      const title = card.querySelector<HTMLElement>("h3");
      if (title)
        title.style.opacity = String(
          applied ? frame.appliedOpacity : frame.actionOpacity,
        );
      const logRect = log.getBoundingClientRect();
      const scale = log.offsetHeight / logRect.height;
      const cardRect = card.getBoundingClientRect();
      const top = (cardRect.top - logRect.top) * scale + log.scrollTop;
      const height = card.offsetHeight;
      const revealedHeight = height * frame.reveal;
      const rows = Array.from(card.querySelectorAll<HTMLElement>("ol > li"));
      const rowMetrics = rows.map((row) => ({
        row,
        top: (row.getBoundingClientRect().top - cardRect.top) * scale,
        height: row.offsetHeight,
      }));
      card.style.clipPath = `inset(0 0 ${(1 - frame.reveal) * 100}% 0)`;
      card.style.opacity = String(chatEase(time, CHAT_PROPOSAL, 0.725));
      for (const row of rowMetrics)
        row.row.style.opacity = String(
          Math.max(0, Math.min(1, (revealedHeight - row.top) / row.height)),
        );
      // Follow the growing visible edge, rather than snapping to all 18 rows.
      log.scrollTop = Math.max(0, top + revealedHeight + 32 - log.clientHeight);
    };
    update();
    const next = requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(log);
    return () => {
      cancelAnimationFrame(next);
      observer.disconnect();
    };
  }, [time, applied]);
  return (
    <AssistantMorphPreview rootRef={host} seconds={time * 8} openAt={1.6}>
      <AssistantPanel
        assistant={assistant}
        project={applied ? landingExample.project : landingExample.emptyProject}
        folderName="Example data"
        appliedProposalIds={applied ? ["landing-plan"] : []}
        onApply={unavailable}
        onError={noop}
        open
        presentation={presentation}
      />
    </AssistantMorphPreview>
  );
}

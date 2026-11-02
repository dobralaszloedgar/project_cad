"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "../domain/schema";
import { executeProjectTool } from "./tools";
import type { ChatAttachment } from "./attachments";
import {
  ASSISTANT_ENDPOINT,
  MUSE_AGENTS,
  agentSelectionSchema,
  type AgentSelection,
  type AssistantSnapshot,
  type Conversation,
  type ConversationSummary,
  type ProviderStatus,
  type ProviderId,
  type AssistantMode,
  type Proposal,
} from "./protocol";
import { rememberAgentSelection } from "./selection";

const tokenKey = "project-cad.assistant-token";
let browserIdentity: Promise<string> | undefined;
/** Reuse a tab's identity after reload; a duplicated tab must acquire its own lease. */
function clientIdentity() {
  if (!browserIdentity)
    browserIdentity = new Promise<string>((resolve) => {
      const claim = (id: string) => {
        if (!navigator.locks) {
          resolve(crypto.randomUUID());
          return;
        }
        void navigator.locks
          .request(
            `project-cad-assistant-${id}`,
            { ifAvailable: true },
            async (lock) => {
              if (!lock) {
                claim(crypto.randomUUID());
                return;
              }
              sessionStorage.setItem("project-cad.assistant-client", id);
              resolve(id);
              // The browser releases this lock when the document closes or reloads.
              await new Promise<void>(() => {});
            },
          )
          .catch(() => resolve(crypto.randomUUID()));
      };
      claim(
        sessionStorage.getItem("project-cad.assistant-client") ||
          crypto.randomUUID(),
      );
    });
  return browserIdentity;
}
class ConnectionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function request<T>(
  token: string,
  clientId: string,
  path: string,
  body?: unknown,
  keepalive = false,
): Promise<T> {
  const response = await fetch(`${ASSISTANT_ENDPOINT}${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    keepalive,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Project-CAD-Client": clientId,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  const value = await response.json();
  if (!response.ok)
    throw new ConnectionError(
      value.error || "Assistant request failed.",
      response.status,
    );
  return value;
}
export function useAssistant(projectId: string, project: Project) {
  const [token, setToken] = useState(() =>
    typeof window === "undefined" ? "" : sessionStorage.getItem(tokenKey) || "",
  );
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [updateRequired, setUpdateRequired] = useState(false);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [checkingProviders, setCheckingProviders] = useState(false);
  const providerRequest = useRef<{
    token: string;
    promise: Promise<void>;
  } | null>(null);
  const [agents, setAgents] = useState<AgentSelection | null>(MUSE_AGENTS);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversation, setConversation] = useState<Conversation>();
  const [activeConversation, setActiveConversation] = useState<Conversation>();
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [activity, setActivity] = useState<AssistantSnapshot["activity"]>();
  const [selectedId, setSelectedId] = useState<string>();
  const cache = useRef(new Map<string, Conversation>());
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [clientId, setClientId] = useState("");
  const selected = useRef<string | undefined>(undefined);
  const projectRef = useRef(project);
  const pairCleanup = useRef<(() => void) | null>(null);
  const pairOpen = useRef<(() => Promise<void>) | null>(null);
  const connectorWindow = useRef<Window | null>(null);
  useEffect(() => {
    const returnToProject = (event: MessageEvent) => {
      if (
        event.source !== connectorWindow.current ||
        !/^http:\/\/127\.0\.0\.1:\d+$/.test(event.origin) ||
        event.data?.type !== "project-cad-return"
      )
        return;
      window.focus();
    };
    window.addEventListener("message", returnToProject);
    return () => window.removeEventListener("message", returnToProject);
  }, []);
  const [openingApproval, setOpeningApproval] = useState(false);
  const retry = useRef<{
    chatId: string;
    message: string;
    attachmentIds: string;
    requestId: string;
  } | null>(null);
  const loadLatest = useRef(true);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);
  useEffect(() => () => pairCleanup.current?.(), []);
  useEffect(() => {
    let alive = true;
    void clientIdentity().then((id) => {
      if (alive) setClientId(id);
    });
    return () => {
      alive = false;
    };
  }, []);
  const path = useCallback(
    (route: string) => `${route}?projectId=${encodeURIComponent(projectId)}`,
    [projectId],
  );
  const report = useCallback((failure: unknown) => {
    if (failure instanceof ConnectionError && failure.status === 401) {
      sessionStorage.removeItem(tokenKey);
      setToken("");
      setConnected(false);
    }
    setError(
      failure instanceof TypeError
        ? "The browser could not reach Project CAD Assistant. Open the app, allow local network access in this website’s browser permissions, then connect again."
        : failure instanceof Error
          ? failure.message
          : "Assistant request failed.",
    );
  }, []);
  const refreshProviders = useCallback(async () => {
    if (!token || !clientId) return;
    if (providerRequest.current?.token === token)
      return providerRequest.current.promise;
    setCheckingProviders(true);
    const pending = { token, promise: Promise.resolve() };
    providerRequest.current = pending;
    pending.promise = request<ProviderStatus[]>(
      token,
      clientId,
      "/providers?refresh=1",
    )
      .then((value) => {
        if (providerRequest.current === pending)
          setProviders(value.filter((provider) => provider.id === "muse"));
      })
      .catch((failure) => {
        if (providerRequest.current === pending) report(failure);
      })
      .finally(() => {
        if (providerRequest.current === pending) {
          providerRequest.current = null;
          setCheckingProviders(false);
        }
      });
    return pending.promise;
  }, [token, clientId, report]);
  useEffect(() => {
    void refreshProviders();
    return () => {
      providerRequest.current = null;
    };
  }, [refreshProviders]);
  const needsProviderSetup =
    !agents ||
    agents.providers.some((id) => {
      const provider = providers.find((item) => item.id === id);
      return !provider?.available || !provider.models.length;
    });
  useEffect(() => {
    if (!token || !clientId) return;
    const check = () => {
      if (!document.hidden) void refreshProviders();
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    const timer = needsProviderSetup ? setInterval(check, 8000) : undefined;
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [token, clientId, needsProviderSetup, refreshProviders]);
  useEffect(() => {
    if (!token || !clientId) return;
    let alive = true,
      hadPollError = false,
      timer: ReturnType<typeof setTimeout>;
    const replies = new Map<string, { value?: unknown; error?: string }>();
    const detach = () => {
      void request(token, clientId, path("/detach"), {}, true).catch(() => {});
    };
    const poll = async () => {
      const id = selected.current;
      try {
        const value = await request<AssistantSnapshot>(
          token,
          clientId,
          path("/state") +
            (id ? `&conversationId=${encodeURIComponent(id)}` : ""),
        );
        if (!alive) return;
        if (!value.capabilities?.includes("muse-connector-v1")) {
          setUpdateRequired(true);
          setConnected(false);
          setToken("");
          sessionStorage.removeItem(tokenKey);
          return;
        }
        if (hadPollError) {
          setError("");
          hadPollError = false;
        }
        setConnected(true);
        setConversations(value.conversations);
        setCapabilities(value.capabilities ?? []);
        if (value.agents) {
          setAgents((previous) =>
            JSON.stringify(previous) === JSON.stringify(MUSE_AGENTS)
              ? previous
              : MUSE_AGENTS,
          );
          rememberAgentSelection();
        }
        setActiveConversation(value.activeConversation);
        setActivity(value.activity);
        if (value.activeConversation)
          cache.current.set(
            value.activeConversation.id,
            value.activeConversation,
          );
        if (value.conversation)
          cache.current.set(value.conversation.id, value.conversation);
        if (id === selected.current) {
          setConversation(value.conversation);
          if (!id && loadLatest.current) {
            const latest = value.conversations.find((item) => !item.archived);
            selected.current = latest?.id;
            setSelectedId(latest?.id);
          }
          loadLatest.current = false;
        }
        for (const command of value.commands) {
          if (!alive || command.projectId !== projectId) return;
          let reply = replies.get(command.id);
          if (!reply) {
            try {
              reply = {
                value: await executeProjectTool(
                  command.name,
                  command.arguments,
                  {
                    projectId,
                    project: projectRef.current,
                    mode: command.mode,
                  },
                ),
              };
            } catch (failure) {
              reply = {
                error:
                  failure instanceof Error
                    ? failure.message.slice(0, 2000)
                    : "Project tool failed.",
              };
            }
            replies.set(command.id, reply);
          }
          if (!alive) return;
          await request(token, clientId, path("/tool-result"), {
            id: command.id,
            ...reply,
          });
        }
        for (const id of replies.keys())
          if (!value.commands.some((command) => command.id === id))
            replies.delete(id);
      } catch (failure) {
        if (alive) {
          hadPollError = true;
          setConnected(false);
          report(failure);
        }
      } finally {
        if (alive) timer = setTimeout(poll, 600);
      }
    };
    void poll();
    window.addEventListener("pagehide", detach);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener("pagehide", detach);
      detach();
    };
  }, [token, clientId, projectId, path, report]);
  function connect(selection?: AgentSelection, onConnected?: () => void) {
    const chosen = agentSelectionSchema.safeParse(MUSE_AGENTS);
    if (!chosen.success) {
      setError("Choose your agents before connecting.");
      return;
    }
    pairCleanup.current?.();
    // Reserve the same named window during the click, before asynchronous work.
    // Its opener lets the connector focus this exact project tab afterward.
    const windowName = `project-cad-muse-connector-${clientId}`;
    let popup = window.open(
      "about:blank",
      windowName,
      "popup,width=680,height=620",
    );
    let approvalUrl = "";
    connectorWindow.current = popup;
    setConnecting(true);
    setError("");
    const nonce = crypto.randomUUID();
    const controller = new AbortController();
    let stopped = false;
    let id = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
      setConnecting(false);
      pairCleanup.current = null;
      pairOpen.current = null;
      setOpeningApproval(false);
    };
    const cancel = () => {
      cleanup();
      if (popup && !popup.closed) popup.close();
      if (id)
        void fetch(`${ASSISTANT_ENDPOINT}/connections/${id}/cancel`, {
          method: "POST",
          credentials: "omit",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }).catch(() => {});
    };
    pairCleanup.current = cancel;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(120000),
    ]);
    pairOpen.current = async () => {
      if (!id || stopped) return;
      setOpeningApproval(true);
      setError("");
      try {
        if (approvalUrl) {
          if (popup && !popup.closed) popup.location.href = approvalUrl;
          else
            popup = window.open(
              approvalUrl,
              windowName,
              "popup,width=680,height=620",
            );
          connectorWindow.current = popup;
          if (popup) {
            popup.focus();
            return;
          }
        }
        const response = await fetch(
          `${ASSISTANT_ENDPOINT}/connections/${id}/open`,
          {
            method: "POST",
            credentials: "omit",
            headers: { "Content-Type": "application/json" },
            body: "{}",
            signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
          },
        );
        if (!response.ok)
          throw new Error(
            "Open Project CAD Assistant from your Start or application menu, then choose Approve connection. Update the connector if its approval window does not open.",
          );
      } catch (failure) {
        if (!stopped) report(failure);
      } finally {
        if (!stopped) setOpeningApproval(false);
      }
    };
    const poll = async () => {
      try {
        const response = await fetch(
          `${ASSISTANT_ENDPOINT}/connections/${id}`,
          { signal, credentials: "omit", cache: "no-store" },
        );
        const value = await response.json();
        if (!response.ok)
          throw new Error(
            value.error ||
              "Connection expired. Connect again from the website.",
          );
        if (stopped) return;
        if (value.status === "denied")
          throw new Error(
            "Connection declined in the assistant. Your agent choices are saved.",
          );
        if (value.status !== "connected") {
          timer = setTimeout(() => void poll(), 800);
          return;
        }
        const accepted = agentSelectionSchema.safeParse(value.agents);
        if (
          value.nonce !== nonce ||
          typeof value.token !== "string" ||
          !accepted.success
        )
          throw new Error(
            "The connection response was invalid. Try connecting again.",
          );
        // A fresh approval is an explicit handoff from an idle older tab.
        // Older companions have no attach endpoint and retain their lease rules.
        try {
          await request(value.token, clientId, path("/attach"), {});
        } catch (failure) {
          if (!(failure instanceof ConnectionError && failure.status === 404))
            throw failure;
        }
        if (stopped) return;
        setAgents(accepted.data);
        rememberAgentSelection();
        sessionStorage.setItem(tokenKey, value.token);
        setToken(value.token);
        setError("");
        setUpdateRequired(false);
        cleanup();
        onConnected?.();
      } catch (failure) {
        if (stopped) return;
        const expired = signal.aborted;
        cancel();
        report(
          expired
            ? new Error(
                "Connection expired. Connect again and approve it in Project CAD Assistant.",
              )
            : failure,
        );
      }
    };
    void fetch(`${ASSISTANT_ENDPOINT}/connections`, {
      method: "POST",
      credentials: "omit",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nonce,
        agents: chosen.data,
        browserWindow: !!popup,
      }),
    })
      .then(async (response) => {
        if (stopped) return;
        if (response.status === 401 || response.status === 404) {
          setUpdateRequired(true);
          throw new Error(
            "Update Project CAD Assistant to connect. Your agent choices are saved.",
          );
        }
        const value = await response.json();
        if (!response.ok)
          throw new Error(value.error || "Could not request a connection.");
        if (stopped) return;
        if (typeof value.id !== "string" || !/^[a-f0-9]{64}$/.test(value.id))
          throw new Error("The connection request was invalid. Try again.");
        id = value.id;
        if (popup && !popup.closed) {
          if (
            value.windowUrl === `${ASSISTANT_ENDPOINT}/connections/${id}/window`
          ) {
            approvalUrl = value.windowUrl;
            popup.location.href = approvalUrl;
          } else popup.close();
        }
        void poll();
      })
      .catch((failure) => {
        if (stopped) return;
        const expired = signal.aborted;
        cancel();
        report(
          expired
            ? new Error("Connection expired. Try connecting again.")
            : failure,
        );
      });
  }
  function select(id?: string) {
    selected.current = id;
    setSelectedId(id);
    loadLatest.current = false;
    setConversation(id ? cache.current.get(id) : undefined);
    setError("");
  }
  async function send(
    message: string,
    settings: {
      provider: ProviderId;
      model: string;
      reasoning?: string;
      mode: AssistantMode;
    },
    attachments: ChatAttachment[] = [],
    targetId: string | null | undefined = selected.current,
    onCreated?: (chat: Conversation) => void,
  ) {
    if (!connected || sending) return false;
    setSending(true);
    setError("");
    try {
      if (attachments.length && !capabilities.includes("attachments-v1"))
        throw new Error("Update Project CAD Assistant to send files.");
      let chatId = targetId;
      if (!chatId) {
        const created = await request<Conversation>(
          token,
          clientId,
          path("/conversations"),
          { projectId, projectName: projectRef.current.name, ...settings },
        );
        chatId = created.id;
        cache.current.set(chatId, created);
        onCreated?.(created);
      }
      const requestId =
        retry.current?.chatId === chatId &&
        retry.current.message === message &&
        retry.current.attachmentIds ===
          attachments.map((file) => file.id).join(",")
          ? retry.current.requestId
          : crypto.randomUUID();
      retry.current = {
        chatId,
        message,
        requestId,
        attachmentIds: attachments.map((file) => file.id).join(","),
      };
      const updated = await request<Conversation>(
        token,
        clientId,
        path("/send"),
        {
          conversationId: chatId,
          message,
          requestId,
          ...(attachments.length ? { attachments } : {}),
        },
      );
      retry.current = null;
      if (selected.current === chatId) setConversation(updated);
      cache.current.set(chatId, updated);
      setActiveConversation(updated);
      return updated;
    } catch (failure) {
      report(failure);
      return false;
    } finally {
      setSending(false);
    }
  }
  async function decide(
    proposal: Proposal,
    status: "applied" | "dismissed",
    result: string,
    targetId = selected.current,
  ) {
    const chatId = targetId;
    if (!chatId) throw new Error("Select the proposal's conversation first.");
    try {
      const updated = await request<Conversation>(
        token,
        clientId,
        path("/proposal"),
        { conversationId: chatId, proposalId: proposal.id, status, result },
      );
      if (selected.current === chatId) setConversation(updated);
    } catch (failure) {
      report(failure);
      throw failure;
    }
  }
  async function stop() {
    try {
      await request(token, clientId, path("/stop"), {});
    } catch (failure) {
      report(failure);
    }
  }
  async function updateConversation(
    id: string,
    update: { title?: string; archived?: boolean },
  ) {
    try {
      const updated = await request<Conversation>(
        token,
        clientId,
        path("/conversation"),
        { conversationId: id, ...update },
      );
      cache.current.set(id, updated);
      if (selected.current === id) setConversation(updated);
      setConversations((items) =>
        items.map((item) =>
          item.id === id
            ? { ...item, title: updated.title, archived: updated.archived }
            : item,
        ),
      );
      return true;
    } catch (failure) {
      report(failure);
      return false;
    }
  }
  function disconnect() {
    pairCleanup.current?.();
    setConnected(false);
    setToken("");
    sessionStorage.removeItem(tokenKey);
    setProviders([]);
    setConversation(undefined);
    setActiveConversation(undefined);
    setConversations([]);
    setError("");
    selected.current = undefined;
    setSelectedId(undefined);
    loadLatest.current = true;
    cache.current.clear();
  }
  return {
    connected,
    connecting,
    openingApproval,
    providers,
    checkingProviders,
    updateRequired,
    agents,
    conversations,
    conversation,
    selectedId,
    activeConversation,
    capabilities,
    activity,
    error,
    sending,
    connect,
    openApproval: () => void pairOpen.current?.(),
    select,
    send,
    stop,
    decide,
    refreshProviders,
    updateConversation,
    getConversation: (id: string) => cache.current.get(id),
    disconnect,
    cancelConnect: () => pairCleanup.current?.(),
  };
}
export type AssistantClient = ReturnType<typeof useAssistant>;

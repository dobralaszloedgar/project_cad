"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "../domain/schema";
import { executeProjectTool } from "./tools";
import {
  ASSISTANT_ENDPOINT,
  type AssistantSnapshot,
  type Conversation,
  type ConversationSummary,
  type ProviderStatus,
  type ProviderId,
  type AssistantMode,
  type Proposal,
} from "./protocol";

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
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversation, setConversation] = useState<Conversation>();
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [clientId, setClientId] = useState("");
  const selected = useRef<string | undefined>(undefined);
  const projectRef = useRef(project);
  const pairCleanup = useRef<(() => void) | null>(null);
  const retry = useRef<{
    chatId: string;
    message: string;
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
        ? "The local assistant is unavailable. Open Project CAD Assistant on this laptop, then connect again."
        : failure instanceof Error
          ? failure.message
          : "Assistant request failed.",
    );
  }, []);
  const refreshProviders = useCallback(async () => {
    if (!token || !clientId) return;
    try {
      setProviders(
        await request<ProviderStatus[]>(
          token,
          clientId,
          "/providers?refresh=1",
        ),
      );
    } catch (failure) {
      report(failure);
    }
  }, [token, clientId, report]);
  useEffect(() => {
    if (!token || !clientId) return;
    let alive = true,
      hadPollError = false,
      timer: ReturnType<typeof setTimeout>;
    const replies = new Map<string, { value?: unknown; error?: string }>();
    void request<ProviderStatus[]>(token, clientId, "/providers").then(
      (value) => {
        if (alive) setProviders(value);
      },
      (failure) => {
        if (alive) report(failure);
      },
    );
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
        if (hadPollError) {
          setError("");
          hadPollError = false;
        }
        setConnected(true);
        setConversations(value.conversations);
        if (id === selected.current) {
          setConversation(value.conversation);
          if (!id && loadLatest.current && value.conversations[0])
            selected.current = value.conversations[0].id;
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
  function connect() {
    pairCleanup.current?.();
    setConnecting(true);
    setError("");
    const nonce = crypto.randomUUID();
    const popup = window.open(
      `${ASSISTANT_ENDPOINT}/connect?origin=${encodeURIComponent(window.location.origin)}&nonce=${nonce}`,
      "project-cad-connect",
      "popup,width=560,height=500",
    );
    if (!popup) {
      setConnecting(false);
      setError("Allow the connection popup, then try again.");
      return;
    }
    const cleanup = () => {
      window.removeEventListener("message", receive);
      clearTimeout(timeout);
      setConnecting(false);
      pairCleanup.current = null;
    };
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== ASSISTANT_ENDPOINT ||
        event.source !== popup ||
        event.data?.type !== "project-cad-assistant-connected" ||
        event.data.nonce !== nonce ||
        typeof event.data.token !== "string"
      )
        return;
      sessionStorage.setItem(tokenKey, event.data.token);
      setToken(event.data.token);
      setError("");
      cleanup();
    };
    const timeout = setTimeout(() => {
      cleanup();
      setError(
        "Connection timed out. Open Project CAD Assistant on this laptop, then try again.",
      );
    }, 120000);
    window.addEventListener("message", receive);
    pairCleanup.current = cleanup;
  }
  function select(id?: string) {
    selected.current = id;
    loadLatest.current = false;
    setConversation(undefined);
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
  ) {
    if (!connected || sending) return false;
    setSending(true);
    setError("");
    try {
      let chatId = selected.current;
      if (!chatId) {
        const created = await request<Conversation>(
          token,
          clientId,
          path("/conversations"),
          { projectId, projectName: projectRef.current.name, ...settings },
        );
        chatId = created.id;
        selected.current = chatId;
        setConversation(created);
      }
      const requestId =
        retry.current?.chatId === chatId && retry.current.message === message
          ? retry.current.requestId
          : crypto.randomUUID();
      retry.current = { chatId, message, requestId };
      const updated = await request<Conversation>(
        token,
        clientId,
        path("/send"),
        { conversationId: chatId, message, requestId },
      );
      retry.current = null;
      if (selected.current === chatId) setConversation(updated);
      return true;
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
  ) {
    const chatId = selected.current;
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
  return {
    connected,
    connecting,
    providers,
    conversations,
    conversation,
    error,
    sending,
    connect,
    select,
    send,
    stop,
    decide,
    refreshProviders,
  };
}

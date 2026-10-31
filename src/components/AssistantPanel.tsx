"use client";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  Archive,
  ArrowUp,
  Check,
  ChevronDown,
  FileText,
  Folder,
  Gauge,
  History,
  LoaderCircle,
  MessageCircle,
  Mic,
  Paperclip,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Square,
  SquarePen,
  Unplug,
  X,
} from "lucide-react";
import type { Project } from "@/domain/schema";
import {
  agentNames,
  type AssistantMode,
  type Proposal,
  type ProviderId,
} from "@/assistant/protocol";
import type { AssistantClient } from "@/assistant/client";
import {
  fileSize,
  prepareAttachments,
  type ChatAttachment,
} from "@/assistant/attachments";
import AssistantSetup from "./AssistantSetup";
import AssistantPopover from "./assistant/AssistantPopover";
import AssistantTranscript from "./assistant/AssistantTranscript";
import { useDictation } from "./assistant/useDictation";
import styles from "./AssistantPanel.module.css";

type Settings = {
  provider: ProviderId;
  model: string;
  mode: AssistantMode;
  reasoning?: string;
};
type QueuedMessage = { id: string; message: string; files: ChatAttachment[] };
type ChatTab = {
  id: string;
  conversationId?: string;
  prompt: string;
  files: ChatAttachment[];
  settings: Settings;
  queue: QueuedMessage[];
  paused: boolean;
};
const initialSettings: Settings = {
  provider: "codex",
  model: "",
  mode: "review",
};
const blankTab = (
  settings = initialSettings,
  id = crypto.randomUUID(),
): ChatTab => ({
  id,
  prompt: "",
  files: [],
  settings,
  queue: [],
  paused: false,
});
const commands = [
  { name: "/new", detail: "Start a new conversation" },
  { name: "/model", detail: "Choose a provider and model" },
  { name: "/stop", detail: "Stop the active response" },
  { name: "/help", detail: "Show keyboard shortcuts" },
];

export default function AssistantPanel({
  project,
  folderName,
  appliedProposalIds,
  onApply,
  onError,
  assistant,
  open,
  requestedConversation,
}: {
  project: Project;
  folderName: string | null;
  appliedProposalIds: string[];
  onApply: (proposal: Proposal) => Promise<string>;
  onError: (message: string) => void;
  assistant: AssistantClient;
  open: boolean;
  requestedConversation?: { id: string };
}) {
  const preferredAgent = assistant.agents?.preferred;
  const [tabs, setTabs] = useState<ChatTab[]>(() => [
    blankTab(
      {
        ...initialSettings,
        provider: preferredAgent ?? initialSettings.provider,
      },
      "draft",
    ),
  ]);
  const [active, setActive] = useState("draft");
  const [setup, setSetup] = useState(false),
    [history, setHistory] = useState(false);
  const [query, setQuery] = useState(""),
    [archived, setArchived] = useState(false);
  const [rename, setRename] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [error, setError] = useState(""),
    [help, setHelp] = useState(false);
  const [drop, setDrop] = useState(false),
    [readingFiles, setReadingFiles] = useState(false);
  const [commandIndex, setCommandIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null),
    upload = useRef<HTMLInputElement>(null),
    log = useRef<HTMLDivElement>(null);
  const follow = useRef(true),
    scrollPositions = useRef(new Map<string, number>()),
    dragDepth = useRef(0);
  const pendingTab = useRef<string | null>(null),
    queueSending = useRef(false),
    adopted = useRef(false),
    activeTab = useRef("draft");
  const tab = tabs.find((item) => item.id === active) ?? tabs[0];
  const chat =
    assistant.conversation?.id === tab.conversationId
      ? assistant.conversation
      : undefined;
  const busy =
    assistant.sending ||
    !!assistant.activeConversation ||
    !!chat?.runs.some((run) => run.status === "running");
  const settings = chat
    ? {
        provider: chat.provider,
        model: chat.model,
        mode: chat.mode,
        reasoning: chat.reasoning,
      }
    : tab.settings;
  const provider = assistant.providers.find(
    (item) => item.id === settings.provider,
  );
  const model =
    provider?.models.find((item) => item.id === settings.model) ??
    provider?.models.find((item) => item.default) ??
    provider?.models[0];
  const efforts = model?.reasoning ?? [];
  const matches =
    tab.prompt.startsWith("/") && !tab.prompt.includes(" ")
      ? commands.filter((command) => command.name.startsWith(tab.prompt))
      : [];
  const canSend =
    assistant.connected && !!provider?.available && !!model && !readingFiles;
  const hasContent = !!tab.prompt.trim() || !!tab.files.length;
  const queueCount = tabs.reduce(
    (count, item) => count + (item.paused ? 0 : item.queue.length),
    0,
  );
  const dictation = useDictation(
    (text) =>
      updateTab(active, (item) => ({
        ...item,
        prompt: `${item.prompt}${item.prompt ? " " : ""}${text}`.slice(
          0,
          12000,
        ),
      })),
    setError,
    open && assistant.connected && !history,
    active,
  );

  function updateTab(id: string, update: (value: ChatTab) => ChatTab) {
    setTabs((items) =>
      items.map((item) => (item.id === id ? update(item) : item)),
    );
  }
  const [adoptedAgent, setAdoptedAgent] = useState(preferredAgent);
  // Adopt a newly approved default before rendering a draft with the old agent.
  if (preferredAgent && preferredAgent !== adoptedAgent) {
    setAdoptedAgent(preferredAgent);
    setTabs((items) =>
      items.map((item) =>
        item.conversationId || item.queue.length
          ? item
          : {
              ...item,
              settings: {
                ...item.settings,
                provider: preferredAgent,
                model: "",
                reasoning: undefined,
              },
            },
      ),
    );
  }
  useEffect(() => {
    if (!assistant.selectedId || pendingTab.current || adopted.current) return;
    adopted.current = true;
    const id = assistant.selectedId;
    setTabs((items) => [
      { ...items[0], id, conversationId: id },
      ...items.slice(1),
    ]);
    activeTab.current = id;
    setActive(id);
  }, [assistant.selectedId]);
  const openRequested = useEffectEvent((id: string) => {
    adopted.current = true;
    openConversation(id);
  });
  useEffect(() => {
    if (requestedConversation) openRequested(requestedConversation.id);
  }, [requestedConversation]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      if (assistant.connected && !history)
        inputRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, assistant.connected, active, history]);
  useEffect(() => {
    const element = log.current;
    if (!element) return;
    if (follow.current) element.scrollTop = element.scrollHeight;
  }, [chat, history]);
  useEffect(() => {
    const element = log.current;
    if (element)
      element.scrollTop =
        scrollPositions.current.get(active) ?? element.scrollHeight;
    follow.current = !scrollPositions.current.has(active);
  }, [active]);
  const sendQueued = useEffectEvent(async () => {
    if (queueSending.current || pendingTab.current) return;
    const target = tabs.find((item) => !item.paused && item.queue.length);
    if (!target) return;
    queueSending.current = true;
    const queued = target.queue[0];
    const result = await transmit(target, queued.message, queued.files);
    if (result)
      updateTab(target.id, (item) => ({
        ...item,
        queue: item.queue.filter((value) => value.id !== queued.id),
      }));
    else updateTab(target.id, (item) => ({ ...item, paused: true }));
    queueSending.current = false;
  });
  useEffect(() => {
    if (!busy && assistant.connected && queueCount) void sendQueued();
  }, [busy, assistant.connected, queueCount]);

  function selectTab(item: ChatTab) {
    if (log.current) scrollPositions.current.set(active, log.current.scrollTop);
    activeTab.current = item.id;
    setActive(item.id);
    assistant.select(item.conversationId);
    setHistory(false);
    setError("");
  }
  function newChat(
    next = preferredAgent && preferredAgent !== settings.provider
      ? {
          ...settings,
          provider: preferredAgent,
          model: "",
          reasoning: undefined,
        }
      : settings,
  ) {
    const created = blankTab(next);
    setTabs((items) => [...items, created]);
    selectTab(created);
    setHelp(false);
  }
  function openConversation(id: string) {
    const existing = tabs.find((item) => item.conversationId === id);
    if (existing) selectTab(existing);
    else {
      const created = { ...blankTab(initialSettings), conversationId: id };
      setTabs((items) => [...items, created]);
      selectTab(created);
    }
  }
  function closeTab(id: string) {
    const closing = tabs.find((item) => item.id === id);
    if (closing?.queue.length) {
      setError("Send or remove this chat’s queued messages before closing it.");
      return;
    }
    const remaining = tabs.filter((item) => item.id !== id);
    if (!remaining.length)
      remaining.push(
        blankTab({
          ...settings,
          provider: preferredAgent ?? settings.provider,
          model: "",
          reasoning: undefined,
        }),
      );
    setTabs(remaining);
    if (active === id) selectTab(remaining.at(-1)!);
  }
  function changeSettings(update: Partial<Settings>) {
    const next = { ...settings, ...update };
    if (chat) newChat(next);
    else updateTab(active, (item) => ({ ...item, settings: next }));
  }
  async function transmit(
    target: ChatTab,
    message: string,
    files: ChatAttachment[],
  ) {
    pendingTab.current = target.id;
    const currentChat = target.conversationId
      ? assistant.getConversation(target.conversationId)
      : undefined;
    const chosen = currentChat ?? target.settings;
    const available = assistant.providers.find(
      (item) => item.id === chosen.provider,
    );
    const targetModel =
      available?.models.find((item) => item.id === chosen.model) ??
      available?.models.find((item) => item.default) ??
      available?.models[0];
    if (!available?.available || !targetModel) {
      pendingTab.current = null;
      setError(available?.message || "Choose an available provider and model.");
      return false;
    }
    const result = await assistant.send(
      message || "Review these files.",
      {
        provider: chosen.provider,
        model: targetModel.id,
        mode: chosen.mode,
        reasoning: chosen.reasoning,
      },
      files,
      target.conversationId ?? null,
      (created) => {
        updateTab(target.id, (item) => ({
          ...item,
          conversationId: created.id,
        }));
        if (activeTab.current === target.id) assistant.select(created.id);
      },
    );
    adopted.current = true;
    if (result) {
      updateTab(target.id, (item) => ({ ...item, conversationId: result.id }));
      if (activeTab.current === target.id) assistant.select(result.id);
    }
    pendingTab.current = null;
    return result;
  }
  async function send(forceQueue = false) {
    if (!canSend || !hasContent) return;
    const message = tab.prompt.trim(),
      files = tab.files;
    if (message.startsWith("/") && !files.length) {
      if (message === "/new") {
        updateTab(active, (item) => ({ ...item, prompt: "" }));
        newChat();
        return;
      }
      if (message === "/stop") {
        await stop();
        updateTab(active, (item) => ({ ...item, prompt: "" }));
        return;
      }
      if (message === "/help") {
        setHelp(true);
        updateTab(active, (item) => ({ ...item, prompt: "" }));
        return;
      }
      if (message === "/model") {
        document
          .querySelector<HTMLButtonElement>(
            '[aria-label="Choose provider and model"]',
          )
          ?.click();
        updateTab(active, (item) => ({ ...item, prompt: "" }));
        return;
      }
    }
    if (busy || forceQueue || tab.queue.length) {
      updateTab(active, (item) => ({
        ...item,
        prompt: "",
        files: [],
        queue: [...item.queue, { id: crypto.randomUUID(), message, files }],
      }));
      return;
    }
    const sentPrompt = tab.prompt;
    const result = await transmit(tab, message, files);
    if (result)
      updateTab(tab.id, (item) => ({
        ...item,
        prompt: item.prompt === sentPrompt ? "" : item.prompt,
        files: item.files.filter(
          (file) => !files.some((sent) => sent.id === file.id),
        ),
      }));
  }
  async function stop() {
    const id = assistant.activeConversation?.id ?? chat?.id;
    setTabs((items) =>
      items.map((item) =>
        item.conversationId === id ? { ...item, paused: true } : item,
      ),
    );
    await assistant.stop();
  }
  async function addFiles(files: File[]) {
    if (!files.length || !assistant.connected || readingFiles) return;
    const target = tab.id;
    setReadingFiles(true);
    try {
      const value = await prepareAttachments(files, tab.files);
      updateTab(target, (item) => ({ ...item, files: value.files }));
      setError(value.error);
    } finally {
      setReadingFiles(false);
    }
  }
  function inputKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (matches.length && ["ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      setCommandIndex(
        (index) =>
          (index + (event.key === "ArrowDown" ? 1 : matches.length - 1)) %
          matches.length,
      );
      return;
    }
    if (event.key === "Tab" && hasContent && !event.shiftKey) {
      event.preventDefault();
      void send(true);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (
        matches.length &&
        matches[commandIndex % matches.length].name !== tab.prompt
      ) {
        updateTab(active, (item) => ({
          ...item,
          prompt: matches[commandIndex % matches.length].name,
        }));
        return;
      }
      void send();
    }
  }
  const summary = (id?: string) =>
    assistant.conversations.find((item) => item.id === id);
  return (
    <div
      className={styles.panel}
      onDragEnter={(event) => {
        if (assistant.connected && event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          dragDepth.current++;
          setDrop(true);
        }
      }}
      onDragOver={(event) => {
        if (assistant.connected && event.dataTransfer.types.includes("Files"))
          event.preventDefault();
      }}
      onDragLeave={() => {
        if (--dragDepth.current <= 0) setDrop(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDrop(false);
        void addFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <header className={styles.header}>
        <h2 id="assistant-title">Assistant</h2>
        {assistant.connected ? (
          <>
            <AssistantPopover
              label="Assistant connection"
              trigger={
                <span className={styles.connectionPill}>
                  <i />
                  Project CAD
                </span>
              }
            >
              {(close) => (
                <>
                  <h3>Connected to this computer</h3>
                  <p>
                    Conversations and submitted files are saved by your local
                    assistant.
                  </p>
                  <p>{provider?.message}</p>
                  <button
                    className={styles.option}
                    onClick={() => void assistant.refreshProviders()}
                  >
                    <RefreshCw size={14} /> Refresh providers
                  </button>
                  <button
                    className={styles.option}
                    onClick={() => {
                      setSetup(true);
                      close();
                    }}
                  >
                    <Folder size={14} /> Manage agents
                  </button>
                  <button
                    className={styles.option}
                    onClick={() => {
                      assistant.disconnect();
                      setSetup(false);
                      adopted.current = false;
                      close();
                    }}
                  >
                    <Unplug size={14} /> Disconnect
                  </button>
                </>
              )}
            </AssistantPopover>
            <button
              type="button"
              className={styles.newChat}
              aria-label="New conversation"
              title="New conversation"
              onClick={() => newChat()}
            >
              <SquarePen size={16} />
            </button>
          </>
        ) : null}
      </header>
      {assistant.connected && !setup ? (
        <nav className={styles.navigation} aria-label="Agent chats">
          <div className={styles.tabs} role="tablist" aria-label="Agent chats">
            {tabs.map((item, index) => (
              <div
                key={item.id}
                className={styles.tab}
                data-active={item.id === active || undefined}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={item.id === active}
                  tabIndex={item.id === active ? 0 : -1}
                  onClick={() => selectTab(item)}
                  onKeyDown={(event) => {
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    ) {
                      event.preventDefault();
                      const target =
                        event.key === "Home"
                          ? tabs[0]
                          : event.key === "End"
                            ? tabs.at(-1)!
                            : tabs[
                                (index +
                                  (event.key === "ArrowLeft"
                                    ? tabs.length - 1
                                    : 1)) %
                                  tabs.length
                              ];
                      selectTab(target);
                      event.currentTarget
                        .closest('[role="tablist"]')
                        ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                        [tabs.indexOf(target)]?.focus();
                    }
                  }}
                >
                  <span>
                    {summary(item.conversationId)?.title ||
                      (chat && item.conversationId === chat.id
                        ? chat.title
                        : "New conversation")}
                  </span>
                  {item.conversationId &&
                  assistant.activeConversation?.id === item.conversationId ? (
                    <LoaderCircle size={11} className={styles.spinner} />
                  ) : item.queue.length ? (
                    <small>{item.queue.length} queued</small>
                  ) : null}
                </button>
                <button
                  type="button"
                  className={styles.closeTab}
                  aria-label={`Close chat ${index + 1}`}
                  onClick={() => closeTab(item.id)}
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
          <button
            className={styles.iconButton}
            aria-label="New chat tab"
            title="New chat"
            onClick={() => newChat()}
          >
            <Plus size={15} />
          </button>
          <button
            className={styles.iconButton}
            aria-label="Conversation history"
            aria-pressed={history}
            title="Saved conversations"
            onClick={() => setHistory((value) => !value)}
          >
            <History size={15} />
          </button>
        </nav>
      ) : null}
      {!assistant.connected || setup ? (
        <div className={styles.connectionScreen}>
          <AssistantSetup
            assistant={assistant}
            open={open}
            onBack={() => setSetup(false)}
          />
        </div>
      ) : history ? (
        <div className={styles.historyView}>
          <div className={styles.historyHeading}>
            <h3>Saved conversations</h3>
            <button
              className={styles.iconButton}
              aria-label="Close conversation history"
              onClick={() => setHistory(false)}
            >
              <X size={16} />
            </button>
          </div>
          <label className={styles.search}>
            <Search size={15} />
            <input
              aria-label="Search conversations"
              placeholder="Search conversations"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className={styles.archiveToggle}>
            <input
              type="checkbox"
              checked={archived}
              onChange={(event) => setArchived(event.target.checked)}
            />{" "}
            Show archived
          </label>
          {!assistant.capabilities.includes("chat-history-v1") ? (
            <p className={styles.emptyHistory}>
              Update Project CAD Assistant to rename or archive conversations.
            </p>
          ) : null}
          {assistant.conversations
            .filter(
              (item) =>
                !!item.archived === archived &&
                item.title.toLowerCase().includes(query.toLowerCase()),
            )
            .map((item) => (
              <div className={styles.historyItem} key={item.id}>
                {rename?.id === item.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void assistant
                        .updateConversation(item.id, { title: rename.title })
                        .then((ok) => {
                          if (ok) setRename(null);
                        });
                    }}
                  >
                    <input
                      aria-label="Conversation name"
                      value={rename.title}
                      maxLength={100}
                      onChange={(event) =>
                        setRename({ id: item.id, title: event.target.value })
                      }
                    />
                    <button
                      className={styles.iconButton}
                      aria-label="Save conversation name"
                      disabled={!rename.title.trim()}
                    >
                      <Check size={15} />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label="Cancel rename"
                      onClick={() => setRename(null)}
                    >
                      <X size={15} />
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      className={styles.historyOpen}
                      onClick={() => openConversation(item.id)}
                    >
                      <strong>{item.title}</strong>
                      <small>
                        {item.provider} ·{" "}
                        {new Date(item.updatedAt).toLocaleDateString()}
                      </small>
                    </button>
                    <button
                      className={styles.iconButton}
                      aria-label={`Rename ${item.title}`}
                      disabled={
                        !assistant.capabilities.includes("chat-history-v1")
                      }
                      onClick={() =>
                        setRename({ id: item.id, title: item.title })
                      }
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className={styles.iconButton}
                      aria-label={`${item.archived ? "Restore" : "Archive"} ${item.title}`}
                      disabled={
                        !assistant.capabilities.includes("chat-history-v1") ||
                        assistant.activeConversation?.id === item.id
                      }
                      onClick={() =>
                        void assistant.updateConversation(item.id, {
                          archived: !item.archived,
                        })
                      }
                    >
                      <Archive size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          {!assistant.conversations.some(
            (item) =>
              !!item.archived === archived &&
              item.title.toLowerCase().includes(query.toLowerCase()),
          ) ? (
            <p className={styles.emptyHistory}>No conversations found.</p>
          ) : null}
          {assistant.error ? (
            <p role="alert" className={styles.error}>
              {assistant.error}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div
            ref={log}
            className={styles.conversation}
            role="log"
            aria-label="Assistant conversation"
            aria-relevant="additions"
            onScroll={(event) => {
              const element = event.currentTarget;
              follow.current =
                element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight <
                64;
              scrollPositions.current.set(active, element.scrollTop);
            }}
          >
            {tab.conversationId && !chat ? (
              <p className={styles.working}>
                <LoaderCircle size={15} className={styles.spinner} /> Loading
                conversation…
              </p>
            ) : chat?.runs.length ? (
              <AssistantTranscript
                chat={chat}
                project={project}
                appliedProposalIds={appliedProposalIds}
                onApply={onApply}
                onError={(message) => {
                  setError(message);
                  onError(message);
                }}
                decide={(proposal, status, result) =>
                  assistant.decide(proposal, status, result, chat.id)
                }
              />
            ) : (
              <div className={styles.welcome}>
                <span>
                  <MessageCircle size={21} strokeWidth={1.6} />
                </span>
                <h3>How can I help you today?</h3>
              </div>
            )}
          </div>
          <div className={styles.composerArea}>
            {error || assistant.error ? (
              <p className={styles.error} role="alert">
                {error || assistant.error}
              </p>
            ) : null}
            {tab.queue.length ? (
              <div className={styles.queue} aria-label="Queued messages">
                <div className={styles.queueHeading}>
                  <span>
                    {tab.queue.length} queued{tab.paused ? " · Paused" : ""}
                  </span>
                  <button
                    className={styles.iconButton}
                    aria-label={tab.paused ? "Resume queue" : "Pause queue"}
                    onClick={() =>
                      updateTab(active, (item) => ({
                        ...item,
                        paused: !item.paused,
                      }))
                    }
                  >
                    {tab.paused ? <Play size={13} /> : <Pause size={13} />}
                  </button>
                </div>
                {tab.queue.map((item) => (
                  <div key={item.id}>
                    <span>
                      {item.message || "Attached files"}
                      {item.files.length ? ` · ${item.files.length} files` : ""}
                    </span>
                    <button
                      className={styles.iconButton}
                      aria-label={`Edit queued message: ${item.message || "Attached files"}`}
                      onClick={() =>
                        updateTab(active, (value) => ({
                          ...value,
                          prompt: [value.prompt, item.message]
                            .filter(Boolean)
                            .join("\n"),
                          files: [...value.files, ...item.files].slice(0, 8),
                          queue: value.queue.filter(
                            (entry) => entry.id !== item.id,
                          ),
                        }))
                      }
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      className={styles.iconButton}
                      aria-label={`Remove queued message: ${item.message || "Attached files"}`}
                      onClick={() =>
                        updateTab(active, (value) => ({
                          ...value,
                          queue: value.queue.filter(
                            (entry) => entry.id !== item.id,
                          ),
                        }))
                      }
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {help ? (
              <div className={styles.help}>
                <button
                  className={styles.iconButton}
                  aria-label="Close shortcuts"
                  onClick={() => setHelp(false)}
                >
                  <X size={13} />
                </button>
                <p>
                  Enter to send · Shift + Enter for a new line · Tab to queue
                </p>
                <p>/new · /model · /stop · /help</p>
              </div>
            ) : null}
            {tab.files.length ? (
              <div className={styles.fileList} aria-label="Attachments">
                {tab.files.map((file) => (
                  <span key={file.id} className={styles.fileChip}>
                    <FileText size={16} />
                    <span>
                      {file.name}
                      <small>{fileSize(file.size)}</small>
                    </span>
                    <button
                      className={styles.iconButton}
                      aria-label={`Remove ${file.name}`}
                      onClick={() =>
                        updateTab(active, (item) => ({
                          ...item,
                          files: item.files.filter(
                            (value) => value.id !== file.id,
                          ),
                        }))
                      }
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            {matches.length ? (
              <div
                className={styles.commands}
                role="listbox"
                aria-label="Chat commands"
              >
                {matches.map((command, index) => (
                  <button
                    key={command.name}
                    role="option"
                    aria-selected={index === commandIndex % matches.length}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      updateTab(active, (item) => ({
                        ...item,
                        prompt: command.name,
                      }));
                      inputRef.current?.focus();
                    }}
                  >
                    <strong>{command.name}</strong>
                    <span>{command.detail}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <form
              className={styles.composer}
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
              onPaste={(event) => {
                if (event.clipboardData.files.length) {
                  event.preventDefault();
                  void addFiles(Array.from(event.clipboardData.files));
                }
              }}
            >
              <div className={styles.composerField}>
                <input
                  ref={upload}
                  type="file"
                  multiple
                  className={styles.fileInput}
                  aria-label="Attach files"
                  tabIndex={-1}
                  onChange={(event) => {
                    void addFiles(Array.from(event.target.files ?? []));
                    event.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label="Add files"
                  title="Attach files · 5 MB each, 10 MB total"
                  disabled={
                    readingFiles ||
                    !assistant.capabilities.includes("attachments-v1")
                  }
                  onClick={() => upload.current?.click()}
                >
                  {readingFiles ? (
                    <LoaderCircle size={17} className={styles.spinner} />
                  ) : (
                    <Paperclip size={17} />
                  )}
                </button>
                <textarea
                  ref={inputRef}
                  aria-label="Process prompt"
                  placeholder="Message Assistant…"
                  rows={1}
                  maxLength={12000}
                  value={tab.prompt}
                  onChange={(event) => {
                    updateTab(active, (item) => ({
                      ...item,
                      prompt: event.target.value,
                    }));
                    setCommandIndex(0);
                  }}
                  onKeyDown={inputKey}
                />
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={
                    dictation.listening ? "Stop dictation" : "Start dictation"
                  }
                  aria-pressed={dictation.listening}
                  data-listening={dictation.listening || undefined}
                  title={
                    dictation.supported
                      ? "Dictate a message"
                      : "Dictation is not supported in this browser"
                  }
                  disabled={!dictation.supported}
                  onClick={dictation.toggle}
                >
                  <Mic size={17} />
                </button>
              </div>
              {busy ? (
                <>
                  {hasContent ? (
                    <button
                      className={styles.send}
                      type="submit"
                      aria-label="Queue message"
                      disabled={!canSend}
                    >
                      <ArrowUp size={18} />
                    </button>
                  ) : null}
                  <button
                    className={styles.send}
                    type="button"
                    aria-label="Stop response"
                    onClick={() => void stop()}
                  >
                    <Square size={14} fill="currentColor" />
                  </button>
                </>
              ) : (
                <button
                  className={styles.send}
                  type="submit"
                  aria-label="Send message"
                  disabled={!canSend || !hasContent}
                >
                  <ArrowUp size={19} />
                </button>
              )}
            </form>
            <div className={styles.composerControls}>
              <AssistantPopover
                label="Choose provider and model"
                compact
                trigger={
                  <>
                    <MessageCircle size={13} />
                    <span>
                      {provider?.name || agentNames[settings.provider]}
                    </span>
                    <span className={styles.divider}>/</span>
                    <span className={styles.modelName}>
                      {model?.name || "Select model"}
                    </span>
                    <ChevronDown size={12} />
                  </>
                }
              >
                {(close) => (
                  <>
                    <h3>Model</h3>
                    <div
                      className={styles.providerOptions}
                      role="group"
                      aria-label="Assistant provider"
                    >
                      {(
                        assistant.agents?.providers ??
                        assistant.providers.map((item) => item.id)
                      ).map((id) => (
                        <button
                          key={id}
                          aria-pressed={settings.provider === id}
                          onClick={() =>
                            changeSettings({
                              provider: id,
                              model: "",
                              reasoning: undefined,
                            })
                          }
                        >
                          {id === "codex"
                            ? "Codex"
                            : id === "claude"
                              ? "Claude Code"
                              : "Muse"}
                        </button>
                      ))}
                    </div>
                    <div role="group" aria-label="Assistant model">
                      {provider?.models.map((item) => (
                        <button
                          className={styles.option}
                          key={item.id}
                          aria-pressed={model?.id === item.id}
                          onClick={() => {
                            changeSettings({
                              model: item.id,
                              reasoning: undefined,
                            });
                            close();
                          }}
                        >
                          <span>{item.name}</span>
                          {model?.id === item.id ? <Check size={14} /> : null}
                        </button>
                      ))}
                    </div>
                    {!provider?.available ? (
                      <p>{provider?.message || "Refresh to load providers."}</p>
                    ) : null}
                    <button
                      className={styles.option}
                      aria-label="Refresh providers"
                      onClick={() => void assistant.refreshProviders()}
                    >
                      <RefreshCw size={13} /> Refresh models
                    </button>
                  </>
                )}
              </AssistantPopover>
              {efforts.length ? (
                <AssistantPopover
                  label="Model performance"
                  trigger={
                    <>
                      <Gauge size={13} />
                      <span>{settings.reasoning || "Default"}</span>
                      <ChevronDown size={11} />
                    </>
                  }
                >
                  {(close) => (
                    <>
                      <h3>Reasoning level</h3>
                      {["", ...efforts].map((effort) => (
                        <button
                          className={styles.option}
                          key={effort}
                          aria-pressed={(settings.reasoning || "") === effort}
                          onClick={() => {
                            changeSettings({ reasoning: effort || undefined });
                            close();
                          }}
                        >
                          {effort || "Default"}
                          {(settings.reasoning || "") === effort ? (
                            <Check size={13} />
                          ) : null}
                        </button>
                      ))}
                    </>
                  )}
                </AssistantPopover>
              ) : null}
              <div className={styles.composerRight}>
                <AssistantPopover
                  label="Project context"
                  align="right"
                  trigger={
                    <>
                      <Folder size={13} />
                      <span className={styles.contextName}>{project.name}</span>
                      <ChevronDown size={11} />
                    </>
                  }
                >
                  {() => (
                    <>
                      <h3>Project context</h3>
                      <p>
                        <strong>{project.name}</strong>
                      </p>
                      <p>
                        {folderName
                          ? `Folder: ${folderName}`
                          : "Saved on this device"}
                      </p>
                      <p>
                        The assistant reads the latest equipment, streams and
                        physical model from this project for every turn.
                      </p>
                    </>
                  )}
                </AssistantPopover>
                <AssistantPopover
                  label="Agent permissions"
                  align="right"
                  trigger={
                    <>
                      <ShieldCheck size={13} />
                      <span>
                        {settings.mode === "read-only"
                          ? "Read-only"
                          : "Review changes"}
                      </span>
                      <ChevronDown size={11} />
                    </>
                  }
                >
                  {(close) => (
                    <>
                      <h3>Agent permissions</h3>
                      {(["review", "read-only"] as AssistantMode[]).map(
                        (mode) => (
                          <button
                            key={mode}
                            className={styles.option}
                            aria-pressed={settings.mode === mode}
                            onClick={() => {
                              changeSettings({ mode });
                              close();
                            }}
                          >
                            <span>
                              <strong>
                                {mode === "review"
                                  ? "Review changes"
                                  : "Read-only"}
                              </strong>
                              <small>
                                {mode === "review"
                                  ? "Review proposed changes before applying them"
                                  : "Inspect and calculate without editing the project"}
                              </small>
                            </span>
                            {settings.mode === mode ? (
                              <Check size={14} />
                            ) : null}
                          </button>
                        ),
                      )}
                    </>
                  )}
                </AssistantPopover>
              </div>
            </div>
            {!provider?.available ? (
              <p className={styles.hint}>
                {provider?.message ||
                  "Refresh providers to load available models."}
              </p>
            ) : null}
            {!assistant.capabilities.includes("attachments-v1") ? (
              <p className={styles.hint}>
                Update Project CAD Assistant to send files.
              </p>
            ) : null}
          </div>
        </>
      )}
      {drop ? (
        <div className={styles.dropTarget}>
          <Paperclip size={26} />
          <strong>Drop files to attach</strong>
          <span>Up to 8 files · 5 MB each · 10 MB total</span>
        </div>
      ) : null}
    </div>
  );
}

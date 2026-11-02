import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { planSchema } from "../../domain/actions";
import {
  createChatSchema,
  MUSE_AGENTS,
  submitSchema,
  tools,
  publicConversation,
  type StoredConversation,
  type AssistantRun,
  type ProviderId,
  type ProviderStatus,
  type ToolCommand,
  type ToolName,
  type AssistantSnapshot,
  type AgentSelection,
} from "../../assistant/protocol";
import { AssistantStore } from "./store";
import type { AssistantProvider } from "./providers/types";
import { saveAttachments, validateAttachmentBytes } from "./attachments";

type Scope = { origin: string; projectId: string; clientId: string };
type Active = {
  chat: StoredConversation;
  run: AssistantRun;
  abort: AbortController;
};
type Pending = {
  scope: Scope;
  command: ToolCommand;
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
};
export class AssistantRuntime {
  private active = new Map<string, Active>();
  private leases = new Map<string, { clientId: string; time: number }>();
  private pending = new Map<string, Pending>();
  private statusCache?: {
    time: number;
    selection: string;
    value: Promise<ProviderStatus[]>;
  };
  private sweep: NodeJS.Timeout;
  constructor(
    readonly store: AssistantStore,
    private adapters: Partial<Record<ProviderId, AssistantProvider>>,
    private root: string,
    readonly agents: () => AgentSelection | null = () => MUSE_AGENTS,
  ) {
    this.sweep = setInterval(() => {
      for (const [key, lease] of this.leases)
        if (Date.now() - lease.time > 45000) {
          this.cancelKey(
            key,
            "The project disconnected. Reopen it to continue.",
          );
          this.leases.delete(key);
        }
      for (const value of this.active.values()) this.store.save(value.chat);
    }, 1000);
    this.sweep.unref();
  }
  private key(scope: Pick<Scope, "origin" | "projectId">) {
    return JSON.stringify([scope.origin, scope.projectId]);
  }
  providers(refresh = false) {
    const agents = this.agents();
    const selection = JSON.stringify(agents);
    if (
      !refresh &&
      this.statusCache &&
      this.statusCache.selection === selection &&
      Date.now() - this.statusCache.time < 60000
    )
      return this.statusCache.value;
    const value = Promise.all(
      (agents?.providers ?? [])
        .filter((id) => !!this.adapters[id])
        .map((id) => this.adapters[id]!.status()),
    );
    this.statusCache = { time: Date.now(), selection, value };
    return value;
  }
  private own(scope: Scope, claim = false) {
    const key = this.key(scope),
      lease = this.leases.get(key);
    if (
      lease &&
      lease.clientId !== scope.clientId &&
      Date.now() - lease.time < 45000
    )
      throw new Error(
        "This project's assistant is open in another tab. Close it there before connecting here.",
      );
    if (!claim && (!lease || lease.clientId !== scope.clientId))
      throw new Error("Reconnect this project before continuing.");
    this.leases.set(key, { clientId: scope.clientId, time: Date.now() });
  }
  /** An explicit connection may take an idle project from an older browser tab. */
  attach(scope: Scope) {
    const key = this.key(scope);
    const lease = this.leases.get(key);
    if (lease && lease.clientId !== scope.clientId && this.active.has(key))
      throw new Error(
        "An agent is still working in another tab. Stop it there before connecting here.",
      );
    this.leases.set(key, { clientId: scope.clientId, time: Date.now() });
  }
  private chat(scope: Scope, id: string) {
    const active = this.active.get(this.key(scope));
    return active?.chat.id === id
      ? active.chat
      : this.store.get(id, scope.origin, scope.projectId);
  }
  snapshot(scope: Scope, id?: string): AssistantSnapshot {
    this.own(scope, true);
    const history = this.store.list(scope.origin, scope.projectId);
    const latest =
      this.active.get(this.key(scope))?.chat ??
      history.find((chat) => chat.runs.length);
    const lastRun = latest?.runs.at(-1);
    return {
      agents: this.agents(),
      conversations: history.map(
        ({ id, title, provider, updatedAt, archived }) => ({
          id,
          title,
          provider,
          updatedAt,
          archived,
        }),
      ),
      conversation: id ? publicConversation(this.chat(scope, id)) : undefined,
      activeConversation: this.active.get(this.key(scope))
        ? publicConversation(this.active.get(this.key(scope))!.chat)
        : undefined,
      capabilities: ["attachments-v1", "chat-history-v1", "muse-connector-v1"],
      activity:
        latest && lastRun
          ? { conversationId: latest.id, run: lastRun }
          : undefined,
      commands: [...this.pending.values()]
        .filter(
          (p) =>
            this.key(p.scope) === this.key(scope) &&
            p.scope.clientId === scope.clientId,
        )
        .map((p) => p.command),
    };
  }
  async create(scope: Scope, raw: unknown) {
    this.own(scope);
    const value = createChatSchema.parse(raw);
    if (value.projectId !== scope.projectId)
      throw new Error("Project identity does not match.");
    const status = (await this.providers()).find(
      (provider) => provider.id === value.provider,
    );
    if (!status?.available)
      throw new Error(status?.message || "Provider unavailable.");
    const model = status.models.find((model) => model.id === value.model);
    if (
      !model ||
      (value.reasoning && !model.reasoning?.includes(value.reasoning))
    )
      throw new Error(
        "Choose a model and reasoning level offered by this provider.",
      );
    const time = new Date().toISOString();
    const chat: StoredConversation = {
      id: crypto.randomUUID(),
      origin: scope.origin,
      projectId: scope.projectId,
      title: "New conversation",
      provider: value.provider,
      model: value.model,
      mode: value.mode,
      reasoning: value.reasoning,
      createdAt: time,
      updatedAt: time,
      runs: [],
    };
    this.store.save(chat);
    return publicConversation(chat);
  }
  start(scope: Scope, id: string, raw: unknown) {
    this.own(scope);
    const request = submitSchema.parse(raw),
      key = this.key(scope),
      chat = this.chat(scope, id);
    // Request identity survives HTTP retries and companion restarts.
    if (chat.runs.some((run) => run.requestId === request.requestId))
      return publicConversation(chat);
    if (
      !this.agents()?.providers.includes(chat.provider) ||
      !this.adapters[chat.provider]
    )
      throw new Error(
        "This agent is not selected. Start a new Muse conversation; your saved conversation is preserved.",
      );
    if (this.active.has(key))
      throw new Error(
        "This project already has a running request. Stop it or wait for completion.",
      );
    if (chat.runs.length >= 100)
      throw new Error("This conversation is full. Start a new conversation.");
    const files = request.attachments ?? [];
    validateAttachmentBytes(files);
    const cwd = join(this.root, "sessions", chat.id);
    mkdirSync(cwd, { recursive: true, mode: 0o700 });
    const attachmentDirectory = join(cwd, request.requestId);
    mkdirSync(attachmentDirectory, { recursive: true, mode: 0o700 });
    saveAttachments(attachmentDirectory, files);
    const run: AssistantRun = {
      id: crypto.randomUUID(),
      requestId: request.requestId,
      prompt: request.message,
      text: "",
      status: "running",
      activities: [],
      proposals: [],
      createdAt: new Date().toISOString(),
      attachments: files.map(({ id, name, type, size }) => ({
        id,
        name,
        type,
        size,
      })),
    };
    chat.runs.push(run);
    chat.updatedAt = run.createdAt;
    if (chat.runs.length === 1) chat.title = request.message.slice(0, 64);
    this.store.save(chat);
    const abort = new AbortController(),
      active = { chat, run, abort };
    this.active.set(key, active);
    const deadline = setTimeout(
      () =>
        this.cancelKey(
          key,
          "The request reached its ten-minute limit. Send a follow-up to continue.",
        ),
      600000,
    );
    void this.adapters[chat.provider]!.run({
      conversation: chat,
      cwd,
      prompt: request.message,
      attachments: files,
      signal: abort.signal,
      text: (delta) => {
        if (run.status === "running" && run.text.length < 100000)
          run.text += delta.slice(0, 100000 - run.text.length);
      },
      session: (value) => {
        chat.providerSession = value;
        this.store.save(chat);
      },
      context: (value) => {
        chat.providerContext = value;
        this.store.save(chat);
      },
      call: (name, args) => this.call(scope, active, name, args),
    })
      .then(
        () => {
          if (run.status === "running") run.status = "completed";
        },
        (error) => {
          if (run.status === "running") {
            run.status = "failed";
            run.error =
              error instanceof Error
                ? error.message.slice(0, 1200)
                : "The provider could not complete the request.";
          }
        },
      )
      .finally(() => {
        clearTimeout(deadline);
        chat.updatedAt = new Date().toISOString();
        this.store.save(chat);
        if (this.active.get(key) === active) this.active.delete(key);
      });
    return publicConversation(chat);
  }
  private async call(
    scope: Scope,
    active: Active,
    name: ToolName,
    args: unknown,
  ) {
    if (active.abort.signal.aborted) throw new Error("Request stopped.");
    if (!Object.hasOwn(tools, name)) throw new Error("Unknown project tool.");
    const parsed = tools[name].schema.parse(args);
    if (name === "propose_actions" && active.chat.mode === "read-only")
      throw new Error("This conversation is read-only.");
    if (active.run.activities.length >= 30)
      throw new Error(
        "Project tool limit reached. Send a follow-up to continue.",
      );
    const id = crypto.randomUUID(),
      step = { id, name, status: "running" as "running" | "done" | "error" };
    active.run.activities.push(step);
    const command: ToolCommand = {
      id,
      projectId: scope.projectId,
      conversationId: active.chat.id,
      runId: active.run.id,
      name,
      arguments: parsed,
      mode: active.chat.mode,
    };
    try {
      const result = await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(
            new Error(
              "The project did not answer. Keep its tab open and try again.",
            ),
          );
        }, 30000);
        this.pending.set(id, { scope, command, resolve, reject, timer });
      });
      active.abort.signal.throwIfAborted();
      if (name === "propose_actions") {
        const proposal = z
          .object({
            projectId: z.string(),
            baseRevision: z.string().length(64),
            plan: planSchema,
          })
          .parse(result);
        if (proposal.projectId !== scope.projectId)
          throw new Error("Proposal belongs to a different project.");
        const id = crypto.randomUUID();
        active.run.proposals.push({ ...proposal, id, status: "pending" });
        step.status = "done";
        this.store.save(active.chat);
        return {
          proposalId: id,
          status: "awaiting_user_review",
          applied: false,
        };
      }
      step.status = "done";
      return result;
    } catch (error) {
      step.status = "error";
      throw error;
    }
  }
  answer(
    scope: Scope,
    id: string,
    result: { value?: unknown; error?: string },
  ) {
    this.own(scope);
    const pending = this.pending.get(id);
    if (!pending) return; // A reply may be retried after delivery or cancellation.
    if (
      this.key(pending.scope) !== this.key(scope) ||
      pending.scope.clientId !== scope.clientId
    )
      throw new Error("Tool request belongs to another project.");
    clearTimeout(pending.timer);
    this.pending.delete(id);
    if (result.error) pending.reject(new Error(result.error));
    else pending.resolve(result.value);
  }
  decide(
    scope: Scope,
    chatId: string,
    proposalId: string,
    status: "applied" | "dismissed",
    result: string,
  ) {
    this.own(scope);
    const chat = this.chat(scope, chatId);
    const proposal = chat.runs
      .flatMap((run) => run.proposals)
      .find((p) => p.id === proposalId);
    if (!proposal) throw new Error("Proposal not found.");
    if (proposal.status !== "pending") return publicConversation(chat);
    proposal.status = status;
    proposal.result = result;
    this.store.save(chat);
    return publicConversation(chat);
  }
  cancel(scope: Scope) {
    this.own(scope);
    this.cancelKey(this.key(scope), "Stopped by you.");
  }
  updateConversation(
    scope: Scope,
    id: string,
    update: { title?: string; archived?: boolean },
  ) {
    this.own(scope);
    const chat = this.chat(scope, id);
    if (update.archived && this.active.get(this.key(scope))?.chat.id === id)
      throw new Error("Stop this conversation before archiving it.");
    if (update.title !== undefined) chat.title = update.title;
    if (update.archived !== undefined) chat.archived = update.archived;
    this.store.save(chat);
    return publicConversation(chat);
  }
  detach(scope: Scope) {
    const key = this.key(scope);
    if (this.leases.get(key)?.clientId !== scope.clientId) return;
    this.cancelKey(key, "The project closed. Send a follow-up to continue.");
    this.leases.delete(key);
  }
  private cancelKey(key: string, reason: string) {
    const active = this.active.get(key);
    if (!active) return;
    active.run.status = "cancelled";
    active.run.error = reason;
    active.abort.abort();
    for (const [id, pending] of this.pending)
      if (this.key(pending.scope) === key) {
        clearTimeout(pending.timer);
        pending.reject(new Error(reason));
        this.pending.delete(id);
      }
    for (const activity of active.run.activities)
      if (activity.status === "running") activity.status = "error";
    this.store.save(active.chat);
    // Keep the slot occupied until the provider has actually released its process.
  }
  close() {
    clearInterval(this.sweep);
    for (const key of this.active.keys())
      this.cancelKey(key, "Assistant stopped.");
  }
}

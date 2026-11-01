import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { z } from "zod";
import {
  tools,
  toolNames,
  type ToolName,
  type ProviderStatus,
} from "../../../assistant/protocol";
import { assistantInstructions } from "../../../assistant/tools";
import { providerExecutable } from "../config";
import { imageAttachments } from "../attachments";
import { codexJson } from "./codex-json";
import {
  currentProjectPrompt,
  type AssistantProvider,
  type ProviderInput,
} from "./types";

type Message = {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message?: string };
};
/** One owned stdio process. Never connects to or stops the user's interactive session. */
class CodexRpc {
  private child: ChildProcessWithoutNullStreams;
  private next = 0;
  private pending = new Map<
    number,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
      timer: NodeJS.Timeout;
    }
  >();
  private closed = false;
  onNotification: (message: Message) => void = () => {};
  onRequest: (message: Message) => Promise<unknown> = async () => {
    throw new Error("Only Project CAD tools are available.");
  };
  onExit: (error: Error) => void = () => {};
  constructor(cwd: string) {
    this.child = spawn(
      providerExecutable("codex") || "codex",
      ["app-server", "--listen", "stdio://"],
      {
        cwd,
        stdio: "pipe",
        detached: process.platform !== "win32",
        windowsHide: true,
      },
    );
    this.child.stderr.resume();
    const lines = createInterface({ input: this.child.stdout });
    lines.on("line", (line) => {
      if (line.length > 2_000_000)
        return this.close(new Error("Codex response exceeded the size limit."));
      let message: Message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.method && message.id !== undefined) {
        void this.onRequest(message).then(
          (result) => this.send({ id: message.id, result }),
          () =>
            this.send({
              id: message.id,
              error: {
                code: -32601,
                message: "Only Project CAD tools are available.",
              },
            }),
        );
      } else if (message.method) this.onNotification(message);
      else if (typeof message.id === "number") {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error)
          pending.reject(
            new Error(message.error.message || "Codex request failed."),
          );
        else pending.resolve(message.result);
      }
    });
    this.child.on("error", () =>
      this.close(
        new Error(
          "Codex could not start. Open Project CAD Assistant and choose Set up for Codex.",
        ),
      ),
    );
    this.child.on("exit", () =>
      this.close(new Error("Codex stopped before completing the request.")),
    );
    this.child.stdin.on("error", () =>
      this.close(new Error("Codex connection closed.")),
    );
  }
  private send(message: unknown) {
    if (!this.closed) this.child.stdin.write(codexJson(message) + "\n");
  }
  request<T>(method: string, params: unknown): Promise<T> {
    if (this.closed)
      return Promise.reject(new Error("Codex is not connected."));
    return new Promise<T>((resolve, reject) => {
      const id = ++this.next;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} timed out.`));
      }, 20000);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      this.send({ id, method, params });
    });
  }
  async initialize() {
    await this.request("initialize", {
      clientInfo: {
        name: "project_cad",
        title: "Project CAD",
        version: "1.0.0",
      },
      capabilities: { experimentalApi: true },
    });
    this.send({ method: "initialized", params: {} });
  }
  close(error = new Error("Codex connection closed.")) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.child.stdin.end();
    if (this.child.pid) {
      try {
        process.kill(
          process.platform === "win32" ? this.child.pid : -this.child.pid,
          "SIGTERM",
        );
      } catch {
        /* already exited */
      }
    }
    this.onExit(error);
  }
}

export class CodexProvider implements AssistantProvider {
  constructor(private cwd: string) {}
  async status(): Promise<ProviderStatus> {
    const base = { id: "codex" as const, name: "Codex" };
    const rpc = new CodexRpc(this.cwd);
    try {
      await rpc.initialize();
      const [account, models] = await Promise.all([
        rpc.request<{ account: unknown; requiresOpenaiAuth: boolean }>(
          "account/read",
          { refreshToken: false },
        ),
        rpc.request<{
          data: {
            id: string;
            displayName: string;
            hidden: boolean;
            isDefault: boolean;
            supportedReasoningEfforts: { reasoningEffort: string }[];
          }[];
        }>("model/list", {}),
      ]);
      const available = !!account.account || !account.requiresOpenaiAuth;
      return {
        ...base,
        available,
        message: available
          ? "Signed in through Codex."
          : "Choose Sign in for Codex in Project CAD Assistant, then refresh providers.",
        models: models.data
          .filter((model) => !model.hidden)
          .map((model) => ({
            id: model.id,
            name: model.displayName,
            default: model.isDefault,
            reasoning: model.supportedReasoningEfforts
              .map((e) => e.reasoningEffort)
              .filter((e) => e !== "ultra"),
          })),
      };
    } catch (error) {
      return {
        ...base,
        available: false,
        message:
          error instanceof Error ? error.message : "Codex is unavailable.",
        models: [],
      };
    } finally {
      rpc.close();
    }
  }
  async run(input: ProviderInput) {
    const prompt = await currentProjectPrompt(input);
    const rpc = new CodexRpc(input.cwd);
    let threadId = "",
      turnId = "";
    const stop = () => {
      if (threadId && turnId)
        void rpc
          .request("turn/interrupt", { threadId, turnId })
          .catch(() => {})
          .finally(() => rpc.close());
      else rpc.close();
    };
    input.signal.addEventListener("abort", stop, { once: true });
    try {
      input.signal.throwIfAborted();
      await rpc.initialize();
      const settings = await rpc.request<{ config: Record<string, unknown> }>(
        "config/read",
        { includeLayers: false, cwd: input.cwd },
      );
      const inherited = settings.config.mcp_servers as
        Record<string, unknown> | undefined;
      const config: Record<string, unknown> = {
        web_search: "disabled",
        project_doc_max_bytes: 0,
        features: Object.fromEntries(
          [
            "shell_tool",
            "unified_exec",
            "multi_agent",
            "multi_agent_v2",
            "apps",
            "plugins",
            "hooks",
            "browser_use",
            "computer_use",
            "view_image",
            "image_generation",
            "skill_search",
            "sleep_tool",
            "goals",
          ].map((key) => [key, false]),
        ),
        "features.skip_host_skill_discovery": true,
        mcp_servers: Object.fromEntries(
          Object.keys(inherited || {}).map((key) => [key, { enabled: false }]),
        ),
      };
      const common = {
        cwd: input.cwd,
        model: input.conversation.model,
        approvalPolicy: "never",
        sandbox: "read-only",
        developerInstructions: assistantInstructions,
        config,
      };
      const thread = input.conversation.providerSession
        ? await rpc.request<{ thread: { id: string } }>("thread/resume", {
            ...common,
            threadId: input.conversation.providerSession,
            excludeTurns: true,
          })
        : await rpc.request<{ thread: { id: string } }>("thread/start", {
            ...common,
            baseInstructions: assistantInstructions,
            environments: [],
            selectedCapabilityRoots: [],
            dynamicTools: toolNames
              .filter(
                (name) =>
                  input.conversation.mode !== "read-only" ||
                  name !== "propose_actions",
              )
              .map((name) => ({
                type: "function",
                name,
                description: tools[name].description,
                inputSchema: z.toJSONSchema(tools[name].schema),
              })),
          });
      threadId = thread.thread.id;
      input.session(threadId);
      rpc.onRequest = async (message) => {
        if (
          message.method !== "item/tool/call" ||
          message.params?.threadId !== threadId
        )
          throw new Error("Tool unavailable.");
        const name = message.params.tool as ToolName;
        try {
          if (!toolNames.includes(name))
            throw new Error("Unknown project tool.");
          const value = await input.call(name, message.params.arguments);
          return {
            contentItems: [{ type: "inputText", text: JSON.stringify(value) }],
            success: true,
          };
        } catch (error) {
          return {
            contentItems: [
              {
                type: "inputText",
                text:
                  error instanceof Error
                    ? error.message
                    : "Project tool failed.",
              },
            ],
            success: false,
          };
        }
      };
      await new Promise<void>((resolve, reject) => {
        rpc.onExit = reject;
        rpc.onNotification = (message) => {
          if (message.params?.threadId !== threadId) return;
          if (
            message.method === "item/agentMessage/delta" &&
            typeof message.params.delta === "string"
          )
            input.text(message.params.delta);
          if (message.method === "turn/completed") {
            const turn = message.params.turn as {
              status: string;
              error?: { message: string };
            };
            if (turn.status === "completed") resolve();
            else
              reject(
                new Error(turn.error?.message || "Codex turn was interrupted."),
              );
          }
        };
        void rpc
          .request<{ turn: { id: string } }>("turn/start", {
            threadId,
            input: [
              { type: "text", text: prompt, text_elements: [] },
              ...imageAttachments(input.attachments).map((file) => ({
                type: "image",
                url: `data:${file.type};base64,${file.data}`,
              })),
            ],
            effort: input.conversation.reasoning,
            environments: [],
          })
          .then((value) => {
            turnId = value.turn.id;
            if (input.signal.aborted) stop();
          }, reject);
      });
    } finally {
      input.signal.removeEventListener("abort", stop);
      rpc.close();
    }
  }
}

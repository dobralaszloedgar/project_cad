import {
  query,
  tool,
  createSdkMcpServer,
  type SDKUserMessage,
  type Options,
} from "@anthropic-ai/claude-agent-sdk";
import {
  tools,
  toolNames,
  type ProviderStatus,
} from "../../../assistant/protocol";
import { assistantInstructions } from "../../../assistant/tools";
import { providerExecutable } from "../config";
import {
  currentProjectPrompt,
  type AssistantProvider,
  type ProviderInput,
} from "./types";

function promptStream(
  signal: AbortSignal,
  prompt?: string,
): AsyncIterable<SDKUserMessage> {
  return (async function* () {
    if (prompt)
      yield {
        type: "user",
        message: { role: "user", content: prompt },
        parent_tool_use_id: null,
        session_id: "",
      } as SDKUserMessage;
    if (!signal.aborted)
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
  })();
}
const baseOptions: Options = {
  tools: [],
  settingSources: [],
  strictMcpConfig: true,
  permissionMode: "dontAsk",
  systemPrompt: assistantInstructions,
  maxTurns: 16,
  includePartialMessages: true,
};
export class ClaudeProvider implements AssistantProvider {
  constructor(private cwd: string) {}
  async status(): Promise<ProviderStatus> {
    const base = { id: "claude" as const, name: "Claude Code" };
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 15000);
    const session = query({
      prompt: promptStream(abort.signal),
      options: {
        ...baseOptions,
        pathToClaudeCodeExecutable: providerExecutable("claude"),
        cwd: this.cwd,
        abortController: abort,
      },
    });
    try {
      const [models, account] = await Promise.all([
        session.supportedModels(),
        session.accountInfo(),
      ]);
      const available = !!(
        account.email ||
        account.tokenSource ||
        account.apiKeySource ||
        (account.apiProvider && account.apiProvider !== "firstParty")
      );
      return {
        ...base,
        available,
        message: available
          ? "Signed in through Claude Code."
          : "Sign in with Claude Code, then refresh providers.",
        models: models.map((model, i) => ({
          id: model.value,
          name: model.displayName,
          default: i === 0,
          reasoning: model.supportedEffortLevels,
        })),
      };
    } catch {
      return {
        ...base,
        available: false,
        message:
          "Claude Code is unavailable. Check your installation and sign-in, then refresh providers.",
        models: [],
      };
    } finally {
      clearTimeout(timer);
      abort.abort();
      session.close();
    }
  }
  async run(input: ProviderInput) {
    const prompt = await currentProjectPrompt(input);
    const abort = new AbortController();
    const cancel = () => abort.abort();
    input.signal.addEventListener("abort", cancel, { once: true });
    if (input.signal.aborted) abort.abort();
    const names = toolNames.filter(
      (name) =>
        input.conversation.mode !== "read-only" || name !== "propose_actions",
    );
    const allowedTools = names.map((name) => `mcp__project-cad__${name}`);
    const server = createSdkMcpServer({
      name: "project-cad",
      version: "1.0.0",
      tools: names.map((name) =>
        tool(
          name,
          tools[name].description,
          tools[name].schema.shape,
          async (args) => {
            try {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(await input.call(name, args)),
                  },
                ],
              };
            } catch (error) {
              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text:
                      error instanceof Error
                        ? error.message
                        : "Project tool failed.",
                  },
                ],
              };
            }
          },
        ),
      ),
    });
    const session = query({
      prompt: promptStream(abort.signal, prompt),
      options: {
        ...baseOptions,
        pathToClaudeCodeExecutable: providerExecutable("claude"),
        cwd: input.cwd,
        abortController: abort,
        model: input.conversation.model,
        resume: input.conversation.providerSession,
        effort: input.conversation.reasoning as Options["effort"],
        mcpServers: { "project-cad": server },
        allowedTools,
      },
    });
    let streamed = false,
      completed = false;
    try {
      for await (const message of session) {
        if ("session_id" in message && message.session_id)
          input.session(message.session_id);
        if (
          message.type === "stream_event" &&
          message.event.type === "content_block_delta" &&
          message.event.delta.type === "text_delta"
        ) {
          streamed = true;
          input.text(message.event.delta.text);
        }
        if (message.type === "assistant") {
          if (!streamed)
            for (const block of message.message.content)
              if (block.type === "text") input.text(block.text);
          streamed = false;
        }
        if (message.type === "result") {
          if (message.is_error)
            throw new Error(
              "errors" in message
                ? message.errors.join(" ")
                : "Claude Code could not complete the request.",
            );
          completed = true;
          break;
        }
      }
      if (!completed)
        throw new Error("Claude Code stopped before completing the request.");
    } finally {
      input.signal.removeEventListener("abort", cancel);
      abort.abort();
      session.close();
    }
  }
}

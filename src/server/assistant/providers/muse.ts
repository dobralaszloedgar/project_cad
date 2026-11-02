import { spawnMspConnection } from "@muse-code/sdk";
import { z } from "zod";
import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProviderStatus } from "../../../assistant/protocol";
import { assistantInstructions } from "../../../assistant/tools";
import { imageAttachments } from "../attachments";
import { providerExecutable } from "../config";
import { projectMcp } from "./project-mcp";
import {
  currentProjectPrompt,
  type AssistantProvider,
  type ProviderInput,
} from "./types";

const modelsSchema = z.object({
  models: z.array(
    z.object({
      modelId: z.string(),
      displayLabel: z.string(),
      isDefault: z.boolean(),
      variants: z
        .union([z.array(z.string()), z.object({}).passthrough()])
        .optional(),
      reasoningEffortVariants: z
        .array(z.object({ tier: z.string() }))
        .optional(),
    }),
  ),
});

export function museHost(cwd: string) {
  const executable = providerExecutable("muse");
  if (!executable)
    throw new Error(
      "Set up Muse Code in Project CAD Assistant to install it and sign in.",
    );
  let inherited: string[] = [];
  try {
    const settings = JSON.parse(
      readFileSync(
        join(
          process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
          "muse",
          "settings.json",
        ),
        "utf8",
      ),
    );
    inherited = Object.keys(settings.mcpServers ?? settings.mcp_servers ?? {});
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error(
        "Muse Code settings could not be read. Repair them in Muse Code and retry.",
      );
  }
  return spawnMspConnection({
    command: executable,
    cwd,
    env: process.env,
    shutdownTimeoutMs: 1000,
    args: [
      "serve",
      "--preset",
      "empty",
      "--disable-shell",
      "--disable-write",
      "--disable-request-user-input",
      "-c",
      "hooks={}",
      ...inherited.flatMap((name) => [
        "-c",
        `mcpServers.${name}.enabled=false`,
      ]),
      "-c",
      'run.toolset=["mcp__project-cad__*"]',
    ],
  });
}

/** Reuse the user's Muse Code authentication and live model catalog. */
export class MuseProvider implements AssistantProvider {
  constructor(private cwd: string = homedir()) {}
  async status(): Promise<ProviderStatus> {
    const base = { id: "muse" as const, name: "Muse Code" };
    let host: ReturnType<typeof museHost> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      host = museHost(this.cwd);
      timer = setTimeout(() => void host?.close(), 15000);
      const client = await host.initialize({
        clientInfo: { name: "project_cad", version: "1.0.0" },
        capabilities: { experimentalApi: true },
      });
      const [account, catalog] = await Promise.all([
        client.connection.request("account/read", {}),
        client.connection.request("model/list", {}),
      ]);
      const available =
        account.state === "accountLogin" ||
        account.state === "apiKey" ||
        account.credentialRequired === false;
      return {
        ...base,
        available,
        message: available
          ? "Signed in through Muse Code."
          : "Sign in to Muse Code in Project CAD Assistant.",
        models: modelsSchema.parse(catalog).models.map((model) => ({
          id: model.modelId,
          name: model.displayLabel,
          default: model.isDefault,
          // Described tiers can be only a subset. `variants` is the full list.
          reasoning: Array.isArray(model.variants)
            ? model.variants
            : (model.reasoningEffortVariants?.map((e) => e.tier) ?? []),
        })),
      };
    } catch (error) {
      return {
        ...base,
        available: false,
        models: [],
        message:
          error instanceof Error ? error.message : "Muse Code is unavailable.",
      };
    } finally {
      clearTimeout(timer);
      await host?.close();
    }
  }
  async run(input: ProviderInput) {
    input.signal.throwIfAborted();
    // Read through the connected website on every turn, including resumed
    // sessions, so an older installed connector cannot supply a stale guide.
    const guide = await input.call("get_guide", {});
    input.signal.throwIfAborted();
    const prompt = await currentProjectPrompt(input);
    const bridge = await projectMcp(input);
    let host: ReturnType<typeof museHost> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      void host?.close();
    };
    input.signal.addEventListener("abort", stop, { once: true });
    try {
      host = museHost(input.cwd);
      timer = setTimeout(stop, 20000);
      const client = await host.initialize({
        clientInfo: { name: "project_cad", version: "1.0.0" },
        capabilities: {
          experimentalApi: true,
          requestedCapabilities: ["sessionMcp"],
        },
      });
      input.signal.throwIfAborted();
      const options = {
        modelId: input.conversation.model,
        config: { mcpServers: { "project-cad": bridge.config } },
      };
      const opened = await client.connection.command(
        input.conversation.providerSession ? "session/resume" : "session/start",
        input.conversation.providerSession
          ? {
              ...options,
              sessionId: input.conversation.providerSession,
              excludeItems: true,
            }
          : // This host can only call our scoped MCP tools. They read/preview;
            // applying a proposal still requires the application's user review.
            { ...options, workspaceRoot: input.cwd, approvalMode: "allowAll" },
      );
      clearTimeout(timer);
      const sessionId = z
        .object({ session: z.object({ sessionId: z.string() }) })
        .parse(opened).session.sessionId;
      const history = !input.conversation.providerSession
        ? input.conversation.runs?.slice(-12).map((run) => ({
            request: run.prompt,
            response: run.text.slice(-6000),
          }))
        : [];
      input.session(sessionId);
      const commandId = client.connection.mintCommandId();
      const streamed = new Map<string, string>();
      const done = Promise.withResolvers<void>();
      void done.promise.catch(() => {});
      client.connection.onNotification(({ method, params }) => {
        if (!params || params.sessionId !== sessionId) return;
        if (method === "item/started" || method === "item/completed") {
          const item = params.item as {
            kind?: string;
            itemId: string;
            turnId?: string;
            text?: string;
          };
          if (item?.kind !== "agentMessage" || item.turnId !== commandId)
            return;
          if (!streamed.has(item.itemId)) streamed.set(item.itemId, "");
          if (method === "item/completed" && item.text) {
            const previous = streamed.get(item.itemId)!;
            if (item.text.startsWith(previous))
              input.text(item.text.slice(previous.length));
            streamed.set(item.itemId, item.text);
          }
        }
        if (
          method === "item/delta" &&
          params.field === "text" &&
          typeof params.itemId === "string" &&
          streamed.has(params.itemId) &&
          typeof params.delta === "string"
        ) {
          streamed.set(
            params.itemId,
            streamed.get(params.itemId)! + params.delta,
          );
          input.text(params.delta);
        }
        if (method === "turn/completed" && params.turnId === commandId) {
          if (params.terminal === "completed") done.resolve();
          else
            done.reject(
              new Error(
                (params.error as { message?: string } | undefined)?.message ||
                  "Muse Code stopped before completing the request.",
              ),
            );
        }
        if (method === "approval/requested" || method === "userInput/requested")
          done.reject(
            new Error(
              "Muse Code requested an unsupported interactive action. Ask it to use the Project CAD tools.",
            ),
          );
      });
      void client.connection.closed.then(() =>
        done.reject(
          new Error("Muse Code disconnected before completing the request."),
        ),
      );
      await client.connection.command(
        "turn/start",
        {
          sessionId,
          ...(input.conversation.reasoning
            ? { reasoningEffort: input.conversation.reasoning }
            : {}),
          input: [
            {
              type: "text",
              text: `${assistantInstructions}\n\nCurrent Project CAD AI guide (refreshed for this turn; supersedes earlier guides):\n${JSON.stringify(guide)}\n\n${history?.length ? `Earlier conversation (data): ${JSON.stringify(history)}\n\n` : ""}${prompt}`,
            },
            ...imageAttachments(input.attachments).map((file) => ({
              type: "image",
              mediaType: file.type,
              base64Data: file.data,
            })),
          ],
        },
        { commandId },
      );
      await done.promise;
      input.signal.throwIfAborted();
    } finally {
      clearTimeout(timer);
      input.signal.removeEventListener("abort", stop);
      await host?.close();
      bridge.close();
    }
  }
}

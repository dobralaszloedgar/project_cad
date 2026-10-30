import { z } from "zod";
import {
  tools,
  toolNames,
  type ToolName,
  type ProviderStatus,
} from "../../../assistant/protocol";
import { assistantInstructions } from "../../../assistant/tools";
import {
  currentProjectPrompt,
  type AssistantProvider,
  type ProviderInput,
} from "./types";

export const MUSE_MODEL = "muse-spark-1.3";
const responseSchema = z.object({
  model: z.string(),
  status: z.string().optional(),
  output: z.array(z.record(z.string(), z.unknown())),
});
/** Stateless replay keeps the transcript local; provider-side response storage is disabled. */
export class MuseProvider implements AssistantProvider {
  async status(): Promise<ProviderStatus> {
    const available =
      process.env.META_AI_ENABLED === "true" &&
      !!process.env.MODEL_API_KEY &&
      (!process.env.META_MODEL || process.env.META_MODEL === MUSE_MODEL);
    return {
      id: "muse",
      name: "Muse",
      available,
      message: available
        ? "Muse API configured. Access is checked when you send a message."
        : "Open Project CAD Assistant settings and add your Muse API key, then refresh providers.",
      models: [{ id: MUSE_MODEL, name: "Muse Spark 1.3", default: true }],
    };
  }
  async run(input: ProviderInput) {
    if (!(await this.status()).available)
      throw new Error("Muse is not configured.");
    const prompt = await currentProjectPrompt(input);
    const history = [
      ...(input.conversation.providerContext || []),
      { role: "user", content: [{ type: "input_text", text: prompt }] },
    ];
    const toolDefinitions = toolNames
      .filter(
        (name) =>
          input.conversation.mode !== "read-only" || name !== "propose_actions",
      )
      .map((name) => ({
        type: "function",
        name,
        description: tools[name].description,
        parameters: z.toJSONSchema(tools[name].schema),
      }));
    for (let round = 0; round < 12; round++) {
      if (JSON.stringify(history).length > 1_500_000)
        throw new Error(
          "This conversation is full. Start a new conversation to continue.",
        );
      const response = await fetch("https://api.meta.ai/v1/responses", {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.MODEL_API_KEY}`,
        },
        body: JSON.stringify({
          model: MUSE_MODEL,
          instructions: assistantInstructions,
          input: history,
          tools: toolDefinitions,
          include: ["reasoning.encrypted_content"],
          max_output_tokens: 8000,
          store: false,
          stream: true,
        }),
        signal: AbortSignal.any([input.signal, AbortSignal.timeout(90000)]),
      });
      if (!response.ok)
        throw new Error(
          `Muse request failed (${response.status}). Check model access and API configuration.`,
        );
      if (!response.body) throw new Error("Muse returned no response.");
      let buffer = "",
        total = 0,
        final: unknown;
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > 2_000_000)
            throw new Error("Muse response exceeded the size limit.");
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() || "";
          for (const event of events) {
            const raw = event
              .split(/\r?\n/)
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (!raw || raw === "[DONE]") continue;
            const data = JSON.parse(raw);
            if (
              data.type === "response.output_text.delta" &&
              typeof data.delta === "string"
            )
              input.text(data.delta);
            if (data.type === "response.completed") final = data.response;
            if (
              ["error", "response.failed", "response.incomplete"].includes(
                data.type,
              )
            )
              throw new Error(
                "Muse could not finish this response. Try a shorter request.",
              );
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const result = responseSchema.parse(final);
      if (
        result.model !== MUSE_MODEL &&
        !result.model.startsWith(`${MUSE_MODEL}-`)
      )
        throw new Error("Muse returned an unexpected model identity.");
      history.push(...result.output);
      const calls = result.output.filter(
        (item) => item.type === "function_call",
      );
      for (const call of calls) {
        if (typeof call.call_id !== "string")
          throw new Error("Muse returned an invalid tool call.");
        let output: unknown;
        try {
          if (
            !toolNames.includes(call.name as ToolName) ||
            typeof call.arguments !== "string"
          )
            throw new Error("Unknown project tool.");
          output = await input.call(
            call.name as ToolName,
            JSON.parse(call.arguments),
          );
        } catch (error) {
          output = {
            error:
              error instanceof Error ? error.message : "Project tool failed.",
          };
        }
        history.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(output),
        });
      }
      input.context(history);
      if (!calls.length) return;
    }
    throw new Error(
      "Muse reached the tool limit. Send a follow-up to continue.",
    );
  }
}

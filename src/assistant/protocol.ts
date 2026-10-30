import { z } from "zod";
import { planSchema, type Plan } from "../domain/actions";

export const ASSISTANT_VERSION = 1;
export const ASSISTANT_ENDPOINT = "http://127.0.0.1:43118";
export const providerSchema = z.enum(["codex", "claude", "muse"]);
export type ProviderId = z.infer<typeof providerSchema>;
export const modeSchema = z.enum(["review", "read-only"]);
export type AssistantMode = z.infer<typeof modeSchema>;
export const projectIdSchema = z.string().min(1).max(100);
export const createChatSchema = z
  .object({
    projectId: projectIdSchema,
    projectName: z.string().min(1).max(100),
    provider: providerSchema,
    model: z.string().min(1).max(160),
    mode: modeSchema,
    reasoning: z.string().max(40).optional(),
  })
  .strict();
export const submitSchema = z
  .object({
    requestId: z.string().uuid(),
    message: z.string().trim().min(1).max(12000),
  })
  .strict();
export interface AssistantModel {
  id: string;
  name: string;
  default?: boolean;
  reasoning?: string[];
}
export interface ProviderStatus {
  id: ProviderId;
  name: string;
  available: boolean;
  message: string;
  models: AssistantModel[];
}
export interface ToolActivity {
  id: string;
  name: string;
  status: "running" | "done" | "error";
  message?: string;
}
export interface Proposal {
  id: string;
  projectId: string;
  baseRevision: string;
  plan: Plan;
  status: "pending" | "applied" | "dismissed";
  result?: string;
}
export interface AssistantRun {
  id: string;
  requestId: string;
  prompt: string;
  text: string;
  status: "running" | "completed" | "failed" | "cancelled" | "interrupted";
  activities: ToolActivity[];
  proposals: Proposal[];
  error?: string;
  createdAt: string;
}
export interface Conversation {
  id: string;
  projectId: string;
  title: string;
  provider: ProviderId;
  model: string;
  mode: AssistantMode;
  reasoning?: string;
  createdAt: string;
  updatedAt: string;
  runs: AssistantRun[];
}
export interface StoredConversation extends Conversation {
  origin: string;
  providerSession?: string;
  providerContext?: unknown[];
}
export interface ToolCommand {
  id: string;
  projectId: string;
  conversationId: string;
  runId: string;
  name: ToolName;
  arguments: unknown;
  mode: AssistantMode;
}
export type ConversationSummary = Pick<
  Conversation,
  "id" | "title" | "provider" | "updatedAt"
>;
export interface AssistantSnapshot {
  conversations: ConversationSummary[];
  conversation?: Conversation;
  commands: ToolCommand[];
}
export const tools = {
  get_project: {
    description:
      "Read the connected Project CAD project, current revision, equipment, streams and model settings. Read this before proposing changes.",
    schema: z.object({}).strict(),
  },
  get_capabilities: {
    description:
      "Read the available equipment, parameter units, action schema and calculation limits. Never assume unsupported chemistry or calculations.",
    schema: z.object({}).strict(),
  },
  preview_actions: {
    description:
      "Validate a proposed batch against the current project without applying it. Requires the revision from get_project.",
    schema: z
      .object({ baseRevision: z.string().length(64), plan: planSchema })
      .strict(),
  },
  simulate: {
    description:
      "Run the Project CAD solver against the current project or an optional proposed batch. Returns actual results, warnings and the source revision. Does not apply the batch.",
    schema: z
      .object({
        baseRevision: z.string().length(64),
        plan: planSchema.optional(),
      })
      .strict(),
  },
  propose_actions: {
    description:
      "Present a validated change batch for the user to review and apply in Project CAD. This does not edit the project or save a file. Available only in review mode.",
    schema: z
      .object({ baseRevision: z.string().length(64), plan: planSchema })
      .strict(),
  },
} as const;
export type ToolName = keyof typeof tools;
export const toolNames = Object.keys(tools) as ToolName[];
export const publicConversation = (value: StoredConversation): Conversation => {
  const { origin, providerSession, providerContext, ...publicValue } = value;
  void origin;
  void providerSession;
  void providerContext;
  return publicValue;
};

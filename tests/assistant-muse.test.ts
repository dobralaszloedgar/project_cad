import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderInput } from "../src/server/assistant/providers/types";
import type { StoredConversation } from "../src/assistant/protocol";
const fake = vi.hoisted(() => ({
  notifications: undefined as
    | undefined
    | ((n: { method: string; params: Record<string, unknown> }) => void),
  commands: [] as { method: string; params: Record<string, unknown> }[],
  launches: [] as { args: string[] }[],
  signedIn: true,
  hang: false,
  closed: undefined as undefined | (() => void),
}));
vi.mock("../src/server/assistant/config", () => ({
  providerExecutable: () => "/test/muse",
}));
vi.mock("@muse-code/sdk", () => ({
  spawnMspConnection: (options: { args: string[] }) => {
    fake.launches.push(options);
    const closed = new Promise<void>((resolve) => {
      fake.closed = resolve;
    });
    const connection = {
      closed,
      mintCommandId: () => "turn-one",
      onNotification: (fn: typeof fake.notifications) => {
        fake.notifications = fn;
      },
      request: async (method: string) =>
        method === "account/read"
          ? {
              state: fake.signedIn ? "accountLogin" : "loggedOut",
              credentialRequired: true,
            }
          : {
              models: [
                {
                  modelId: "spark",
                  displayLabel: "Spark",
                  isDefault: true,
                  variants: ["low", "high"],
                  reasoningEffortVariants: [{ tier: "high" }],
                },
                {
                  modelId: "wonder",
                  displayLabel: "Wonder",
                  isDefault: false,
                  reasoningEffortVariants: [{ tier: "medium" }],
                },
              ],
            },
      command: async (method: string, params: Record<string, unknown>) => {
        fake.commands.push({ method, params });
        if (method !== "turn/start")
          return { session: { sessionId: "muse-session" } };
        if (!fake.hang)
          queueMicrotask(() => {
            const send = (method: string, params: Record<string, unknown>) =>
              fake.notifications?.({
                method,
                params: { sessionId: "muse-session", ...params },
              });
            send("item/started", {
              item: {
                kind: "agentMessage",
                itemId: "answer",
                turnId: "turn-one",
                text: "",
              },
            });
            send("item/delta", {
              itemId: "answer",
              field: "text",
              delta: "Hello",
            });
            send("item/completed", {
              item: {
                kind: "agentMessage",
                itemId: "answer",
                turnId: "turn-one",
                text: "Hello world",
              },
            });
            send("turn/completed", {
              turnId: "turn-one",
              terminal: "completed",
            });
          });
        return { turnId: "turn-one" };
      },
    };
    return {
      initialize: async () => ({ connection }),
      close: async () => {
        fake.closed?.();
      },
    };
  },
}));
import { MuseProvider } from "../src/server/assistant/providers/muse";
import {
  projectMcp,
  museToolSchema,
} from "../src/server/assistant/providers/project-mcp";
const roots: string[] = [];
function input(mode = "review") {
  const cwd = mkdtempSync(join(tmpdir(), "pcad-muse-"));
  roots.push(cwd);
  const controller = new AbortController(),
    text = vi.fn(),
    call = vi.fn<(name: unknown, args: unknown) => Promise<{ name: string }>>(
      async () => ({ name: "fixture" }),
    );
  const conversation = {
    model: "wonder",
    reasoning: "medium",
    mode,
    runs: [],
  } as unknown as StoredConversation;
  const value: ProviderInput = {
    cwd,
    conversation,
    prompt: "Read the project",
    signal: controller.signal,
    text,
    call,
    session: (id) => {
      conversation.providerSession = id;
    },
    context: () => {},
  };
  return { value, controller, text, call };
}
afterEach(() => {
  fake.commands = [];
  fake.launches = [];
  fake.signedIn = true;
  fake.hang = false;
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
it("discovers Muse Code's models and sign-in instead of pinning Spark or requiring a stored API key", async () => {
  const status = await new MuseProvider().status();
  expect(status.available).toBe(true);
  expect(status.models).toEqual([
    { id: "spark", name: "Spark", default: true, reasoning: ["low", "high"] },
    { id: "wonder", name: "Wonder", default: false, reasoning: ["medium"] },
  ]);
  fake.signedIn = false;
  expect((await new MuseProvider().status()).available).toBe(false);
});
it("uses the selected model and effort, streams once, and resumes the same Muse session", async () => {
  const { value, text } = input();
  const provider = new MuseProvider(value.cwd);
  await provider.run(value);
  expect(text.mock.calls.flat().join("")).toBe("Hello world");
  expect(fake.commands[0]).toMatchObject({
    method: "session/start",
    params: { modelId: "wonder", workspaceRoot: value.cwd },
  });
  expect(fake.commands[1]).toMatchObject({
    method: "turn/start",
    params: { reasoningEffort: "medium" },
  });
  expect(fake.launches[0].args).toEqual(
    expect.arrayContaining([
      "--disable-shell",
      "--disable-write",
      'run.toolset=["mcp__project-cad__*"]',
    ]),
  );
  await provider.run(value);
  expect(fake.commands[2]).toMatchObject({
    method: "session/resume",
    params: { sessionId: "muse-session", modelId: "wonder" },
  });
});
it("closes a running Muse host when cancelled", async () => {
  fake.hang = true;
  const { value, controller } = input();
  const running = new MuseProvider(value.cwd).run(value);
  await vi.waitFor(() =>
    expect(fake.commands.some((c) => c.method === "turn/start")).toBe(true),
  );
  controller.abort();
  await expect(running).rejects.toThrow(/disconnected|abort/i);
});
it("refreshes the website AI guide on every turn, including a resumed session", async () => {
  const { value, call } = input();
  let version = "latest-guide-one";
  call.mockImplementation(async (name?: unknown) => ({
    name: name === "get_guide" ? version : "project",
  }));
  const provider = new MuseProvider(value.cwd);
  await provider.run(value);
  version = "latest-guide-two";
  await provider.run(value);
  const turns = fake.commands.filter(
    (command) => command.method === "turn/start",
  );
  expect(JSON.stringify(turns[0])).toContain("latest-guide-one");
  expect(JSON.stringify(turns[1])).toContain("latest-guide-two");
  expect(JSON.stringify(turns[1])).not.toContain("latest-guide-one");
  expect(call.mock.calls.filter(([name]) => name === "get_guide")).toHaveLength(
    2,
  );
});
it("protects project MCP tools, validates JSON plans and withholds write proposals in read-only mode", async () => {
  const { value, call } = input("read-only");
  const bridge = await projectMcp(value);
  const request = (
    method: string,
    params: unknown = {},
    headers = bridge.config.headers,
  ) =>
    fetch(bridge.config.url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
  try {
    expect(
      (await request("tools/list", {}, {} as typeof bridge.config.headers))
        .status,
    ).toBe(403);
    const list = await (await request("tools/list")).json();
    expect(
      list.result.tools.some(
        (t: { name: string }) => t.name === "propose_actions",
      ),
    ).toBe(false);
    expect(museToolSchema("preview_actions").properties?.plan).toMatchObject({
      type: "string",
    });
    const denied = await (
      await request("tools/call", { name: "propose_actions", arguments: {} })
    ).json();
    expect(denied.error).toBeTruthy();
    const invalid = await (
      await request("tools/call", {
        name: "preview_actions",
        arguments: {
          baseRevision: "a".repeat(64),
          plan: '{"summary":"test","actions":[{"type":"unknown"}]}',
        },
      })
    ).json();
    expect(invalid.result.isError).toBe(true);
    expect(call).not.toHaveBeenCalled();
    const result = await (
      await request("tools/call", { name: "get_project", arguments: {} })
    ).json();
    expect(result.result.content[0].text).toContain("fixture");
    expect(call).toHaveBeenCalledWith("get_project", {});
  } finally {
    bridge.close();
  }
});

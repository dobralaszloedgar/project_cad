// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
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
  defaultProjectsDirectory: "unused-default",
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
import { ProjectFiles } from "../src/server/assistant/project-files";
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
    context: (items) => {
      conversation.providerContext = items;
    },
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
  const provider = new MuseProvider(value.cwd, () => ({
    accessMode: "yolo",
    projectsDirectory: value.cwd,
  }));
  await provider.run(value);
  expect(text.mock.calls.flat().join("")).toBe("Hello world");
  expect(fake.commands[0]).toMatchObject({
    method: "session/start",
    params: { modelId: "wonder", workspaceRoot: realpathSync(value.cwd) },
  });
  expect(fake.commands[1]).toMatchObject({
    method: "turn/start",
    params: { reasoningEffort: "medium" },
  });
  expect(fake.launches[0].args).toEqual(
    expect.arrayContaining([
      "--disable-sandbox",
      "--trust-workspace",
      "native-basic",
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
  const running = new MuseProvider(value.cwd, () => ({
    accessMode: "yolo",
    projectsDirectory: value.cwd,
  })).run(value);
  await vi.waitFor(() =>
    expect(fake.commands.some((c) => c.method === "turn/start")).toBe(true),
  );
  controller.abort();
  await expect(running).rejects.toThrow(/disconnected|abort/i);
});

it("loads Muse's guide and current project concurrently before starting the model", async () => {
  const { value, call } = input();
  const guide = Promise.withResolvers<{ name: string }>();
  const project = Promise.withResolvers<{ name: string }>();
  call.mockImplementation((name) =>
    name === "get_guide" ? guide.promise : project.promise,
  );
  const running = new MuseProvider(value.cwd, () => ({
    accessMode: "sandbox",
    projectsDirectory: value.cwd,
  })).run(value);
  expect(call.mock.calls.map(([name]) => name)).toEqual([
    "get_guide",
    "get_project",
  ]);
  expect(fake.launches).toHaveLength(0);
  project.resolve({ name: "Fresh project" });
  guide.resolve({ name: "Current guide" });
  await running;
  const turn = fake.commands.find((command) => command.method === "turn/start");
  expect(JSON.stringify(turn)).toContain("Fresh project");
  expect(JSON.stringify(turn)).toContain("Current guide");
});

it("keeps sandbox folder/web access without shell and never resumes a YOLO session after switching", async () => {
  const { value } = input("auto");
  let accessMode: "yolo" | "sandbox" = "yolo";
  let projectsDirectory = value.cwd;
  const provider = new MuseProvider(value.cwd, () => ({
    accessMode,
    projectsDirectory,
  }));
  await provider.run(value);
  accessMode = "sandbox";
  await provider.run(value);
  expect(
    fake.commands.filter((item) => item.method === "session/resume"),
  ).toHaveLength(0);
  expect(
    fake.commands.filter((item) => item.method === "session/start"),
  ).toHaveLength(2);
  const args = fake.launches[1].args;
  expect(args).toContain("--disable-shell");
  expect(args).toContain("--disable-write");
  expect(args).not.toContain("--disable-sandbox");
  expect(args).toContain(
    'run.toolset=["web_search","web_fetch","mcp__project-cad__*"]',
  );
  await provider.run(value);
  expect(fake.commands).toContainEqual({
    method: "session/setApprovalMode",
    params: { sessionId: "muse-session", mode: "allowAll" },
  });
  projectsDirectory = join(value.cwd, "another-project-folder");
  await provider.run(value);
  expect(
    fake.commands.filter((item) => item.method === "session/start"),
  ).toHaveLength(3);
});
it("refreshes the website AI guide on every turn, including a resumed session", async () => {
  const { value, call } = input();
  let version = "latest-guide-one";
  call.mockImplementation(async (name?: unknown) => ({
    name: name === "get_guide" ? version : "project",
    ...(name === "get_guide"
      ? { content: `PROJECT CAD AI GUIDE\n${version}` }
      : {}),
  }));
  const provider = new MuseProvider(value.cwd, () => ({
    accessMode: "sandbox",
    projectsDirectory: value.cwd,
  }));
  await provider.run(value);
  version = "latest-guide-two";
  await provider.run(value);
  const turns = fake.commands.filter(
    (command) => command.method === "turn/start",
  );
  expect(JSON.stringify(turns[0])).toContain("latest-guide-one");
  expect(JSON.stringify(turns[1])).toContain("latest-guide-two");
  expect(JSON.stringify(turns[1])).not.toContain("latest-guide-one");
  const messages = turns.map(
    (turn) => (turn.params.input as { text: string }[])[0].text,
  );
  for (const message of messages) {
    expect(message.match(/PROJECT CAD AI GUIDE/g)).toHaveLength(1);
    expect(message).toContain("MUSE CODE TOOL ADAPTER");
    expect(message).toContain("plan\nencoded as a JSON STRING");
    expect(message).toContain("apply small coherent batches as you build");
    expect(message).toContain("catalogRef");
  }
  expect(call.mock.calls.filter(([name]) => name === "get_guide")).toHaveLength(
    2,
  );
});
it("protects project MCP tools, validates JSON plans and withholds write proposals in read-only mode", async () => {
  const { value, call } = input("read-only");
  const bridge = await projectMcp(value, new ProjectFiles(value.cwd));
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
    expect(list.result.tools.map((t: { name: string }) => t.name)).toContain(
      "read_project_file",
    );
    expect(
      list.result.tools.map((t: { name: string }) => t.name),
    ).not.toContain("write_project_file");
    expect(
      list.result.tools.map((t: { name: string }) => t.name),
    ).not.toContain("delete_project_file");
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

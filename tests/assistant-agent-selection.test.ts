import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  agentSelectionSchema,
  PROJECT_CAD_ORIGIN,
  type AgentSelection,
  type ProviderId,
} from "../src/assistant/protocol";
import {
  assistantOrigins,
  loadAssistantSettings,
  saveAssistantSettings,
} from "../src/server/assistant/config";
import { AssistantRuntime } from "../src/server/assistant/runtime";
import { AssistantStore } from "../src/server/assistant/store";
import { createAssistantServer } from "../src/server/assistant/http";
import type { AssistantProvider } from "../src/server/assistant/providers/types";

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "project-cad-agents-"));
  const store = new AssistantStore(join(root, "history.sqlite"));
  let agents: AgentSelection | null = null;
  const status = Object.fromEntries(
    (["codex", "claude", "muse"] as ProviderId[]).map((id) => [
      id,
      vi.fn(async () => ({
        id,
        name: id,
        available: true,
        message: "Test agent",
        models: [{ id: "test", name: "Test model" }],
      })),
    ]),
  );
  const adapters = Object.fromEntries(
    Object.entries(status).map(([id, status]) => [
      id,
      { status, run: async () => {} },
    ]),
  ) as unknown as Record<ProviderId, AssistantProvider>;
  const runtime = new AssistantRuntime(store, adapters, root, () => agents);
  const select = vi.fn((value: AgentSelection) => {
    agents = value;
    saveAssistantSettings(root, { ...loadAssistantSettings(root), agents });
  });
  cleanup.push(() => {
    runtime.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  return { root, runtime, status, select };
}

it("automatically selects Muse, migrates legacy settings, and accepts the exact hosted origin", () => {
  const { root } = fixture();
  expect(loadAssistantSettings(root)).toMatchObject({
    websiteUrl: PROJECT_CAD_ORIGIN,
    agents: { providers: ["muse"], preferred: "muse" },
  });
  writeFileSync(
    join(root, "settings.json"),
    JSON.stringify({
      websiteUrl: "http://127.0.0.1:3000",
      startAtLogin: false,
      museApiKey: "private-test-key",
    }),
  );
  const previous = loadAssistantSettings(root);
  const agents = {
    providers: ["claude", "muse"],
    preferred: "claude",
  } as AgentSelection;
  saveAssistantSettings(root, { ...previous, agents });
  expect(loadAssistantSettings(root)).toEqual({
    ...previous,
    agents: { providers: ["muse"], preferred: "muse" },
  });
  const origins = assistantOrigins(previous.websiteUrl);
  expect(origins).toContain(PROJECT_CAD_ORIGIN);
  expect(origins).toContain("http://127.0.0.1:3000");
  expect(origins).not.toContain("https://projectcad.vercel.app.evil.example");
  expect(assistantOrigins(previous.websiteUrl, "https://only.example")).toEqual(
    ["https://only.example"],
  );
});

it("rejects empty, duplicate, unknown and mismatched default selections", () => {
  for (const value of [
    { providers: [], preferred: "codex" },
    { providers: ["codex", "codex"], preferred: "codex" },
    { providers: ["other"], preferred: "other" },
    { providers: ["claude"], preferred: "codex" },
  ])
    expect(agentSelectionSchema.safeParse(value).success).toBe(false);
  expect(
    agentSelectionSchema.parse({
      providers: ["muse", "claude"],
      preferred: "claude",
    }),
  ).toEqual({ providers: ["muse", "claude"], preferred: "claude" });
});

it("only discovers selected agents and preserves history when an agent is deselected", async () => {
  const { runtime, status, select } = fixture();
  expect(await runtime.providers()).toEqual([]);
  expect(status.codex).not.toHaveBeenCalled();
  select({ providers: ["claude"], preferred: "claude" });
  expect((await runtime.providers()).map((value) => value.id)).toEqual([
    "claude",
  ]);
  expect(status.codex).not.toHaveBeenCalled();
  expect(status.muse).not.toHaveBeenCalled();
  const scope = {
    origin: PROJECT_CAD_ORIGIN,
    projectId: "one",
    clientId: crypto.randomUUID(),
  };
  runtime.snapshot(scope);
  const chat = await runtime.create(scope, {
    projectId: "one",
    projectName: "Test",
    provider: "claude",
    model: "test",
    mode: "review",
  });
  select({ providers: ["muse"], preferred: "muse" });
  expect((await runtime.providers()).map((value) => value.id)).toEqual([
    "muse",
  ]);
  expect(runtime.snapshot(scope, chat.id).conversation?.provider).toBe(
    "claude",
  );
  expect(() =>
    runtime.start(scope, chat.id, {
      requestId: crypto.randomUUID(),
      message: "Hello",
    }),
  ).toThrow("not selected");
});

it("saves selections only after local approval and gives rejected origins a readable recovery page", async () => {
  const { root, runtime, select } = fixture();
  const server = createAssistantServer(runtime, {
    port: 0,
    origins: [PROJECT_CAD_ORIGIN],
    selectAgents: select,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const nonce = crypto.randomUUID();
  const url = (origin = PROJECT_CAD_ORIGIN, preferred = "muse") =>
    `${endpoint}/connect?${new URLSearchParams({ origin, nonce, providers: "muse", preferred })}`;
  const rejected = await fetch(url("https://unconfigured.example"));
  expect(rejected.status).toBe(403);
  expect(rejected.headers.get("content-type")).toContain("text/html");
  expect(rejected.headers.get("referrer-policy")).toBe("same-origin");
  const errorPage = await rejected.text();
  expect(errorPage).toContain("Enable this Project CAD website");
  expect(errorPage).toContain("project-cad-assistant-error");
  expect(errorPage).not.toContain('"token":');
  expect((await fetch(url(PROJECT_CAD_ORIGIN, "codex"))).status).toBe(400);
  const consent = await (await fetch(url())).text();
  expect(consent).toContain("Muse Code");
  expect(select).not.toHaveBeenCalled();
  expect(loadAssistantSettings(root).agents).toEqual({
    providers: ["muse"],
    preferred: "muse",
  });
  const csrf = consent.match(/name="csrf" value="([a-f0-9]+)"/)![1];
  const approve = (origin: string) =>
    fetch(endpoint + "/connect", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `csrf=${csrf}`,
    });
  expect((await approve(PROJECT_CAD_ORIGIN)).status).toBe(403);
  expect(select).not.toHaveBeenCalled();
  const approved = await (await approve(endpoint)).text();
  const agents: AgentSelection = { providers: ["muse"], preferred: "muse" };
  expect(select).toHaveBeenCalledExactlyOnceWith(agents);
  expect(loadAssistantSettings(root).agents).toEqual(agents);
  const token = approved.match(/"token":"([\w-]+)"/)![1];
  const headers = {
    Origin: PROJECT_CAD_ORIGIN,
    Authorization: `Bearer ${token}`,
    "X-Project-CAD-Client": crypto.randomUUID(),
  };
  const state = await (
    await fetch(endpoint + "/state?projectId=one", { headers })
  ).json();
  expect(state.agents).toEqual(agents);
  expect(
    await (await fetch(endpoint + "/providers", { headers })).json(),
  ).toMatchObject([{ id: "muse" }]);
  expect(await (await approve(endpoint)).text()).toContain(
    "Connection expired",
  );
  expect(select).toHaveBeenCalledTimes(1);
});

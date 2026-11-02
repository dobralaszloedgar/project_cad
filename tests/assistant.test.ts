import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AssistantRuntime } from "../src/server/assistant/runtime";
import { AssistantStore } from "../src/server/assistant/store";
import type {
  AssistantProvider,
  ProviderInput,
} from "../src/server/assistant/providers/types";
import { currentProjectPrompt } from "../src/server/assistant/providers/types";
import type { ProviderId, StoredConversation } from "../src/assistant/protocol";
import { executeProjectTool, projectRevision } from "../src/assistant/tools";
import { heatingExample } from "../src/domain/examples";
import { projectSchema } from "../src/domain/schema";
import { createAssistantServer } from "../src/server/assistant/http";
import { vi } from "vitest";
import {
  codexSessionState,
  toolContractHash,
} from "../src/server/assistant/providers/tool-contract";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const scope = () => ({
  origin: "http://127.0.0.1:3000",
  projectId: "project-one",
  clientId: crypto.randomUUID(),
});
function setup(
  run: (input: ProviderInput) => Promise<void> = async (input) => {
    input.text("Done.");
  },
) {
  const root = mkdtempSync(join(tmpdir(), "project-cad-runtime-test-")),
    store = new AssistantStore(join(root, "history.sqlite"));
  const adapters = Object.fromEntries(
    (["codex", "claude", "muse"] as ProviderId[]).map((id) => [
      id,
      {
        status: async () => ({
          id,
          name: id,
          available: true,
          message: "Test adapter",
          models: [
            { id: "test-model", name: "Test model", reasoning: ["low"] },
          ],
        }),
        run,
      },
    ]),
  ) as Record<ProviderId, AssistantProvider>;
  const runtime = new AssistantRuntime(store, adapters, root);
  cleanup.push(() => {
    runtime.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const owner = scope();
  runtime.snapshot(owner);
  const create = (mode: "review" | "read-only" = "review") =>
    runtime.create(owner, {
      projectId: owner.projectId,
      projectName: "Test",
      provider: "codex",
      model: "test-model",
      mode,
    });
  return { runtime, store, owner, create, root };
}
async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

describe("project tools", () => {
  it("refreshes stale Codex tool definitions and carries recent intent without losing application history", async () => {
    const { create } = setup();
    const chat = await create();
    const stored = {
      ...chat,
      origin: "http://127.0.0.1:3000",
      providerSession: "old-thread",
      runs: [
        {
          id: "run",
          requestId: "request",
          prompt: "Keep the existing reflux ratio",
          text: "I will change only the tower diameter.",
          status: "completed" as const,
          activities: [],
          proposals: [],
          createdAt: new Date().toISOString(),
        },
      ],
    };
    const before = structuredClone(stored);
    const fresh = codexSessionState(stored);
    expect(fresh.resume).toBeUndefined();
    expect(fresh.history).toContain("Keep the existing reflux ratio");
    expect(fresh.context).toEqual([
      { projectCadToolContract: toolContractHash },
    ]);
    expect(stored).toEqual(before);
    const current = codexSessionState({
      ...stored,
      providerContext: fresh.context,
    });
    expect(current.resume).toBe("old-thread");
    expect(current.history).toBe("");
    expect(
      codexSessionState({
        ...stored,
        providerContext: [{ projectCadToolContract: "old" }],
      }).resume,
    ).toBeUndefined();
  });
  it("refreshes the project before every native-provider turn", async () => {
    const project = heatingExample();
    const input = {
      prompt: "What is the current project?",
      signal: new AbortController().signal,
      call: (name, args) =>
        executeProjectTool(name, args, {
          projectId: "one",
          project,
          mode: "read-only",
        }),
    } as ProviderInput;
    expect(await currentProjectPrompt(input)).toContain("Simple heating");
    project.name = "Updated project";
    const next = await currentProjectPrompt(input);
    expect(next).toContain("Updated project");
    expect(next).not.toContain("Simple heating");
  });
  it("uses canonical revisions and never mutates a project while previewing or calculating", async () => {
    const project = heatingExample(),
      context = { projectId: "one", project, mode: "review" as const },
      before = JSON.stringify(project);
    const read = await executeProjectTool("get_project", {}, context);
    expect(read).toMatchObject({
      projectId: "one",
      revision: await projectRevision(project),
    });
    const plan = {
      summary: "Warmer heater",
      actions: [
        { type: "update" as const, id: "H-301", params: { temperature: 510 } },
      ],
    };
    const baseRevision = await projectRevision(project);
    expect(await projectRevision(projectSchema.parse(project))).toBe(
      baseRevision,
    );
    expect(
      await executeProjectTool(
        "preview_actions",
        { baseRevision, plan },
        context,
      ),
    ).toMatchObject({ applied: false });
    expect(
      await executeProjectTool("simulate", { baseRevision, plan }, context),
    ).toHaveProperty("result");
    expect(JSON.stringify(project)).toBe(before);
    await expect(
      executeProjectTool(
        "propose_actions",
        { baseRevision: "0".repeat(64), plan },
        context,
      ),
    ).rejects.toThrow("project changed");
    await expect(
      executeProjectTool(
        "propose_actions",
        { baseRevision, plan },
        { ...context, mode: "read-only" },
      ),
    ).rejects.toThrow("read-only");
    const capabilities = await executeProjectTool(
      "get_capabilities",
      {},
      context,
    );
    expect(capabilities).toHaveProperty("actionSchema");
  });
});
describe("assistant runtime", () => {
  it("keeps one run per project, delivers scoped tools, and deduplicates retried messages", async () => {
    const { runtime, owner, create } = setup(async (input) => {
      const value = await input.call("get_project", {});
      input.text(JSON.stringify(value));
    });
    const chat = await create(),
      request = { requestId: crypto.randomUUID(), message: "Read project" };
    runtime.start(owner, chat.id, request);
    runtime.start(owner, chat.id, request);
    const snapshot = runtime.snapshot(owner, chat.id);
    expect(snapshot.conversation?.runs).toHaveLength(1);
    expect(snapshot.commands).toHaveLength(1);
    expect(() =>
      runtime.start(owner, chat.id, {
        ...request,
        requestId: crypto.randomUUID(),
      }),
    ).toThrow("running request");
    const other = { ...scope(), projectId: "different" };
    runtime.snapshot(other);
    expect(() =>
      runtime.answer(other, snapshot.commands[0].id, { value: "wrong" }),
    ).toThrow("another project");
    runtime.answer(owner, snapshot.commands[0].id, {
      value: { name: "Current project" },
    });
    await tick();
    expect(
      runtime.snapshot(owner, chat.id).conversation?.runs[0],
    ).toMatchObject({
      status: "completed",
      text: '{"name":"Current project"}',
    });
    expect(() =>
      runtime.snapshot({ ...owner, clientId: crypto.randomUUID() }),
    ).toThrow("another tab");
    expect(() => runtime.snapshot(other, chat.id)).toThrow("not found");
  });
  it("persists reviewed proposals without applying and records decisions once", async () => {
    const project = heatingExample(),
      baseRevision = await projectRevision(project);
    const plan = {
      summary: "Warm the heater",
      actions: [
        { type: "update" as const, id: "H-301", params: { temperature: 510 } },
      ],
    };
    const { runtime, owner, create } = setup(async (input) => {
      await input.call("propose_actions", { baseRevision, plan });
    });
    const chat = await create();
    runtime.start(owner, chat.id, {
      requestId: crypto.randomUUID(),
      message: "Warm it",
    });
    const command = runtime.snapshot(owner, chat.id).commands[0];
    runtime.answer(owner, command.id, {
      value: await executeProjectTool(command.name, command.arguments, {
        projectId: owner.projectId,
        project,
        mode: "review",
      }),
    });
    await tick();
    const proposal = runtime.snapshot(owner, chat.id).conversation!.runs[0]
      .proposals[0];
    expect(proposal.status).toBe("pending");
    runtime.decide(
      owner,
      chat.id,
      proposal.id,
      "applied",
      "Applied and saved.",
    );
    runtime.decide(owner, chat.id, proposal.id, "dismissed", "Late retry");
    expect(
      runtime.snapshot(owner, chat.id).conversation!.runs[0].proposals[0],
    ).toMatchObject({ status: "applied", result: "Applied and saved." });
  });
  it("cancels pending project calls on detach and blocks proposals in read-only mode", async () => {
    const { runtime, owner, create } = setup(async (input) => {
      await input.call("get_project", {});
    });
    const chat = await create();
    runtime.start(owner, chat.id, {
      requestId: crypto.randomUUID(),
      message: "Read",
    });
    runtime.detach(owner);
    await tick();
    expect(
      runtime.snapshot(owner, chat.id).conversation!.runs[0],
    ).toMatchObject({ status: "cancelled", activities: [{ status: "error" }] });
    expect(runtime.snapshot(owner).commands).toHaveLength(0);
    const second = setup(async (input) => {
      await input.call("propose_actions", {
        baseRevision: "0".repeat(64),
        plan: { summary: "No edits", actions: [] },
      });
    });
    const readonly = await second.create("read-only");
    second.runtime.start(second.owner, readonly.id, {
      requestId: crypto.randomUUID(),
      message: "Try to edit",
    });
    await tick();
    expect(
      second.runtime.snapshot(second.owner, readonly.id).conversation!.runs[0],
    ).toMatchObject({
      status: "failed",
      error: "This conversation is read-only.",
    });
  });
  it("marks unfinished runs interrupted on restart and keeps private provider state out of browser snapshots", async () => {
    const { store, runtime, root, owner, create } = setup();
    const chat = await create();
    const saved = store.get(chat.id, owner.origin, owner.projectId);
    saved.providerSession = "private-session";
    saved.providerContext = [{ secret: "opaque-context" }];
    saved.runs.push({
      id: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      prompt: "Read",
      text: "Partial",
      status: "running",
      activities: [],
      proposals: [],
      createdAt: new Date().toISOString(),
    });
    store.save(saved);
    const reopened = new AssistantStore(join(root, "history.sqlite"));
    expect(
      reopened.get(chat.id, owner.origin, owner.projectId).runs[0].status,
    ).toBe("interrupted");
    reopened.close();
    const publicValue = JSON.stringify(runtime.snapshot(owner, chat.id));
    expect(publicValue).not.toContain("private-session");
    expect(publicValue).not.toContain("opaque-context");
  });
});

it("requires explicit connection, binds tokens to an allowed origin, and rejects malformed requests", async () => {
  const { runtime } = setup();
  const origin = "http://127.0.0.1:3000";
  const server = createAssistantServer(runtime, { port: 0, origins: [origin] });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  cleanup.unshift(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const headers = {
    Origin: origin,
    "X-Project-CAD-Client": crypto.randomUUID(),
  };
  expect((await fetch(`${base}/state?projectId=one`, { headers })).status).toBe(
    401,
  );
  expect(
    (
      await fetch(
        `${base}/connect?origin=https://example.com&nonce=${crypto.randomUUID()}`,
      )
    ).status,
  ).toBe(403);
  const consent = await (
    await fetch(
      `${base}/connect?origin=${encodeURIComponent(origin)}&nonce=${crypto.randomUUID()}`,
    )
  ).text();
  const csrf = consent.match(/name="csrf" value="([a-f0-9]+)"/)![1];
  const approved = await (
    await fetch(`${base}/connect`, {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `csrf=${csrf}`,
    })
  ).text();
  const token = approved.match(/"token":"([\w-]+)"/)![1];
  expect(
    (
      await fetch(`${base}/state?projectId=one`, {
        headers: { ...headers, Authorization: `Bearer ${token}` },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await fetch(`${base}/state?projectId=one`, {
        headers: {
          ...headers,
          Origin: "https://example.com",
          Authorization: `Bearer ${token}`,
        },
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await fetch(`${base}/send?projectId=one`, {
        method: "POST",
        headers: {
          ...headers,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
  ).toBe(400);
});

it("stores original attachments without exposing bytes in polling and deduplicates retries", async () => {
  let received: ProviderInput | undefined;
  const { runtime, owner, create, root } = setup(async (input) => {
    received = input;
    input.text("File received.");
  });
  const chat = await create();
  const data = Buffer.from("component,flow\nwater,25");
  const attachment = {
    id: crypto.randomUUID(),
    name: "../../feed.csv",
    type: "text/csv",
    size: data.length,
    data: data.toString("base64"),
  };
  const request = {
    requestId: crypto.randomUUID(),
    message: "Read the attached file",
    attachments: [attachment],
  };
  const started = runtime.start(owner, chat.id, request);
  expect(started.runs[0].attachments).toEqual([
    {
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      size: data.length,
    },
  ]);
  await tick();
  expect(received?.attachments).toEqual([attachment]);
  expect(JSON.stringify(runtime.snapshot(owner, chat.id))).not.toContain(
    attachment.data,
  );
  expect(runtime.start(owner, chat.id, request).runs).toHaveLength(1);
  const { readFileSync } = await import("node:fs");
  expect(
    readFileSync(
      join(
        root,
        "sessions",
        chat.id,
        request.requestId,
        attachment.id + ".attachment",
      ),
    ),
  ).toEqual(data);
  expect(() =>
    runtime.snapshot({ ...owner, projectId: "another" }, chat.id),
  ).toThrow("Conversation not found");
});

it("renames and archives conversations without losing history or crossing project scopes", async () => {
  const { runtime, owner, create } = setup();
  const chat = await create();
  runtime.start(owner, chat.id, {
    requestId: crypto.randomUUID(),
    message: "Inspect this project",
  });
  await tick();
  const renamed = runtime.updateConversation(owner, chat.id, {
    title: "Review",
    archived: true,
  });
  expect(renamed).toMatchObject({ title: "Review", archived: true });
  expect(renamed.runs).toHaveLength(1);
  expect(runtime.snapshot(owner).conversations[0]).toMatchObject({
    title: "Review",
    archived: true,
  });
  expect(
    runtime.updateConversation(owner, chat.id, { archived: false }).runs,
  ).toHaveLength(1);
  const other = { ...owner, projectId: "other-project" };
  runtime.snapshot(other);
  expect(() =>
    runtime.updateConversation(other, chat.id, { title: "Wrong" }),
  ).toThrow();
});

it("lets a newly approved tab take an idle project without interrupting an active run", async () => {
  const idle = setup();
  const next = { ...idle.owner, clientId: crypto.randomUUID() };
  idle.runtime.attach(next);
  expect(() => idle.runtime.snapshot(next)).not.toThrow();
  expect(() => idle.runtime.snapshot(idle.owner)).toThrow("another tab");
  const busy = setup(async (input) => {
    await new Promise<void>((resolve) =>
      input.signal.addEventListener("abort", () => resolve(), { once: true }),
    );
  });
  const chat = await busy.create();
  busy.runtime.start(busy.owner, chat.id, {
    requestId: crypto.randomUUID(),
    message: "Work",
  });
  await tick();
  expect(() =>
    busy.runtime.attach({ ...busy.owner, clientId: crypto.randomUUID() }),
  ).toThrow("still working");
  busy.runtime.detach(busy.owner);
  await tick();
});

import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConnectionRequests } from "../src/server/assistant/connections";
import { createAssistantServer } from "../src/server/assistant/http";
import { AssistantRuntime } from "../src/server/assistant/runtime";
import { AssistantStore } from "../src/server/assistant/store";
import type { AgentSelection, ProviderId } from "../src/assistant/protocol";
import type { AssistantProvider } from "../src/server/assistant/providers/types";

const origin = "https://projectcad.vercel.app";
const otherOrigin = "https://another-project.example";
const agents: AgentSelection = { providers: ["codex"], preferred: "codex" };
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "project-cad-consent-"));
  const requests = new ConnectionRequests(root);
  const store = new AssistantStore(join(root, "history.sqlite"));
  const adapters = Object.fromEntries(
    (["codex", "claude", "muse"] as ProviderId[]).map((id) => [
      id,
      {
        status: async () => ({
          id,
          name: id,
          available: true,
          message: "Test",
          models: [],
        }),
        run: async () => {},
      },
    ]),
  ) as unknown as Record<ProviderId, AssistantProvider>;
  const runtime = new AssistantRuntime(store, adapters, root);
  const selectAgents = vi.fn();
  const server = createAssistantServer(runtime, {
    port: 0,
    origins: [origin, otherOrigin],
    connections: requests,
    selectAgents,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  cleanup.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    runtime.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const request = (path: string, init: RequestInit = {}, from = origin) =>
    fetch(endpoint + path, {
      ...init,
      headers: { Origin: from, ...init.headers },
    });
  const create = async () => {
    const nonce = crypto.randomUUID();
    const response = await request("/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonce, agents }),
    });
    expect(response.status).toBe(202);
    return { ...(await response.json()), nonce } as {
      id: string;
      nonce: string;
      expires: number;
    };
  };
  return { root, requests, selectAgents, request, create };
}

it("requires a private desktop decision before issuing an origin-bound session", async () => {
  const { root, requests, selectAgents, request, create } = await fixture();
  const pending = await create();
  expect(await (await request(`/connections/${pending.id}`)).json()).toEqual({
    status: "pending",
  });
  expect(selectAgents).not.toHaveBeenCalled();
  expect(
    (await request(`/connections/${pending.id}`, {}, otherOrigin)).status,
  ).toBe(404);
  expect(
    (await request(`/connections/${pending.id}/approve`, { method: "POST" }))
      .status,
  ).toBe(404);
  expect(
    (await request(`/connections/${pending.id}`, { method: "POST" })).status,
  ).toBe(405);
  if (process.platform !== "win32") {
    expect(statSync(join(root, "connections", pending.id)).mode & 0o777).toBe(
      0o700,
    );
    expect(
      statSync(join(root, "connections", pending.id, "request.json")).mode &
        0o777,
    ).toBe(0o600);
  }
  requests.decide(pending.id, true);
  const session = await (await request(`/connections/${pending.id}`)).json();
  expect(session).toMatchObject({
    status: "connected",
    nonce: pending.nonce,
    agents,
  });
  expect(session.token).toMatch(/^[a-zA-Z0-9_-]{43}$/);
  expect(selectAgents).toHaveBeenCalledExactlyOnceWith(agents);
  expect(await (await request(`/connections/${pending.id}`)).json()).toEqual(
    session,
  );
  expect(selectAgents).toHaveBeenCalledTimes(1);
  const headers = {
    Authorization: `Bearer ${session.token}`,
    "X-Project-CAD-Client": crypto.randomUUID(),
  };
  expect((await request("/providers", { headers })).status).toBe(200);
  expect((await request("/providers", { headers }, otherOrigin)).status).toBe(
    401,
  );
  // Cancellation also revokes a token claimed just before the browser cancels.
  expect(
    (await request(`/connections/${pending.id}/cancel`, { method: "POST" }))
      .status,
  ).toBe(200);
  expect((await request("/providers", { headers })).status).toBe(401);
  expect(requests.get(pending.id)).toBeNull();
});

it("keeps declined, cancelled, and expired requests from granting access", async () => {
  const { requests, selectAgents, request, create } = await fixture();
  const declined = await create();
  requests.decide(declined.id, false);
  expect(await (await request(`/connections/${declined.id}`)).json()).toEqual({
    status: "denied",
  });
  expect(() => requests.decide(declined.id, true)).toThrow(
    "already been answered",
  );
  const cancelled = await create();
  expect(
    (
      await request(
        `/connections/${cancelled.id}/cancel`,
        { method: "POST" },
        otherOrigin,
      )
    ).status,
  ).toBe(404);
  await request(`/connections/${cancelled.id}/cancel`, { method: "POST" });
  expect(() => requests.decide(cancelled.id, true)).toThrow("expired");
  const expired = await create();
  vi.spyOn(Date, "now").mockReturnValue(expired.expires);
  expect((await request(`/connections/${expired.id}`)).status).toBe(404);
  expect(() => requests.decide(expired.id, true)).toThrow("expired");
  expect(selectAgents).not.toHaveBeenCalled();
});

it("rejects untrusted origins, form submissions, malformed selections and oversized requests", async () => {
  const { requests, request } = await fixture();
  const post = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nonce: crypto.randomUUID(), agents }),
  };
  for (const from of ["null", "https://projectcad.vercel.app.evil.example"])
    expect((await request("/connections", post, from)).status).toBe(403);
  expect(
    (
      await request("/connections", {
        ...post,
        headers: { "Content-Type": "text/plain" },
      })
    ).status,
  ).toBe(400);
  for (const body of [
    "{}",
    JSON.stringify({ nonce: crypto.randomUUID(), agents, approve: true }),
    "x".repeat(4097),
  ])
    expect((await request("/connections", { ...post, body })).status).toBe(400);
  expect(requests.pending()).toEqual([]);
  expect(requests.get("../../settings.json")).toBeNull();
});

it("bounds pending requests and makes approval available across desktop processes", async () => {
  const { root, requests } = await fixture();
  for (let i = 0; i < 20; i++)
    requests.create(origin, crypto.randomUUID(), agents);
  expect(() => requests.create(origin, crypto.randomUUID(), agents)).toThrow(
    "Too many",
  );
  const desktop = new ConnectionRequests(root);
  const first = desktop.pending()[0]!;
  desktop.decide(first.id, true);
  expect(requests.get(first.id)?.status).toBe("approved");
  expect(requests.pending()).toHaveLength(19);
  expect(() =>
    requests.create(origin, crypto.randomUUID(), agents),
  ).not.toThrow();
});

import { afterEach, expect, it, vi } from "vitest";
import { createServer, type RequestListener, type Server } from "node:http";
import { Socket } from "node:net";
import { assistantHealthy } from "../scripts/assistant/local-health";

const servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function fixture(listener: RequestListener) {
  const server = createServer(listener);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as { port: number }).port;
}

it("detects a running connector when PackageKit rejects socket QoS", async () => {
  const port = await fixture((request, response) => {
    expect(request.url).toBe("/health");
    response.end(JSON.stringify({ name: "Project CAD assistant", version: 1 }));
  });
  const qos = vi
    .spyOn(Socket.prototype, "setTypeOfService")
    .mockImplementation(() => {
      throw Object.assign(new Error("setTypeOfService EINVAL"), {
        code: "EINVAL",
      });
    });
  await expect(assistantHealthy(port)).resolves.toBe(true);
  expect(qos).not.toHaveBeenCalled();
});

it.each([
  [200, "not json"],
  [200, "null"],
  [200, JSON.stringify({ name: "another service", version: 1 })],
  [200, JSON.stringify({ name: "Project CAD assistant", version: 2 })],
  [503, JSON.stringify({ name: "Project CAD assistant", version: 1 })],
  [200, "x".repeat(8193)],
] as const)("rejects an unhealthy response (case %#)", async (status, body) => {
  const port = await fixture((_request, response) => {
    response.statusCode = status;
    response.end(body);
  });
  await expect(assistantHealthy(port)).resolves.toBe(false);
});

it("does not follow redirects to another server", async () => {
  const redirected = vi.fn<RequestListener>((_request, response) => {
    response.end(JSON.stringify({ name: "Project CAD assistant", version: 1 }));
  });
  const target = await fixture(redirected);
  const port = await fixture((_request, response) => {
    response.writeHead(302, { Location: `http://127.0.0.1:${target}/health` });
    response.end();
  });
  await expect(assistantHealthy(port)).resolves.toBe(false);
  expect(redirected).not.toHaveBeenCalled();
});

it("times out an unresponsive connector", async () => {
  const port = await fixture(() => {});
  await expect(assistantHealthy(port)).resolves.toBe(false);
});

it("handles a closed port without throwing", async () => {
  const port = await fixture(() => {});
  await new Promise<void>((resolve) => servers[0].close(() => resolve()));
  await expect(assistantHealthy(port)).resolves.toBe(false);
});

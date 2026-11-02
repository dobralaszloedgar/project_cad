import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalNotifier } from "../src/server/assistant/approval-notifier";
import { ConnectionRequests } from "../src/server/assistant/connections";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture(open: () => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "project-cad-approval-"));
  directories.push(root);
  const requests = new ConnectionRequests(root);
  return {
    requests,
    notifier: new ApprovalNotifier(requests, open),
    request: () =>
      requests.create("https://projectcad.vercel.app", crypto.randomUUID(), {
        providers: ["codex"],
        preferred: "codex",
      }),
  };
}

it("opens consent for a background connector once per batch, without approving requests", async () => {
  let opened!: () => void;
  const open = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        opened = resolve;
      }),
  );
  const { requests, notifier, request } = fixture(open);
  await notifier.check(0);
  expect(open).not.toHaveBeenCalled();
  const first = request();
  const second = request();
  const opening = notifier.check(0);
  await notifier.check(1000);
  expect(open).toHaveBeenCalledTimes(1);
  expect(requests.get(first.id)?.status).toBe("pending");
  opened();
  await opening;
  await notifier.check(20000);
  expect(open).toHaveBeenCalledTimes(1);
  requests.decide(first.id, true);
  requests.decide(second.id, false);
  request();
  const next = notifier.check(21000);
  expect(open).toHaveBeenCalledTimes(2);
  opened();
  await next;
});

it("retries a failed window launch and rate limits new requests", async () => {
  const open = vi
    .fn()
    .mockRejectedValueOnce(new Error("Browser launch failed"))
    .mockResolvedValue(undefined);
  const { notifier, request } = fixture(open);
  request();
  await expect(notifier.check(0)).rejects.toThrow("Browser launch failed");
  await notifier.check(1000);
  expect(open).toHaveBeenCalledTimes(1);
  await notifier.check(10000);
  expect(open).toHaveBeenCalledTimes(2);
  request();
  await notifier.check(11000);
  expect(open).toHaveBeenCalledTimes(2);
  await notifier.check(20000);
  expect(open).toHaveBeenCalledTimes(3);
});

it("reopens a dismissed approval window on request without approving or replacing the connection", async () => {
  const open = vi.fn().mockResolvedValue(undefined);
  const { notifier, requests, request } = fixture(open);
  const pending = request();
  await notifier.check(0);
  requests.requestOpen(pending.id);
  await notifier.check(1000);
  expect(open).toHaveBeenCalledTimes(1);
  await notifier.check(10000);
  expect(open).toHaveBeenCalledTimes(2);
  expect(requests.get(pending.id)).toMatchObject({
    nonce: pending.nonce,
    status: "pending",
  });
  requests.requestOpen(pending.id);
  await notifier.check(20000);
  expect(open).toHaveBeenCalledTimes(2);
  requests.decide(pending.id, false);
  expect(() => requests.requestOpen(pending.id)).toThrow("no longer waiting");
});

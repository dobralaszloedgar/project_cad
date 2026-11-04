// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, it, vi } from "vitest";
import { ProjectToolQueue } from "../src/assistant/tool-queue";
import type { ToolCommand, ToolName } from "../src/assistant/protocol";

function command(id: string, name: ToolName = "get_project"): ToolCommand {
  return {
    id,
    name,
    arguments: {},
    projectId: "project",
    conversationId: "chat",
    runId: "run",
    mode: "auto",
  };
}

it("runs four independent reads together, deduplicates polls and orders edits between reads", async () => {
  const pending = new Map<
    string,
    ReturnType<typeof Promise.withResolvers<unknown>>
  >();
  const execute = vi.fn((command: ToolCommand) => {
    const task = Promise.withResolvers<unknown>();
    pending.set(command.id, task);
    return task.promise;
  });
  const answer = vi.fn(async () => {});
  const report = vi.fn();
  const queue = new ProjectToolQueue(execute, answer, report);
  const commands = [
    ...Array.from({ length: 6 }, (_, i) => command(String(i))),
    command("edit", "propose_actions"),
    command("after"),
  ];
  queue.update(commands);
  queue.update(commands);
  expect([...pending.keys()]).toEqual(["0", "1", "2", "3"]);
  for (const id of ["0", "1", "2", "3"]) pending.get(id)!.resolve(id);
  await vi.waitFor(() => expect(pending.has("5")).toBe(true));
  expect(pending.has("edit")).toBe(false);
  pending.get("4")!.resolve("four");
  pending.get("5")!.reject(new Error("Lookup failed"));
  await vi.waitFor(() => expect(pending.has("edit")).toBe(true));
  expect(pending.has("after")).toBe(false);
  pending.get("edit")!.resolve({ applied: true });
  await vi.waitFor(() => expect(pending.has("after")).toBe(true));
  pending.get("after")!.resolve({ revision: "new revision" });
  await vi.waitFor(() => expect(answer).toHaveBeenCalledTimes(8));
  expect(answer).toHaveBeenCalledWith("5", { error: "Lookup failed" });
  expect(execute).toHaveBeenCalledTimes(8);
  expect(report).not.toHaveBeenCalled();
  queue.close();
});

it("retries a failed result delivery without applying an edit again", async () => {
  const execute = vi.fn(async () => ({ applied: true }));
  const answer = vi
    .fn()
    .mockRejectedValueOnce(new Error("Network failed"))
    .mockResolvedValue(undefined);
  const report = vi.fn();
  const queue = new ProjectToolQueue(execute, answer, report);
  const commands = [command("edit", "propose_actions")];
  queue.update(commands);
  await vi.waitFor(() => expect(report).toHaveBeenCalledTimes(1));
  queue.update(commands);
  await vi.waitFor(() => expect(answer).toHaveBeenCalledTimes(2));
  queue.update(commands);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(answer.mock.calls).toEqual([
    ["edit", { value: { applied: true } }],
    ["edit", { value: { applied: true } }],
  ]);
  queue.close();
});

it.each(["cancel", "close"])(
  "drops queued edits and late results after %s",
  async (action) => {
    const read = Promise.withResolvers<unknown>();
    const execute = vi.fn(() => read.promise);
    const answer = vi.fn(async () => {});
    const queue = new ProjectToolQueue(execute, answer, vi.fn());
    queue.update([command("read"), command("edit", "propose_actions")]);
    expect(execute).toHaveBeenCalledTimes(1);
    if (action === "cancel") queue.update([]);
    else queue.close();
    read.resolve("Late result");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(answer).not.toHaveBeenCalled();
    queue.close();
  },
);

it("keeps processing new tool calls while another result delivery is slow", async () => {
  const delivery = Promise.withResolvers<unknown>();
  const execute = vi.fn(async (command: ToolCommand) => command.id);
  const answer = vi.fn(() => delivery.promise);
  const queue = new ProjectToolQueue(execute, answer, vi.fn());
  queue.update([command("first")]);
  await vi.waitFor(() => expect(answer).toHaveBeenCalledTimes(1));
  queue.update([command("first"), command("second")]);
  await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
  expect(answer).toHaveBeenCalledTimes(2);
  delivery.resolve(undefined);
  queue.close();
});

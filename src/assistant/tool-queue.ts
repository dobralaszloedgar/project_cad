// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { ToolCommand } from "./protocol";

export type ToolReply = { value?: unknown; error?: string };
type Entry = {
  command: ToolCommand;
  reply?: ToolReply;
  delivering?: boolean;
  delivered?: boolean;
};

/** Runs independent reads together without blocking the browser's heartbeat.
 * Edits are barriers; retries resend results without executing an edit twice.
 */
export class ProjectToolQueue {
  private entries = new Map<string, Entry>();
  private running = false;
  private closed = false;

  constructor(
    private execute: (command: ToolCommand) => Promise<unknown>,
    private answer: (id: string, reply: ToolReply) => Promise<unknown>,
    private report: (error: unknown) => void,
  ) {}

  update(commands: ToolCommand[]) {
    if (this.closed) return;
    const ids = new Set(commands.map((command) => command.id));
    for (const id of this.entries.keys())
      if (!ids.has(id)) this.entries.delete(id);
    for (const command of commands)
      if (!this.entries.has(command.id))
        this.entries.set(command.id, { command });
    for (const entry of this.entries.values()) void this.deliver(entry);
    void this.drain();
  }

  private current(entry: Entry) {
    return !this.closed && this.entries.get(entry.command.id) === entry;
  }

  private async drain() {
    if (this.running || this.closed) return;
    this.running = true;
    try {
      while (!this.closed) {
        const pending = [...this.entries.values()].filter((e) => !e.reply);
        if (!pending.length) return;
        const edit = pending.findIndex(
          (e) => e.command.name === "propose_actions",
        );
        const batch = pending.slice(
          0,
          edit === 0 ? 1 : edit < 0 ? 4 : Math.min(4, edit),
        );
        await Promise.all(
          batch.map(async (entry) => {
            if (!this.current(entry)) return;
            try {
              entry.reply = { value: await this.execute(entry.command) };
            } catch (error) {
              entry.reply = {
                error:
                  error instanceof Error
                    ? error.message.slice(0, 2000)
                    : "Project tool failed.",
              };
            }
            void this.deliver(entry);
          }),
        );
      }
    } finally {
      this.running = false;
    }
  }

  private async deliver(entry: Entry) {
    if (
      !this.current(entry) ||
      !entry.reply ||
      entry.delivering ||
      entry.delivered
    )
      return;
    entry.delivering = true;
    try {
      await this.answer(entry.command.id, entry.reply);
      entry.delivered = true;
    } catch (error) {
      if (this.current(entry)) this.report(error);
    } finally {
      entry.delivering = false;
    }
  }

  close() {
    this.closed = true;
    this.entries.clear();
  }
}

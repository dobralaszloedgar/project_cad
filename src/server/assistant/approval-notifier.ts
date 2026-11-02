import type { ConnectionRequests } from "./connections";

/** Open local consent when a website requests it, including after login when
 * the desktop controller is running without a settings window. */
export class ApprovalNotifier {
  private notified = new Map<string, number>();
  private opening = false;
  private lastAttempt = -Infinity;

  constructor(
    private requests: Pick<ConnectionRequests, "pending">,
    private open: () => Promise<void>,
  ) {}

  async check(now = Date.now()) {
    if (this.opening) return;
    const pending = this.requests
      .pending()
      .filter((request) => request !== null);
    const ids = new Set(pending.map((request) => request.id));
    for (const id of this.notified.keys())
      if (!ids.has(id)) this.notified.delete(id);
    if (
      pending.every(
        (request) => this.notified.get(request.id) === request.openRevision,
      )
    )
      return;
    // One window for a batch of requests; repeated website clicks cannot flood
    // the desktop. Failed launches may retry after the same short cooldown.
    if (now - this.lastAttempt < 10000) return;
    this.lastAttempt = now;
    this.opening = true;
    try {
      await this.open();
      for (const request of pending)
        this.notified.set(request.id, request.openRevision);
    } finally {
      this.opening = false;
    }
  }
}

import { randomBytes } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  agentSelectionSchema,
  type AgentSelection,
} from "../../assistant/protocol";

const requestSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  origin: z.string().url(),
  nonce: z.string().uuid(),
  agents: agentSelectionSchema,
  expires: z.number(),
  openRevision: z.number().int().nonnegative().default(0),
  browserWindow: z.boolean().default(false),
});
export type ConnectionRequest = z.infer<typeof requestSchema>;

/** Private, short-lived consent requests shared by the service and desktop app.
 * The browser can request/check/cancel; only the local desktop can approve.
 */
export class ConnectionRequests {
  private directory: string;
  constructor(root: string) {
    this.directory = join(root, "connections");
  }
  private path(id: string) {
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new Error("Invalid connection request.");
    return join(this.directory, id);
  }
  get(
    id: string,
  ):
    (ConnectionRequest & { status: "pending" | "approved" | "denied" }) | null {
    try {
      const directory = this.path(id);
      const request = requestSchema.parse(
        JSON.parse(readFileSync(join(directory, "request.json"), "utf8")),
      );
      if (request.id !== id || request.expires <= Date.now()) {
        this.remove(id);
        return null;
      }
      let status: "pending" | "approved" | "denied" = "pending";
      try {
        const decision = readFileSync(join(directory, "decision"), "utf8");
        if (decision === "approved" || decision === "denied") status = decision;
      } catch {
        /* No local decision yet. */
      }
      let openRevision = 0;
      try {
        const value = Number(
          readFileSync(join(directory, "open-request"), "utf8"),
        );
        if (Number.isSafeInteger(value) && value > 0) openRevision = value;
      } catch {
        /* No explicit request to reopen the approval window. */
      }
      return { ...request, openRevision, status };
    } catch {
      return null;
    }
  }
  pending() {
    let ids: string[];
    try {
      ids = readdirSync(this.directory);
    } catch {
      return [];
    }
    return ids
      .map((id) => this.get(id))
      .filter((request) => request?.status === "pending");
  }
  create(
    origin: string,
    nonce: string,
    agents: AgentSelection,
    browserWindow = false,
  ) {
    if (this.pending().length >= 20)
      throw new Error(
        "Too many pending connections. Cancel one in the assistant and try again.",
      );
    const request = requestSchema.parse({
      id: randomBytes(32).toString("hex"),
      origin,
      nonce,
      agents,
      browserWindow,
      expires: Date.now() + 120000,
    });
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const directory = this.path(request.id);
    mkdirSync(directory, { mode: 0o700 });
    writeFileSync(join(directory, "request.json"), JSON.stringify(request), {
      mode: 0o600,
      flag: "wx",
    });
    return request;
  }
  decide(id: string, approved: boolean) {
    const request = this.get(id);
    if (!request)
      throw new Error(
        "This connection expired. Connect again from the website.",
      );
    const decision = approved ? "approved" : "denied";
    if (request.status === decision) return;
    if (request.status !== "pending")
      throw new Error("This connection has already been answered.");
    // Exclusive creation makes competing approve/deny actions first-writer-wins.
    writeFileSync(join(this.path(id), "decision"), decision, {
      mode: 0o600,
      flag: "wx",
    });
  }
  requestOpen(id: string) {
    const request = this.get(id);
    if (!request || request.status !== "pending")
      throw new Error(
        "This connection is no longer waiting for approval. Connect again from the website.",
      );
    // The desktop observes this marker. It never grants consent or exposes its
    // private launch ticket to the website. Coalesce rapid repeat clicks.
    const now = Date.now();
    if (now - request.openRevision < 10000) return;
    writeFileSync(join(this.path(id), "open-request"), String(now), {
      mode: 0o600,
    });
  }
  remove(id: string) {
    rmSync(this.path(id), { recursive: true, force: true });
  }
  clear() {
    let ids: string[];
    try {
      ids = readdirSync(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const id of ids) if (/^[a-f0-9]{64}$/.test(id)) this.remove(id);
  }
}

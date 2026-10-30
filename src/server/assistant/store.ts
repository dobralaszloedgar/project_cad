import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import type { StoredConversation } from "../../assistant/protocol";

export class AssistantStore {
  private db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, origin TEXT NOT NULL, project_id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS conversation_scope ON conversations(origin, project_id, updated_at);`);
    const entries = this.db.prepare("SELECT data FROM conversations").all();
    for (const row of entries) {
      const chat = JSON.parse(String(row.data)) as StoredConversation;
      let changed = false;
      for (const run of chat.runs)
        if (run.status === "running") {
          run.status = "interrupted";
          run.error = "The assistant restarted. Send a follow-up to continue.";
          changed = true;
          for (const step of run.activities)
            if (step.status === "running") step.status = "error";
        }
      if (changed) this.save(chat);
    }
  }
  save(chat: StoredConversation) {
    this.db
      .prepare(
        "INSERT INTO conversations VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, data=excluded.data",
      )
      .run(
        chat.id,
        chat.origin,
        chat.projectId,
        chat.updatedAt,
        JSON.stringify(chat),
      );
  }
  get(id: string, origin: string, projectId: string): StoredConversation {
    const row = this.db
      .prepare(
        "SELECT data FROM conversations WHERE id=? AND origin=? AND project_id=?",
      )
      .get(id, origin, projectId);
    if (!row) throw new Error("Conversation not found in this project.");
    return JSON.parse(String(row.data));
  }
  list(origin: string, projectId: string) {
    return this.db
      .prepare(
        "SELECT data FROM conversations WHERE origin=? AND project_id=? ORDER BY updated_at DESC LIMIT 100",
      )
      .all(origin, projectId)
      .map((row) => JSON.parse(String(row.data)) as StoredConversation);
  }
  close() {
    this.db.close();
  }
}

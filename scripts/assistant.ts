// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AssistantStore } from "../src/server/assistant/store";
import { AssistantRuntime } from "../src/server/assistant/runtime";
import { createAssistantServer } from "../src/server/assistant/http";
import { ConnectionRequests } from "../src/server/assistant/connections";
import { MuseProvider } from "../src/server/assistant/providers/muse";
import { desktopWindow } from "../src/server/assistant/desktop-window";
import { connectorSettings } from "../src/server/assistant/connector-settings";
import { nativeAssistantWindow } from "../src/server/assistant/native-window";
import { ApprovalNotifier } from "../src/server/assistant/approval-notifier";
import {
  assistantOrigins,
  loadAssistantSettings,
  saveAssistantSettings,
} from "../src/server/assistant/config";

const root =
  process.env.PROJECT_CAD_ASSISTANT_DATA ||
  join(homedir(), ".project-cad", "assistant");
mkdirSync(root, { recursive: true, mode: 0o700 });
let settings = loadAssistantSettings(root);
const store = new AssistantStore(join(root, "conversations.sqlite"));
const runtime = new AssistantRuntime(
  store,
  {
    muse: new MuseProvider(root, () => loadAssistantSettings(root)),
  },
  root,
  () => settings.agents,
);
const port = Number(process.env.PROJECT_CAD_ASSISTANT_PORT || 43118);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid assistant port.");
const origins = assistantOrigins(
  settings.websiteUrl,
  process.env.PROJECT_CAD_APP_ORIGINS,
);
const connections = new ConnectionRequests(root);
const nativeWindow = nativeAssistantWindow(
  dirname(dirname(fileURLToPath(import.meta.url))),
);
const approvals = nativeWindow
  ? new ApprovalNotifier(connections, nativeWindow)
  : undefined;
let approvalTimer: ReturnType<typeof setInterval> | undefined;
const server = createAssistantServer(runtime, {
  port,
  origins,
  connections,
  desktopOpen:
    !!nativeWindow || process.env.PROJECT_CAD_DESKTOP_MANAGED === "1",
  desktopWindow:
    process.env.PROJECT_CAD_DESKTOP_MANAGED === "1"
      ? () => desktopWindow(root)
      : undefined,
  selectAgents: (agents) => {
    settings = saveAssistantSettings(root, {
      ...loadAssistantSettings(root),
      agents,
    });
  },
  connectorSettings: connectorSettings(root),
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Project CAD assistant ready at http://127.0.0.1:${port}`);
  if (approvals) {
    approvalTimer = setInterval(() => {
      void approvals
        .check()
        .catch((error) =>
          console.error(
            "Could not open the assistant approval window:",
            error.message,
          ),
        );
    }, 1000);
    approvalTimer.unref();
  }
});
server.on("error", (error) => {
  console.error(error.message);
  runtime.close();
  process.exitCode = 1;
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(approvalTimer);
  runtime.close();
  server.close();
  setTimeout(() => process.exit(0), 1000).unref();
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, shutdown);
if (process.send) {
  process.on("message", (message) => {
    if (
      message &&
      typeof message === "object" &&
      "type" in message &&
      message.type === "project-cad-shutdown"
    )
      shutdown();
  });
  process.once("disconnect", shutdown);
}

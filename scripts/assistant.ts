import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AssistantStore } from "../src/server/assistant/store";
import { AssistantRuntime } from "../src/server/assistant/runtime";
import { createAssistantServer } from "../src/server/assistant/http";
import { CodexProvider } from "../src/server/assistant/providers/codex";
import { ClaudeProvider } from "../src/server/assistant/providers/claude";
import { MuseProvider } from "../src/server/assistant/providers/muse";
import {
  applicationOrigin,
  loadAssistantSettings,
} from "../src/server/assistant/config";

const root =
  process.env.PROJECT_CAD_ASSISTANT_DATA ||
  join(homedir(), ".project-cad", "assistant");
mkdirSync(root, { recursive: true, mode: 0o700 });
const settings = loadAssistantSettings(root);
if (settings.museApiKey && !process.env.MODEL_API_KEY) {
  process.env.MODEL_API_KEY = settings.museApiKey;
  process.env.META_AI_ENABLED = "true";
}
const store = new AssistantStore(join(root, "conversations.sqlite"));
const runtime = new AssistantRuntime(
  store,
  {
    codex: new CodexProvider(root),
    claude: new ClaudeProvider(root),
    muse: new MuseProvider(),
  },
  root,
);
const port = Number(process.env.PROJECT_CAD_ASSISTANT_PORT || 43118);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid assistant port.");
const origins = (
  process.env.PROJECT_CAD_APP_ORIGINS ||
  `${applicationOrigin(settings.websiteUrl)},http://127.0.0.1:3000,http://localhost:3000`
)
  .split(",")
  .map((value) => applicationOrigin(value.trim()));
const server = createAssistantServer(runtime, { port, origins });
server.listen(port, "127.0.0.1", () =>
  console.log(`Project CAD assistant ready at http://127.0.0.1:${port}`),
);
server.on("error", (error) => {
  console.error(error.message);
  runtime.close();
  process.exitCode = 1;
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
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

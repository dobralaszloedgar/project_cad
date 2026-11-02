import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  loadAssistantSettings,
  providerExecutable,
  saveAssistantSettings,
} from "../../src/server/assistant/config";

import { installProvider } from "../../src/server/assistant/install-provider";
import { providerStatus } from "../../src/server/assistant/provider-setup";
import { ConnectionRequests } from "../../src/server/assistant/connections";

const execute = promisify(execFile);
// A separate label lets package verification exercise updates without stopping
// the user's installed connector.
const label =
  process.env.PROJECT_CAD_ASSISTANT_SERVICE_LABEL || "com.projectcad.assistant";
if (!/^com\.projectcad\.assistant(?:\.[a-zA-Z0-9-]+)*$/.test(label))
  throw new Error("Invalid assistant service label.");
const resources = fileURLToPath(new URL("../", import.meta.url));
const root =
  process.env.PROJECT_CAD_ASSISTANT_DATA ||
  join(homedir(), ".project-cad", "assistant");
const service = `gui/${process.getuid?.()}/${label}`;
const persistentPlist = join(
  homedir(),
  "Library",
  "LaunchAgents",
  `${label}.plist`,
);
const transientPlist = join(root, "assistant.plist");
const port = Number(process.env.PROJECT_CAD_ASSISTANT_PORT || 43118);
const xml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char]!,
  );

async function launchctl(args: string[], tolerateMissing = false) {
  try {
    return (await execute("/bin/launchctl", args, { timeout: 15000 })).stdout;
  } catch (error) {
    if (tolerateMissing) return "";
    throw new Error(
      `Could not ${args[0]} the assistant background service. ${error instanceof Error ? error.message : ""}`,
    );
  }
}
async function health() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1500),
      redirect: "error",
    });
    const value = await response.json();
    return (
      response.ok &&
      value.name === "Project CAD assistant" &&
      value.version === 1
    );
  } catch {
    return false;
  }
}
function plist() {
  const environment = {
    PATH: [
      dirname(process.execPath),
      join(homedir(), ".local", "bin"),
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    ].join(":"),
    PROJECT_CAD_ASSISTANT_DATA: root,
    PROJECT_CAD_ASSISTANT_PORT: String(port),
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(join(resources, "app", "assistant.mjs"))}</string></array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>EnvironmentVariables</key><dict>${Object.entries(environment)
    .map(([key, value]) => `<key>${key}</key><string>${xml(value)}</string>`)
    .join("")}</dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>ThrottleInterval</key><integer>10</integer><key>ExitTimeOut</key><integer>15</integer>
<key>ProcessType</key><string>Interactive</string><key>Umask</key><integer>63</integer>
<key>StandardOutPath</key><string>${xml(join(root, "logs", "assistant.log"))}</string>
<key>StandardErrorPath</key><string>${xml(join(root, "logs", "assistant-error.log"))}</string>
</dict></plist>\n`;
}
async function status() {
  const settings = loadAssistantSettings(root),
    running = await health();
  const managed = !!(await launchctl(["print", service], true));
  return {
    running,
    managed,
    websiteUrl: settings.websiteUrl,
    startAtLogin: settings.startAtLogin,
    agents: settings.agents,
    connections: new ConnectionRequests(root).pending(),
    museAvailable: !!providerExecutable("muse"),
    message: !settings.agents
      ? "Return to Project CAD and connect. Your selected agents will appear here."
      : running
        ? managed
          ? ""
          : "Another Project CAD assistant is already running."
        : "Assistant is stopped.",
  };
}
async function stop() {
  if (await launchctl(["print", service], true)) {
    await launchctl(["bootout", service]);
    const until = Date.now() + 15000;
    while (await health()) {
      if (Date.now() > until)
        throw new Error(
          "The assistant is still stopping. Wait a moment and try again.",
        );
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
}
async function start() {
  if (process.platform !== "darwin" || process.getuid?.() === 0)
    throw new Error("Open Project CAD Assistant from your macOS user account.");
  const settings = loadAssistantSettings(root);
  if (await health()) return status();
  await access(join(resources, "app", "assistant.mjs"));
  if (await launchctl(["print", service], true)) await stop();
  await mkdir(join(root, "logs"), { recursive: true, mode: 0o700 });
  const target = settings.startAtLogin ? persistentPlist : transientPlist;
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, plist(), { mode: 0o600 });
  execFileSync("/usr/bin/plutil", ["-lint", temporary], { stdio: "pipe" });
  await rename(temporary, target);
  if (!settings.startAtLogin) await rm(persistentPlist, { force: true });
  await launchctl(["enable", service]);
  await launchctl(["bootstrap", `gui/${process.getuid?.()}`, target]);
  const until = Date.now() + 15000;
  while (!(await health())) {
    if (Date.now() > until)
      throw new Error(
        "The assistant could not start. Open its logs to see the startup error.",
      );
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return status();
}

async function main() {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const [command = "status", provider] = process.argv.slice(2);
  if (command === "plist") {
    process.stdout.write(plist());
    return;
  }
  if (command === "doctor") {
    const manifest = JSON.parse(
      await readFile(join(resources, "manifest.json"), "utf8"),
    );
    for (const [file, expected] of Object.entries(manifest.files)) {
      if (isAbsolute(file) || file.split(/[\\/]/).includes(".."))
        throw new Error("Invalid application manifest.");
      const actual = createHash("sha256")
        .update(await readFile(join(resources, file)))
        .digest("hex");
      if (actual !== expected)
        throw new Error(`Application file failed verification: ${file}`);
    }
    await access(join(resources, "app", "assistant.mjs"));
    console.log(
      JSON.stringify({
        name: "Project CAD Assistant",
        version: manifest.version,
        architecture: process.arch,
        node: process.version,
        packaged: true,
      }),
    );
    return;
  }
  if (command === "status") {
    console.log(JSON.stringify(await status()));
    return;
  }
  if (command === "approve-connection" || command === "deny-connection") {
    const requests = new ConnectionRequests(root);
    const pending = requests.get(provider);
    requests.decide(provider, command === "approve-connection");
    if (command === "approve-connection" && pending)
      saveAssistantSettings(root, {
        ...loadAssistantSettings(root),
        agents: pending.agents,
      });
    console.log(
      JSON.stringify({
        ...(await status()),
        message:
          command === "approve-connection"
            ? "Connection approved. Return to your project."
            : "Connection declined.",
      }),
    );
    return;
  }
  if (command === "start") {
    console.log(JSON.stringify(await start()));
    return;
  }
  if (command === "stop") {
    await stop();
    console.log(JSON.stringify(await status()));
    return;
  }
  if (command === "restart") {
    await stop();
    console.log(JSON.stringify(await start()));
    return;
  }
  if (command === "disable-startup") {
    await stop();
    await rm(persistentPlist, { force: true });
    console.log(JSON.stringify({ stopped: true, historyPreserved: true }));
    return;
  }
  if (
    (command === "install-provider" ||
      command === "prepare-provider" ||
      command === "provider-status") &&
    provider === "muse"
  ) {
    if (!loadAssistantSettings(root).agents?.providers.includes(provider))
      throw new Error(
        "Choose this agent in Manage agents before setting it up.",
      );
    if (command === "provider-status") {
      console.log(JSON.stringify(await providerStatus(provider, root)));
      return;
    }
    const installed = await installProvider(provider, resources, root);
    const ready =
      command === "prepare-provider" &&
      (await providerStatus(provider, root)).available;
    console.log(JSON.stringify({ ...installed, ready }));
    return;
  }
  if (command === "open") {
    await start();
    await execute("/usr/bin/open", [loadAssistantSettings(root).websiteUrl]);
    return;
  }
  throw new Error("Unknown assistant control command.");
}
void main().catch((error) => {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : "Assistant setup failed.",
    }),
  );
  process.exitCode = 1;
});

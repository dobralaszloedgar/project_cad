import { createServer } from "node:http";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { openSync, closeSync } from "node:fs";
import {
  access,
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import {
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  applicationOrigin,
  loadAssistantSettings,
  providerExecutable,
  settingsSchema,
  saveAssistantSettings,
} from "../../src/server/assistant/config";
import { ProviderSetup } from "../../src/server/assistant/provider-setup";
import { agentNames, type ProviderId } from "../../src/assistant/protocol";
import { ConnectionRequests } from "../../src/server/assistant/connections";
import { ApprovalNotifier } from "../../src/server/assistant/approval-notifier";
import { removePreviousInstallations } from "./install-cleanup.mjs";

const execute = promisify(execFile);
const resources = fileURLToPath(new URL("../", import.meta.url));
const root =
  process.env.PROJECT_CAD_ASSISTANT_DATA ||
  join(homedir(), ".project-cad", "assistant");
const stateFile = join(root, "desktop-control.json");
const port = Number(process.env.PROJECT_CAD_DESKTOP_PORT || 43119);
const assistantPort = Number(process.env.PROJECT_CAD_ASSISTANT_PORT || 43118);
const origin = `http://127.0.0.1:${port}`;
const launcherName =
  process.platform === "win32"
    ? "Project CAD Assistant.exe"
    : "project-cad-assistant";
for (const value of [port, assistantPort])
  if (!Number.isInteger(value) || value < 1024 || value > 65535)
    throw new Error("Invalid assistant port.");
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );
const escapeDesktop = (text: string) =>
  '"' +
  text
    .replace(/[\\"`$]/g, (char) => "\\" + char)
    .replaceAll("\\", "\\\\")
    .replace(/%/g, "%%") +
  '"';
const powershell = (text: string) => "'" + text.replaceAll("'", "''") + "'";
const windowsExecutable = (name: string) =>
  join(process.env.SystemRoot || "C:\\Windows", "System32", name);

async function doctor(folder = resources) {
  const manifest = JSON.parse(
    await readFile(join(folder, "manifest.json"), "utf8"),
  );
  if (manifest.name !== "Project CAD Assistant")
    throw new Error("This folder is not a Project CAD Assistant installation.");
  for (const [file, hash] of Object.entries(manifest.files)) {
    if (isAbsolute(file) || file.split(/[\\/]/).includes(".."))
      throw new Error("Invalid package manifest.");
    if (
      createHash("sha256")
        .update(await readFile(join(folder, file)))
        .digest("hex") !== hash
    )
      throw new Error(`Package verification failed: ${file}`);
  }
  return {
    name: manifest.name,
    version: manifest.version,
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
  };
}
async function assistantHealth() {
  try {
    const response = await fetch(`http://127.0.0.1:${assistantPort}/health`, {
      signal: AbortSignal.timeout(1000),
    });
    return (
      response.ok && (await response.json()).name === "Project CAD assistant"
    );
  } catch {
    return false;
  }
}
async function control(action: string) {
  const saved = JSON.parse(await readFile(stateFile, "utf8"));
  if (saved.port !== port || typeof saved.token !== "string")
    throw new Error("The desktop assistant is not running.");
  const response = await fetch(origin + "/command", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + saved.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action }),
    signal: AbortSignal.timeout(30000),
    redirect: "error",
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Assistant command failed.");
  return value;
}
async function shutdownExisting() {
  async function requireStoppedWorker() {
    if (await assistantHealth())
      throw new Error(
        "Close the running Project CAD assistant before updating. Its previous session is still active.",
      );
  }
  try {
    await control("shutdown");
  } catch (error) {
    if (
      await fetch(origin + "/health", {
        signal: AbortSignal.timeout(1000),
      }).then(
        (r) => r.ok,
        () => false,
      )
    )
      throw error;
    await requireStoppedWorker();
    return;
  }
  for (let i = 0; i < 100; i++) {
    if (
      !(await fetch(origin + "/health", {
        signal: AbortSignal.timeout(500),
      }).then(
        (r) => r.ok,
        () => false,
      ))
    ) {
      await requireStoppedWorker();
      return;
    }
    await pause(100);
  }
  throw new Error(
    "The assistant is still stopping. Close its provider sessions and try again.",
  );
}
async function integration(folder: string, enabled: boolean, remove = false) {
  if (process.platform === "win32") {
    const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    // Verification uses its own Run value so temporary installations cannot
    // overwrite or remove the user's installed assistant's login entry.
    const name =
      process.env.PROJECT_CAD_ASSISTANT_STARTUP_NAME || "ProjectCADAssistant";
    if (!/^ProjectCADAssistant(?:-[a-zA-Z0-9-]+)?$/.test(name))
      throw new Error("Invalid assistant startup name.");
    if (enabled && !remove)
      await execute(
        windowsExecutable("reg.exe"),
        [
          "ADD",
          key,
          "/v",
          name,
          "/t",
          "REG_SZ",
          "/d",
          `"${join(folder, launcherName)}" --background`,
          "/f",
        ],
        { windowsHide: true },
      );
    else
      await execute(
        windowsExecutable("reg.exe"),
        ["DELETE", key, "/v", name, "/f"],
        { windowsHide: true },
      ).catch(() => {});
    if (
      !remove &&
      (await exists(join(folder, "uninstall-windows.ps1"))) &&
      (await exists(join(folder, "runtime", "node.exe")))
    ) {
      // Register every installation, including portable/CLI upgrades. Replacing
      // the app folder used to leave Windows pointing at a deleted Uninstall.exe.
      const manifest = JSON.parse(
        await readFile(join(folder, "manifest.json"), "utf8"),
      );
      const uninstallKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${name}`;
      const shell = windowsExecutable("WindowsPowerShell/v1.0/powershell.exe");
      const uninstall = `"${shell}" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${join(folder, "uninstall-windows.ps1")}"`;
      for (const [field, value] of Object.entries({
        DisplayName: "Project CAD Assistant",
        DisplayVersion: manifest.version,
        DisplayIcon: join(folder, launcherName),
        InstallLocation: folder,
        UninstallString: uninstall,
      }))
        await execute(
          windowsExecutable("reg.exe"),
          ["ADD", uninstallKey, "/v", field, "/t", "REG_SZ", "/d", value, "/f"],
          { windowsHide: true },
        );
      for (const field of ["NoModify", "NoRepair"])
        await execute(
          windowsExecutable("reg.exe"),
          [
            "ADD",
            uninstallKey,
            "/v",
            field,
            "/t",
            "REG_DWORD",
            "/d",
            "1",
            "/f",
          ],
          { windowsHide: true },
        );
      const menu = join(
        process.env.APPDATA || join(homedir(), "AppData", "Roaming"),
        "Microsoft",
        "Windows",
        "Start Menu",
        "Programs",
        "Project CAD",
      );
      await mkdir(menu, { recursive: true });
      const shortcut = join(
        menu,
        (name === "ProjectCADAssistant" ? "Project CAD Assistant" : name) +
          ".lnk",
      );
      const script = `$link = (New-Object -ComObject WScript.Shell).CreateShortcut(${powershell(shortcut)}); $link.TargetPath = ${powershell(join(folder, launcherName))}; $link.WorkingDirectory = ${powershell(folder)}; $link.Save()`;
      await execute(
        shell,
        [
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(script, "utf16le").toString("base64"),
        ],
        { windowsHide: true },
      );
    }
  } else if (process.platform === "linux") {
    const config = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    const data =
      process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
    const desktop = (background: boolean) =>
      `[Desktop Entry]\nType=Application\nName=Project CAD Assistant\nComment=Local assistant for your process projects\nExec=${escapeDesktop(join(folder, launcherName))}${background ? " --background" : ""}\nIcon=${join(folder, "icon.svg")}\nTerminal=false\nCategories=Science;Engineering;\nStartupNotify=false\n`;
    const menu = join(data, "applications", "project-cad-assistant.desktop"),
      login = join(config, "autostart", "project-cad-assistant.desktop");
    if (remove) {
      await rm(menu, { force: true });
      await rm(login, { force: true });
    } else {
      await mkdir(dirname(menu), { recursive: true });
      await writeFile(menu, desktop(false), { mode: 0o644 });
      if (enabled) {
        await mkdir(dirname(login), { recursive: true });
        await writeFile(login, desktop(true), { mode: 0o600 });
      } else await rm(login, { force: true });
    }
  }
}
async function openTarget(target: string) {
  if (process.env.PROJECT_CAD_NO_DESKTOP_OPEN === "1") return;
  if (process.platform === "win32") {
    const command = "Start-Process -FilePath " + powershell(target);
    await execute(
      windowsExecutable("WindowsPowerShell/v1.0/powershell.exe"),
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(command, "utf16le").toString("base64"),
      ],
      { windowsHide: true, timeout: 15000 },
    );
  } else
    await execute(
      process.platform === "darwin" ? "/usr/bin/open" : "/usr/bin/xdg-open",
      [target],
      { timeout: 15000 },
    );
}
async function signIn(provider: ProviderId, executable: string) {
  const args = provider === "claude" ? ["auth", "login"] : ["login"];
  if (process.platform === "win32") {
    const file = join(root, `signin-${provider}.ps1`);
    await writeFile(
      file,
      `\uFEFF$Host.UI.RawUI.WindowTitle = ${powershell(`Sign in to ${agentNames[provider]} · Project CAD`)}\n& ${powershell(executable)} ${args.map(powershell).join(" ")}\nWrite-Host 'Return to Project CAD. Your sign-in will be detected automatically.'\nRead-Host 'Press Enter to close'\n`,
      { mode: 0o600 },
    );
    const shell = windowsExecutable("WindowsPowerShell/v1.0/powershell.exe");
    // A detached Node child has no Windows console. Start-Process creates the
    // interactive sign-in window instead of silently running login invisibly.
    const command = `Start-Process -FilePath ${powershell(shell)} -WindowStyle Normal -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',${powershell('"' + file + '"')})`;
    await execute(
      shell,
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(command, "utf16le").toString("base64"),
      ],
      { windowsHide: true, timeout: 15000 },
    );
  } else {
    const candidates = [
      "/usr/bin/x-terminal-emulator",
      "/usr/bin/gnome-terminal",
      "/usr/bin/konsole",
      "/usr/bin/xterm",
    ];
    const terminal = (
      await Promise.all(
        candidates.map(async (file) =>
          (await exists(file)) ? file : undefined,
        ),
      )
    ).find(Boolean);
    if (!terminal)
      throw new Error(
        `Installed ${agentNames[provider]}. Sign in from a terminal: "${executable}" ${args.join(" ")}`,
      );
    const child = spawn(
      terminal,
      [terminal.includes("gnome-terminal") ? "--" : "-e", executable, ...args],
      { detached: true, stdio: "ignore" },
    );
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    child.unref();
  }
}
async function install(source: string, destination?: string, noStart = false) {
  source = resolve(source);
  destination = resolve(
    destination ||
      (process.platform === "win32"
        ? join(
            process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"),
            "ProjectCAD",
            "Assistant",
          )
        : join(homedir(), ".local", "share", "project-cad-assistant")),
  );
  const childPath = relative(source, destination);
  if (!childPath || (!childPath.startsWith("..") && !isAbsolute(childPath)))
    throw new Error(
      "Choose an installation folder outside the extracted package.",
    );
  await doctor(source);
  if (await exists(destination)) {
    const old = JSON.parse(
      await readFile(join(destination, "manifest.json"), "utf8"),
    );
    if (old.name !== "Project CAD Assistant")
      throw new Error("The destination contains another application.");
  }
  const stage = destination + ".install-" + randomUUID(),
    backup = destination + ".previous-" + randomUUID();
  let backedUp = false,
    promoted = false;
  await mkdir(dirname(destination), { recursive: true });
  try {
    await cp(source, stage, { recursive: true, preserveTimestamps: true });
    await doctor(stage);
    await shutdownExisting();
    if (await exists(destination)) {
      await rename(destination, backup);
      backedUp = true;
    }
    await rename(stage, destination);
    promoted = true;
    await integration(destination, loadAssistantSettings(root).startAtLogin);
    if (!noStart)
      await execute(
        join(
          destination,
          "runtime",
          process.platform === "win32" ? "node.exe" : "node",
        ),
        [join(destination, "app", "desktop.mjs"), "launch"],
        { timeout: 30000, windowsHide: true },
      );
  } catch (error) {
    if (promoted) await rm(destination, { recursive: true, force: true });
    if (backedUp) {
      await rename(backup, destination);
      await integration(destination, loadAssistantSettings(root).startAtLogin);
    }
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
  // Cleanup is outside rollback: a partially deleted backup cannot replace the
  // working new version. Also retire backups left by earlier interrupted updates.
  await removePreviousInstallations(destination, [source, root]);
  return { installed: destination, historyPreserved: true };
}

async function serve() {
  const token = randomBytes(32).toString("base64url");
  const tickets = new Map<string, number>(),
    sessions = new Map<string, number>();
  let worker: ChildProcess | undefined,
    stoppingWorker = false,
    shuttingDown = false,
    workerError = "",
    approvalError = "",
    retries = 0;
  let lifecycle = Promise.resolve();
  let approvalTimer: ReturnType<typeof setInterval> | undefined;
  const setup = new ProviderSetup(root, resources, signIn);
  let setupTimer: ReturnType<typeof setInterval> | undefined;
  function exclusive<T>(work: () => Promise<T>) {
    const result = lifecycle.then(work);
    lifecycle = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  const logs = join(root, "logs");
  await mkdir(logs, { recursive: true, mode: 0o700 });
  const log = openSync(join(logs, "assistant.log"), "a", 0o600);
  async function stopWorker() {
    stoppingWorker = true;
    const child = worker;
    if (child && child.exitCode === null && child.signalCode === null) {
      if (child.connected) child.send({ type: "project-cad-shutdown" });
      else child.kill();
      for (
        let i = 0;
        i < 100 && child.exitCode === null && child.signalCode === null;
        i++
      )
        await pause(100);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await pause(200);
      }
    }
    worker = undefined;
  }
  async function startWorker() {
    if (await assistantHealth()) return;
    stoppingWorker = false;
    workerError = "";
    const child = spawn(
      process.execPath,
      [join(resources, "app", "assistant.mjs")],
      {
        cwd: root,
        env: {
          ...process.env,
          PATH: [
            dirname(process.execPath),
            join(homedir(), ".local", "bin"),
            process.env.PATH || "",
          ].join(delimiter),
          PROJECT_CAD_ASSISTANT_DATA: root,
          PROJECT_CAD_DESKTOP_MANAGED: "1",
        },
        stdio: ["ignore", log, log, "ipc"],
        windowsHide: true,
      },
    );
    worker = child;
    child.on("error", (error) => {
      workerError = error.message;
    });
    child.once("exit", () => {
      if (worker === child) worker = undefined;
      if (!stoppingWorker && !shuttingDown && retries++ < 3)
        setTimeout(() => {
          if (!stoppingWorker && !shuttingDown)
            void exclusive(async () => {
              if (!stoppingWorker && !shuttingDown) await startWorker();
            }).catch((error) => {
              workerError = error.message;
            });
        }, 3000);
    });
    for (let i = 0; i < 100; i++) {
      if (await assistantHealth()) return;
      if (child.exitCode !== null) break;
      await pause(100);
    }
    throw new Error(
      workerError ||
        "The assistant could not start. Open its logs to check the error.",
    );
  }
  async function status() {
    const settings = loadAssistantSettings(root);
    return {
      running: await assistantHealth(),
      managed: !!worker,
      websiteUrl: settings.websiteUrl,
      startAtLogin: settings.startAtLogin,
      agents: settings.agents,
      connections: new ConnectionRequests(root).pending(),
      museAvailable: !!providerExecutable("muse"),
      providerSetup: setup.states,
      codexAvailable: !!providerExecutable("codex"),
      claudeAvailable: !!providerExecutable("claude"),
      canUninstall:
        process.platform === "win32" &&
        (await exists(join(resources, "uninstall-windows.ps1"))) &&
        (await exists(join(resources, "runtime", "node.exe"))),
      message: workerError || approvalError,
    };
  }
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(approvalTimer);
    clearInterval(setupTimer);
    setupTimer = undefined;
    approvalTimer = undefined;
    await exclusive(stopWorker);
    server.closeAllConnections();
    server.close();
    closeSync(log);
    const saved = JSON.parse(
      await readFile(stateFile, "utf8").catch(() => "{}"),
    );
    if (saved.token === token) await rm(stateFile, { force: true });
    setTimeout(() => process.exit(0), 100).unref();
  }
  function launchTicket() {
    for (const [key, expires] of tickets)
      if (expires < Date.now()) tickets.delete(key);
    if (tickets.size > 20) tickets.clear();
    const ticket = randomBytes(32).toString("base64url");
    tickets.set(ticket, Date.now() + 60000);
    return { url: origin + "/open?ticket=" + ticket };
  }
  async function command(action: string) {
    if (action === "ticket") return launchTicket();
    if (action === "shutdown") {
      setTimeout(() => void shutdown(), 50);
      return { stopping: true };
    }
    if (action === "start") {
      retries = 0;
      await exclusive(startWorker);
    } else if (action === "stop") await exclusive(stopWorker);
    else if (action !== "status") throw new Error("Unknown desktop command.");
    return status();
  }
  const html = await readFile(join(resources, "desktop.html"), "utf8");
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const json = (code: number, value: unknown) => {
      response.writeHead(code, { "Content-Type": "application/json" });
      response.end(JSON.stringify(value));
    };
    try {
      if (request.headers.host !== `127.0.0.1:${port}`)
        return json(403, { error: "Invalid local host." });
      const url = new URL(request.url || "/", origin);
      if (url.pathname === "/health" && request.method === "GET")
        return json(200, { name: "Project CAD desktop", version: 1 });
      if (url.pathname === "/open" && request.method === "GET") {
        const ticket = url.searchParams.get("ticket") || "",
          expiry = tickets.get(ticket);
        tickets.delete(ticket);
        if (!expiry || expiry < Date.now())
          return json(403, {
            error: "Reopen Project CAD Assistant from your desktop.",
          });
        for (const [key, expires] of sessions)
          if (expires < Date.now()) sessions.delete(key);
        if (sessions.size > 20) sessions.clear();
        const session = randomBytes(32).toString("base64url");
        sessions.set(session, Date.now() + 12 * 3600000);
        response.writeHead(303, {
          Location: "/",
          "Set-Cookie": `pcad_desktop=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`,
        });
        response.end();
        return;
      }
      const cliToken =
        request.headers.authorization?.replace(/^Bearer /, "") || "";
      const cli =
        !request.headers.origin &&
        cliToken.length === token.length &&
        timingSafeEqual(Buffer.from(cliToken), Buffer.from(token));
      const cookie =
        request.headers.cookie
          ?.split(";")
          .map((x) => x.trim())
          .find((x) => x.startsWith("pcad_desktop="))
          ?.slice(13) || "";
      const browser = (sessions.get(cookie) || 0) > Date.now();
      if (url.pathname === "/" && request.method === "GET") {
        if (!browser)
          return json(403, {
            error: "Open Project CAD Assistant from your desktop to manage it.",
          });
        const nonce = randomBytes(18).toString("base64");
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
        });
        response.end(html.replaceAll("__NONCE__", nonce));
        return;
      }
      if (url.pathname === "/api/state" && request.method === "GET" && browser)
        return json(200, await status());
      const uiAction =
        url.pathname === "/api/action" &&
        browser &&
        request.headers.origin === origin &&
        request.headers["x-project-cad-desktop"] === "1";
      if (
        request.method !== "POST" ||
        !(uiAction || (url.pathname === "/command" && cli))
      )
        return json(403, { error: "Invalid desktop request." });
      if (!request.headers["content-type"]?.startsWith("application/json"))
        return json(400, { error: "Expected JSON." });
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 24000) throw new Error("Request is too large.");
      }
      const value = JSON.parse(body);
      if (cli) return json(200, await command(value.action));
      if (
        value.action === "approve-connection" ||
        value.action === "deny-connection"
      ) {
        const requests = new ConnectionRequests(root);
        const pending = requests.get(value.id);
        requests.decide(value.id, value.action === "approve-connection");
        if (value.action === "approve-connection" && pending) {
          saveAssistantSettings(root, {
            ...loadAssistantSettings(root),
            agents: pending.agents,
          });
          if (process.env.PROJECT_CAD_DISABLE_AGENT_SETUP !== "1")
            setup.ensure(pending.agents.providers);
        }
        return json(200, {
          message:
            value.action === "approve-connection"
              ? "Connection approved. Return to your project."
              : "Connection declined.",
        });
      }
      if (value.action === "settings") {
        const previous = loadAssistantSettings(root);
        const settings = settingsSchema.parse({
          ...previous,
          websiteUrl: value.websiteUrl,
          startAtLogin: value.startAtLogin,
          museApiKey: value.clearMuseKey
            ? ""
            : value.museApiKey || previous.museApiKey,
        });
        applicationOrigin(settings.websiteUrl);
        const next = join(root, "settings-" + randomUUID() + ".tmp");
        await writeFile(next, JSON.stringify(settings), { mode: 0o600 });
        await rename(next, join(root, "settings.json"));
        await integration(resources, settings.startAtLogin);
        await exclusive(async () => {
          await stopWorker();
          retries = 0;
          await startWorker();
        });
        return json(200, {
          message: "Settings saved. Reconnect the assistant in Project CAD.",
        });
      }
      if (
        value.action === "signin" &&
        ["codex", "claude", "muse"].includes(value.provider)
      ) {
        if (
          !loadAssistantSettings(root).agents?.providers.includes(
            value.provider,
          )
        )
          throw new Error(
            "Choose this agent on the website before setting it up.",
          );
        void setup.prepare(value.provider);
        return json(202, {
          message:
            "Checking your agent. Sign-in opens automatically if needed.",
        });
      }
      if (value.action === "open") {
        await openTarget(loadAssistantSettings(root).websiteUrl);
        return json(200, {});
      }
      if (value.action === "logs") {
        await openTarget(logs);
        return json(200, {});
      }
      if (value.action === "uninstall" && process.platform === "win32") {
        const file = join(resources, "uninstall-windows.ps1");
        await access(file);
        const child = spawn(
          windowsExecutable("WindowsPowerShell/v1.0/powershell.exe"),
          [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            file,
          ],
          {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
            cwd: homedir(),
          },
        );
        await new Promise<void>((resolve, reject) => {
          child.once("spawn", resolve);
          child.once("error", reject);
        });
        child.unref();
        return json(200, {
          message:
            "Confirm removal in the uninstall window. Your projects, conversations, and sign-ins will be kept.",
        });
      }
      if (["start", "stop"].includes(value.action))
        return json(200, await command(value.action));
      return json(400, { error: "Unknown desktop action." });
    } catch (error) {
      json(400, {
        error:
          error instanceof Error ? error.message : "Desktop operation failed.",
      });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.once(signal, () => void shutdown());
  await exclusive(startWorker).catch((error) => {
    workerError = error.message;
  });
  await writeFile(
    stateFile,
    JSON.stringify({ port, token, pid: process.pid }),
    { mode: 0o600 },
  );
  const approvals = new ApprovalNotifier(
    new ConnectionRequests(root),
    async () => {
      const launch = launchTicket();
      const ticket = new URL(launch.url).searchParams.get("ticket")!;
      await openTarget(launch.url);
      // Dispatching a URL can succeed without a browser opening it. Do not
      // suppress retries until the browser has redeemed the private ticket.
      if (process.env.PROJECT_CAD_NO_DESKTOP_OPEN !== "1") {
        for (let attempt = 0; attempt < 100 && tickets.has(ticket); attempt++)
          await pause(100);
        if (tickets.has(ticket)) {
          tickets.delete(ticket);
          throw new Error(
            "The browser did not open the approval window. Open Project CAD Assistant from your Start or application menu.",
          );
        }
      }
      approvalError = "";
    },
  );
  approvalTimer = setInterval(() => {
    if (!shuttingDown)
      void approvals.check().catch((error) => {
        console.error(
          "Could not open the approval window:",
          error instanceof Error ? error.message : "Desktop launch failed",
        );
        approvalError =
          "Open Project CAD Assistant from your Start or application menu to approve the connection.";
      });
  }, 1000);
  approvalTimer.unref();
  if (process.env.PROJECT_CAD_DISABLE_AGENT_SETUP !== "1")
    setup.ensure(loadAssistantSettings(root).agents?.providers ?? []);
  setupTimer = setInterval(() => void setup.refresh(), 5000);
  setupTimer.unref();
}

async function main() {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const [command = "launch", ...args] = process.argv.slice(2);
  if (command === "doctor") {
    console.log(JSON.stringify(await doctor()));
    return;
  }
  if (command === "serve") {
    await serve();
    return;
  }
  if (command === "install") {
    console.log(
      JSON.stringify(
        await install(
          args[0] || resources,
          args.find((x) => x !== "--no-start" && x !== args[0]),
          args.includes("--no-start"),
        ),
      ),
    );
    return;
  }
  if (command === "uninstall") {
    await shutdownExisting();
    await integration(resources, false, true);
    console.log(JSON.stringify({ stopped: true, historyPreserved: true }));
    return;
  }
  if (command === "shutdown") {
    await shutdownExisting();
    return;
  }
  if (["status", "stop", "start", "ticket"].includes(command)) {
    console.log(JSON.stringify(await control(command)));
    return;
  }
  if (!["launch", "--background", "background"].includes(command))
    throw new Error("Unknown assistant command.");
  try {
    await control("status");
  } catch {
    await doctor();
    await mkdir(join(root, "logs"), { recursive: true, mode: 0o700 });
    const log = openSync(join(root, "logs", "desktop.log"), "a", 0o600);
    const child = spawn(
      process.execPath,
      [join(resources, "app", "desktop.mjs"), "serve"],
      {
        detached: true,
        stdio: ["ignore", log, log],
        windowsHide: true,
        cwd: root,
      },
    );
    child.on("error", () => {});
    child.unref();
    closeSync(log);
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        await control("status");
        ready = true;
        break;
      } catch {
        await pause(150);
      }
    }
    if (!ready)
      throw new Error(
        "Could not start Project CAD Assistant. Check the desktop log in your assistant data folder.",
      );
  }
  // Reopening an existing desktop session must also resume a stopped worker.
  // Checking the controller alone can otherwise claim success while the website
  // still cannot reach the assistant.
  await control("start");
  if (command === "launch") {
    const ticket = await control("ticket");
    await openTarget(ticket.url);
  }
  console.log(JSON.stringify({ running: true }));
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Assistant operation failed.",
  );
  process.exitCode = 1;
});

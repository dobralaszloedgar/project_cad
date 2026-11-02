import {
  accessSync,
  constants,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { delimiter, dirname, join, isAbsolute, relative } from "node:path";
import { z } from "zod";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  agentSelectionSchema,
  MUSE_AGENTS,
  PROJECT_CAD_ORIGIN,
  type ProviderId,
} from "../../assistant/protocol";

export const settingsSchema = z
  .object({
    websiteUrl: z.string().url().default(PROJECT_CAD_ORIGIN),
    startAtLogin: z.boolean().default(true),
    museApiKey: z.string().max(10000).default(""),
    // Migrate existing selections while preserving the user's other settings.
    agents: agentSelectionSchema
      .nullable()
      .optional()
      .transform(() => MUSE_AGENTS),
  })
  .strict();

export function applicationOrigin(value: string) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
  )
    throw new Error(
      "Choose an HTTPS Project CAD address or a localhost address.",
    );
  return url.origin;
}

export function loadAssistantSettings(root: string) {
  let input: unknown = {};
  try {
    input = JSON.parse(readFileSync(join(root, "settings.json"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error(
        "Could not read assistant settings. Open Project CAD Assistant to repair them.",
      );
  }
  const settings = settingsSchema.parse(input);
  applicationOrigin(settings.websiteUrl);
  return settings;
}

export function saveAssistantSettings(root: string, input: unknown) {
  const settings = settingsSchema.parse(input);
  applicationOrigin(settings.websiteUrl);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const temporary = join(root, `settings-${randomUUID()}.tmp`);
  writeFileSync(temporary, JSON.stringify(settings), { mode: 0o600 });
  renameSync(temporary, join(root, "settings.json"));
  return settings;
}

export function assistantOrigins(websiteUrl: string, override?: string) {
  return [
    ...new Set(
      (
        override ||
        `${PROJECT_CAD_ORIGIN},${applicationOrigin(websiteUrl)},http://127.0.0.1:3000,http://localhost:3000`
      )
        .split(",")
        .map((value) => applicationOrigin(value.trim())),
    ),
  ];
}

function windowsNpmExecutables(provider: ProviderId, directory: string) {
  if (provider !== "codex" || !["x64", "arm64"].includes(process.arch))
    return [];
  const packageRoot = join(directory, "node_modules", "@openai", "codex");
  const target =
    process.arch === "arm64"
      ? "aarch64-pc-windows-msvc"
      : "x86_64-pc-windows-msvc";
  const vendors = [join(packageRoot, "vendor")];
  try {
    // npm exposes codex.cmd/codex.ps1, which cannot be spawned as executables.
    // Resolve its native optional package just as the official CLI does, keeping
    // vendor sidecars and existing sign-in without invoking a command shell.
    const require = createRequire(
      realpathSync(join(packageRoot, "package.json")),
    );
    vendors.unshift(
      join(
        dirname(
          require.resolve(`@openai/codex-win32-${process.arch}/package.json`),
        ),
        "vendor",
      ),
    );
  } catch {
    // Older npm releases put vendor/ directly inside @openai/codex.
  }
  return vendors.map((vendor) => join(vendor, target, "bin", "codex.exe"));
}

export function providerExecutable(provider: ProviderId): string | undefined {
  const override = process.env[`PROJECT_CAD_${provider.toUpperCase()}_BIN`];
  const managedDirectory = join(
    process.env.PROJECT_CAD_ASSISTANT_DATA ||
      join(homedir(), ".project-cad", "assistant"),
    "providers",
    provider,
  );
  const managed = join(managedDirectory, provider);
  let pointer: string | undefined;
  try {
    const saved = JSON.parse(
      readFileSync(join(managedDirectory, "installation.json"), "utf8"),
    );
    if (typeof saved.executable === "string" && !isAbsolute(saved.executable)) {
      const file = join(managedDirectory, saved.executable);
      if (!relative(managedDirectory, file).startsWith("..")) pointer = file;
    }
  } catch {
    /* No managed Windows installation. */
  }
  const directories = [
    ...(provider === "muse" && process.env.MUSE_INSTALL_DIR
      ? [process.env.MUSE_INSTALL_DIR]
      : []),
    join(homedir(), ".local", "bin"),
    join(homedir(), ".npm-global", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    ...(process.platform === "win32"
      ? [
          join(
            process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"),
            "Programs",
            "muse",
          ),
          join(
            process.env.APPDATA || join(homedir(), "AppData", "Roaming"),
            "npm",
          ),
          join(
            process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"),
            "Microsoft",
            "WinGet",
            "Links",
          ),
        ]
      : []),
    ...(process.env.PATH || "").split(delimiter),
  ];
  const candidates = override
    ? [override]
    : [
        ...(pointer ? [pointer] : []),
        managed + (process.platform === "win32" ? ".exe" : ""),
        managed,
        ...directories
          .filter(Boolean)
          .flatMap((directory) => [
            join(
              directory,
              provider + (process.platform === "win32" ? ".exe" : ""),
            ),
            ...(process.platform === "win32"
              ? windowsNpmExecutables(provider, directory)
              : []),
            ...(provider === "muse" && process.platform === "win32"
              ? windowsMuseExecutables(directory)
              : []),
          ]),
      ];
  for (const file of candidates) {
    try {
      accessSync(file, constants.X_OK);
      if (statSync(file).isFile()) return file;
    } catch {
      /* Try the next user installation. */
    }
  }
  return undefined;
}

function windowsMuseExecutables(directory: string) {
  try {
    // The official Windows installer exposes muse.cmd; MSP needs the native
    // executable, not a shell shim. Follow the launcher's validated pointer.
    const version = readFileSync(
      join(directory, ".muse-version"),
      "utf8",
    ).trim();
    if (/^\d+\.\d+\.\d+-R\d+(?:\.\d+)?$/.test(version))
      return [join(directory, `muse-bin-${version}.exe`)];
  } catch {
    /* Not an official Muse installation. */
  }
  return [];
}

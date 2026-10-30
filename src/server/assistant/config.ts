import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, isAbsolute, relative } from "node:path";
import { z } from "zod";

export const settingsSchema = z
  .object({
    websiteUrl: z.string().url().default("http://127.0.0.1:3000"),
    startAtLogin: z.boolean().default(true),
    museApiKey: z.string().max(10000).default(""),
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

export function providerExecutable(
  provider: "codex" | "claude",
): string | undefined {
  const override =
    process.env[
      provider === "codex" ? "PROJECT_CAD_CODEX_BIN" : "PROJECT_CAD_CLAUDE_BIN"
    ];
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
    join(homedir(), ".local", "bin"),
    join(homedir(), ".npm-global", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    ...(process.platform === "win32"
      ? [
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
        managed,
        ...directories
          .filter(Boolean)
          .map((directory) =>
            join(
              directory,
              provider + (process.platform === "win32" ? ".exe" : ""),
            ),
          ),
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

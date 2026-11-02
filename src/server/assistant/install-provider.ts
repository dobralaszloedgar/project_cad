import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { providerExecutable } from "./config";
import { installMuse } from "./install-muse";
import type { ProviderId } from "../../assistant/protocol";

const execute = promisify(execFile);

export async function installProvider(
  provider: ProviderId,
  resources: string,
  root: string,
) {
  const existing = providerExecutable(provider);
  if (existing) return { path: existing, installed: false };
  if (provider === "muse") return installMuse(root);
  const release = JSON.parse(
    await readFile(join(resources, "releases.json"), "utf8"),
  );
  const entry = (
    process.platform === "darwin"
      ? release.providers[provider][process.arch]
      : release.providers[provider].targets?.[
          `${process.platform}-${process.arch}`
        ]
  ) as { url: string; integrity: string; binary: string } | undefined;
  if (!entry)
    throw new Error("No provider package is available for this system.");
  if (
    !entry.url.startsWith("https://registry.npmjs.org/") ||
    !entry.binary.startsWith("package/") ||
    entry.binary.split(/[\\/]/).includes("..")
  )
    throw new Error("Invalid provider package configuration.");
  const temporary = await mkdtemp(join(tmpdir(), "project-cad-provider-"));
  let installedDirectory: string | undefined,
    next: string | undefined,
    promoted = false;
  try {
    const response = await fetch(entry.url, {
      signal: AbortSignal.timeout(180000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(
        `Provider download failed (${response.status}). Try setup again.`,
      );
    const data = Buffer.from(await response.arrayBuffer());
    if (
      `sha512-${createHash("sha512").update(data).digest("base64")}` !==
      entry.integrity
    )
      throw new Error(
        "Provider checksum did not match. Nothing was installed.",
      );
    const archive = join(temporary, "provider.tgz");
    await writeFile(archive, data);
    const tar =
      process.platform === "win32"
        ? join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe")
        : "/usr/bin/tar";
    await execute(tar, ["-xzf", archive, "-C", temporary], {
      timeout: 60000,
      windowsHide: true,
    });
    const target = join(root, "providers", provider);
    await mkdir(target, { recursive: true, mode: 0o700 });
    const versionDirectory = `version-${release.providers[provider].version}-${randomUUID()}`;
    installedDirectory = join(target, versionDirectory);
    await cp(join(temporary, "package"), join(installedDirectory, "package"), {
      recursive: true,
    });
    const executable = join(installedDirectory, entry.binary);
    await chmod(executable, 0o755);
    await execute(executable, ["--version"], {
      timeout: 30000,
      windowsHide: true,
    });
    if (process.platform === "win32") {
      // A relative pointer preserves vendor sidecars without Windows symlink privileges.
      next = join(target, `installation.next-${randomUUID()}.json`);
      await writeFile(
        next,
        JSON.stringify({ executable: join(versionDirectory, entry.binary) }),
        { mode: 0o600 },
      );
      await rename(next, join(target, "installation.json"));
    } else {
      next = join(target, `${provider}.next-${randomUUID()}`);
      await symlink(join(versionDirectory, entry.binary), next);
      await rename(next, join(target, provider));
    }
    promoted = true;
    return {
      path: process.platform === "win32" ? executable : join(target, provider),
      installed: true,
    };
  } finally {
    if (next) await rm(next, { force: true });
    if (!promoted && installedDirectory)
      await rm(installedDirectory, { recursive: true, force: true });
    await rm(temporary, { recursive: true, force: true });
  }
}

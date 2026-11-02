import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const execute = promisify(execFile);
const releaseSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+-R\d+(?:\.\d+)?$/),
  checksum_algorithm: z.literal("sha256"),
  artifacts: z.record(
    z.string(),
    z.object({
      url: z.string().url(),
      checksum: z.string().regex(/^[a-f0-9]{64}$/),
      size: z.number().int().positive().max(800_000_000),
    }),
  ),
});
export function museTarget(platform: string, arch: string) {
  const os = { win32: "windows", darwin: "macos", linux: "linux" }[platform];
  const cpu = { x64: "x86", arm64: "aarch64" }[arch];
  if (!os || !cpu) throw new Error("Muse Code is unavailable for this system.");
  return `${cpu}_${os}`;
}
function downloadUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "lookaside.facebook.com" ||
    url.pathname !== "/lookaside/muse/download/" ||
    url.username ||
    url.password
  )
    throw new Error("Invalid Muse Code download address.");
  return url.href;
}
async function download(url: string, timeout = 30000) {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok)
    throw new Error(
      `Muse Code download failed (${response.status}). Try setup again.`,
    );
  return response;
}
/** Use the same channel, release manifest and SHA-256 verification as Meta's installer. */
export async function installMuse(root: string) {
  const target = museTarget(process.platform, process.arch);
  const channel = z
    .object({ version: z.string(), manifest_url: z.string() })
    .parse(
      await (
        await download("https://api.meta.ai/muse-code/channels/muse-stable")
      ).json(),
    );
  const release = releaseSchema.parse(
    await (await download(downloadUrl(channel.manifest_url))).json(),
  );
  if (release.version !== channel.version || !release.artifacts[target])
    throw new Error("Muse Code release does not match this system.");
  const entry = release.artifacts[target];
  // Native packages are large; allow slower connections to finish installation.
  const response = await download(downloadUrl(entry.url), 30 * 60 * 1000);
  const directory = join(root, "providers", "muse");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = `muse-${release.version}-${randomUUID()}${process.platform === "win32" ? ".exe" : ""}`;
  const file = join(directory, filename);
  const pointer = join(directory, `installation-${randomUUID()}.tmp`);
  let promoted = false;
  try {
    if (!response.body) throw new Error("Muse Code download was empty.");
    const hash = createHash("sha256");
    let size = 0;
    async function* verifiedBytes() {
      for await (const chunk of response.body!) {
        size += chunk.byteLength;
        if (size > entry.size)
          throw new Error("Muse Code download exceeded its expected size.");
        hash.update(chunk);
        yield chunk;
      }
    }
    await writeFile(file, verifiedBytes(), { mode: 0o700, flag: "wx" });
    if (size !== entry.size || hash.digest("hex") !== entry.checksum)
      throw new Error(
        "Muse Code checksum did not match. Nothing was installed.",
      );
    await chmod(file, 0o755);
    await execute(file, ["--version"], { timeout: 30000, windowsHide: true });
    await writeFile(pointer, JSON.stringify({ executable: filename }), {
      mode: 0o600,
    });
    await rename(pointer, join(directory, "installation.json"));
    promoted = true;
    return { path: file, installed: true };
  } finally {
    await rm(pointer, { force: true });
    if (!promoted) await rm(file, { force: true });
  }
}

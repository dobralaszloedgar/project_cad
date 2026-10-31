import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assistantDownloadLocation } from "../../src/assistant/download-location.mjs";

export const artifactPattern =
  /^ProjectCAD-Assistant-(?:macos-universal\.(?:pkg|zip)|windows-(?:x64|arm64)(?:-Setup\.exe|\.zip)|linux-(?:x64|arm64)\.(?:run|tar\.gz))$/;
export const repositoryPattern =
  /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

export function validateManifest(manifest, { published = false } = {}) {
  if (
    manifest?.name !== "Project CAD Assistant" ||
    !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== 10
  ) {
    throw new Error(
      "Expected the complete Project CAD Assistant release: ten packages across all five platform/CPU targets.",
    );
  }
  const names = new Set();
  for (const file of manifest.files) {
    if (
      !file ||
      typeof file.filename !== "string" ||
      !artifactPattern.test(file.filename) ||
      names.has(file.filename) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes <= 0 ||
      typeof file.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    ) {
      throw new Error("Invalid, duplicate, or incomplete release artifact.");
    }
    const target =
      /^ProjectCAD-Assistant-(macos|windows|linux)-(universal|x64|arm64)/.exec(
        file.filename,
      );
    if (file.platform !== target[1] || file.architecture !== target[2])
      throw new Error("Artifact platform or CPU does not match its filename.");
    names.add(file.filename);
  }
  const location = assistantDownloadLocation(manifest);
  if (published && !location.baseUrl.startsWith("https://"))
    throw new Error("The website requires a versioned public release.");
  return manifest;
}

export async function verifyLocalArtifacts(directory, manifest) {
  validateManifest(manifest);
  for (const file of manifest.files) {
    const data = await readFile(join(directory, file.filename));
    if (data.length !== file.bytes || sha256(data) !== file.sha256)
      throw new Error(`Checksum mismatch: ${file.filename}`);
    const checksum = await readFile(
      join(directory, `${file.filename}.sha256`),
      "utf8",
    );
    if (checksum.trim() !== `${file.sha256}  ${file.filename}`)
      throw new Error(`Checksum sidecar mismatch: ${file.filename}`);
  }
}

export function assertReleaseAssets(assets, expected) {
  if (!Array.isArray(assets) || assets.length !== expected.length)
    throw new Error(
      "The remote release asset list is incomplete or contains unexpected files.",
    );
  for (const file of expected) {
    const asset = assets.find((item) => item.name === file.filename);
    if (
      asset?.state !== "uploaded" ||
      asset.size !== file.bytes ||
      asset.digest !== `sha256:${file.sha256}`
    )
      throw new Error(`Remote checksum or size mismatch: ${file.filename}`);
  }
}

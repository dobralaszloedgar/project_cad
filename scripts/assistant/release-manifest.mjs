// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assistantDownloadLocation,
  assistantDownloadFileLocation,
} from "../../src/assistant/download-location.mjs";

export const artifactPattern =
  /^ProjectCAD-Assistant-(?:macos-universal\.(?:pkg|zip)|windows-(?:(?:x64|arm64)(?:-Setup\.exe|\.zip)|universal-Setup\.exe)|linux-(?:(?:x64|arm64)\.(?:run|tar\.gz)|universal\.run))$/;
export const installerPattern =
  /^ProjectCAD-Assistant-(?:macos-universal\.pkg|windows-(?:x64|arm64|universal)-Setup\.exe|linux-(?:x64|arm64|universal)\.run)$/;
export const universalInstallerPattern =
  /^ProjectCAD-Assistant-(?:macos-universal\.pkg|windows-universal-Setup\.exe|linux-universal\.run)$/;
const universalInstallers = [
  "ProjectCAD-Assistant-macos-universal.pkg",
  "ProjectCAD-Assistant-windows-universal-Setup.exe",
  "ProjectCAD-Assistant-linux-universal.run",
];
const legacyInstallers = [
  universalInstallers[0],
  ...["x64", "arm64"].flatMap((arch) => [
    `ProjectCAD-Assistant-windows-${arch}-Setup.exe`,
    `ProjectCAD-Assistant-linux-${arch}.run`,
  ]),
];
const archives = [
  "ProjectCAD-Assistant-macos-universal.zip",
  ...["x64", "arm64"].flatMap((arch) => [
    `ProjectCAD-Assistant-windows-${arch}.zip`,
    `ProjectCAD-Assistant-linux-${arch}.tar.gz`,
  ]),
];
const completeInventories = [
  universalInstallers,
  legacyInstallers,
  [...legacyInstallers, ...archives],
  [...legacyInstallers, ...archives, ...universalInstallers.slice(1)],
];
export const repositoryPattern =
  /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/** @param {{published?: boolean, platform?: string}} [options] */
export function validateManifest(manifest, options = {}) {
  const { published = false } = options;
  if (
    manifest?.platforms !== undefined &&
    (!Array.isArray(manifest.platforms) ||
      !manifest.platforms.length ||
      manifest.platforms.some((item) => typeof item !== "string"))
  )
    throw new Error("Invalid release platforms.");
  const platform = options.platform ?? manifest?.platforms?.join(",");
  const platforms = platform?.split(",");
  if (
    platforms &&
    (new Set(platforms).size !== platforms.length ||
      platforms.some((item) => !["macos", "windows", "linux"].includes(item)))
  )
    throw new Error("Invalid release platform.");
  if (
    manifest?.name !== "Project CAD Assistant" ||
    !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
    !Array.isArray(manifest.files) ||
    manifest.files.length < 1 ||
    manifest.files.length > 12
  ) {
    throw new Error(
      "Expected a complete Project CAD Assistant release covering macOS, Windows, and Linux on x64 and ARM64.",
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
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      (file.version !== undefined &&
        (typeof file.version !== "string" ||
          !/^\d+\.\d+\.\d+$/.test(file.version)))
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
  if (
    !completeInventories
      .map((files) =>
        platforms
          ? files.filter((name) =>
              platforms.some((item) =>
                name.startsWith(`ProjectCAD-Assistant-${item}-`),
              ),
            )
          : files,
      )
      .some(
        (files) =>
          files.length === names.size && files.every((name) => names.has(name)),
      )
  )
    throw new Error("Missing or unexpected release targets.");
  const location = assistantDownloadLocation(manifest);
  for (const file of manifest.files)
    assistantDownloadFileLocation(manifest, file);
  if (published && !location.baseUrl.startsWith("https://"))
    throw new Error("The website requires a versioned public release.");
  return manifest;
}

export function preferredInstallers(files) {
  const universal = files.filter((file) =>
    universalInstallerPattern.test(file.filename),
  );
  const universalPlatforms = new Set(universal.map((file) => file.platform));
  return files.filter(
    (file) =>
      installerPattern.test(file.filename) &&
      (!universalPlatforms.has(file.platform) ||
        universalInstallerPattern.test(file.filename)),
  );
}

export async function verifyLocalArtifacts(
  directory,
  manifest,
  { platform } = {},
) {
  validateManifest(manifest, { platform });
  const installersOnly = manifest.files.every((file) =>
    installerPattern.test(file.filename),
  );
  if (installersOnly) {
    const checksums = await readFile(join(directory, "SHA256SUMS.txt"), "utf8");
    const expected = manifest.files
      .map((file) => `${file.sha256}  ${file.filename}`)
      .sort()
      .join("\n");
    if (checksums.trim().split(/\r?\n/).sort().join("\n") !== expected)
      throw new Error("Combined checksum manifest mismatch: SHA256SUMS.txt");
  }
  for (const file of manifest.files) {
    const data = await readFile(join(directory, file.filename));
    if (data.length !== file.bytes || sha256(data) !== file.sha256)
      throw new Error(`Checksum mismatch: ${file.filename}`);
    if (installersOnly) continue;
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

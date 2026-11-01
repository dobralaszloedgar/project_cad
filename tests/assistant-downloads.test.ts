import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assistantDownloads } from "../src/assistant/downloads";
import {
  assertReleaseAssets,
  installerPattern,
  sha256,
  validateManifest,
  verifyLocalArtifacts,
} from "../scripts/assistant/release-manifest.mjs";
import { stagePublishedDownloads } from "../scripts/assistant/stage-downloads.mjs";

const data = Buffer.from("test installer");
function manifest() {
  return {
    name: "Project CAD Assistant",
    version: "0.1.0",
    release: { repository: "dobralaszloedgar/project_cad", tag: "v0.1.0" },
    files: [
      ...["pkg", "zip"].map((ext) => ({
        platform: "macos",
        architecture: "universal",
        filename: `ProjectCAD-Assistant-macos-universal.${ext}`,
      })),
      ...["x64", "arm64"].flatMap((architecture) => [
        ...["-Setup.exe", ".zip"].map((ext) => ({
          platform: "windows",
          architecture,
          filename: `ProjectCAD-Assistant-windows-${architecture}${ext}`,
        })),
        ...[".run", ".tar.gz"].map((ext) => ({
          platform: "linux",
          architecture,
          filename: `ProjectCAD-Assistant-linux-${architecture}${ext}`,
        })),
      ]),
    ].map((file) => ({ ...file, bytes: data.length, sha256: sha256(data) })),
  };
}
const directories: string[] = [];
async function temporary() {
  const path = await mkdtemp(join(tmpdir(), "project-cad-release-"));
  directories.push(path);
  return path;
}
afterEach(async () => {
  for (const path of directories.splice(0))
    await rm(path, { recursive: true, force: true });
});

describe("assistant download distribution", () => {
  it("offers all five installers and checksums directly from a versioned public Blob store", async () => {
    const value = {
      ...manifest(),
      files: manifest().files.filter((file) =>
        installerPattern.test(file.filename),
      ),
      release: undefined,
      distribution: {
        provider: "vercel-blob",
        baseUrl:
          "https://teststore.public.blob.vercel-storage.com/project-cad-assistant/v0.1.0",
      },
    };
    expect(() => validateManifest(value, { published: true })).not.toThrow();
    const parsed = assistantDownloads(value)!;
    expect(parsed.installers).toHaveLength(5);
    expect(parsed.releaseUrl).toBeUndefined();
    expect(parsed.checksumsUrl).toBe(
      `${value.distribution.baseUrl}/SHA256SUMS.txt`,
    );
    for (const file of parsed.installers)
      expect(file.url).toBe(`${value.distribution.baseUrl}/${file.filename}`);
    const directory = await temporary();
    await stagePublishedDownloads(value, directory);
    expect(
      JSON.parse(await readFile(join(directory, "downloads.json"), "utf8")),
    ).toEqual(JSON.parse(JSON.stringify(value)));
  });
  it.each([
    "http://teststore.public.blob.vercel-storage.com/project-cad-assistant/v0.1.0",
    "https://teststore.private.blob.vercel-storage.com/project-cad-assistant/v0.1.0",
    "https://teststore.public.blob.vercel-storage.com.evil.example/project-cad-assistant/v0.1.0",
    "https://teststore.public.blob.vercel-storage.com/project-cad-assistant/latest",
    "https://teststore.public.blob.vercel-storage.com/project-cad-assistant/v0.1.1",
    "https://teststore.public.blob.vercel-storage.com/project-cad-assistant/v0.1.0/",
    "https://teststore.public.blob.vercel-storage.com/project-cad-assistant/v0.1.0?token=secret",
    "https://teststore.public.blob.vercel-storage.com/project-cad-assistant/v0.1.0#fragment",
    "https://user:secret@teststore.public.blob.vercel-storage.com/project-cad-assistant/v0.1.0",
    "https://teststore.public.blob.vercel-storage.com:443/project-cad-assistant/v0.1.0",
    "https://teststore.public.blob.vercel-storage.com/other/../project-cad-assistant/v0.1.0",
  ])(
    "rejects invalid Blob location without falling back to GitHub: %s",
    (baseUrl) => {
      const value = {
        ...manifest(),
        distribution: { provider: "vercel-blob", baseUrl },
      };
      expect(assistantDownloads(value)).toBeUndefined();
      expect(() => validateManifest(value, { published: true })).toThrow();
    },
  );
  it.each([
    null,
    {},
    { provider: "other" },
    { provider: "vercel-blob", baseUrl: 42 },
  ])("rejects malformed distribution metadata %j", (distribution) => {
    const value = { ...manifest(), distribution };
    expect(assistantDownloads(value)).toBeUndefined();
    expect(() => validateManifest(value, { published: true })).toThrow();
  });
  it("offers five installers with pinned direct GitHub URLs, plus the full release", () => {
    const parsed = assistantDownloads(manifest());
    expect(parsed?.installers).toHaveLength(5);
    expect(parsed?.releaseUrl).toBe(
      "https://github.com/dobralaszloedgar/project_cad/releases/tag/v0.1.0",
    );
    for (const file of parsed!.installers)
      expect(file.url).toBe(
        `https://github.com/dobralaszloedgar/project_cad/releases/download/v0.1.0/${file.filename}`,
      );
  });
  it.each([
    "../source",
    "owner/repo?token=value",
    "owner/repo/path",
    "https://evil.example/repo",
    "owner/repo#fragment",
    "owner/repo%2fother",
  ])("rejects an invalid release repository %s", (repository) => {
    const value = manifest();
    value.release.repository = repository;
    expect(assistantDownloads(value)).toBeUndefined();
    expect(() => validateManifest(value, { published: true })).toThrow();
  });
  it("does not fall back to a missing local installer when release metadata is malformed", () => {
    expect(
      assistantDownloads({ ...manifest(), release: null }),
    ).toBeUndefined();
    expect(
      assistantDownloads({
        ...manifest(),
        release: { repository: "owner/repo", tag: "latest" },
      }),
    ).toBeUndefined();
    const local = { ...manifest(), release: undefined };
    expect(assistantDownloads(local)?.installers[0].url).toBe(
      `/downloads/assistant/${local.files[0].filename}`,
    );
  });
  it("ignores malformed and duplicate download entries", () => {
    const value = manifest();
    expect(
      assistantDownloads({
        ...value,
        files: [
          null,
          value.files[0],
          value.files[0],
          { ...value.files[0], filename: "../../secret.pkg" },
          { ...value.files[1], bytes: -1 },
        ],
      })?.installers,
    ).toHaveLength(1);
  });
  it("requires every package and correct platform metadata before publishing", () => {
    const value = manifest();
    expect(() => validateManifest(value, { published: true })).not.toThrow();
    expect(() =>
      validateManifest({ ...value, files: value.files.slice(1) }),
    ).toThrow();
    expect(() =>
      validateManifest({
        ...value,
        files: value.files.map(() => value.files[0]),
      }),
    ).toThrow();
    value.files[0].architecture = "";
    expect(() => validateManifest(value)).toThrow();
  });
  it("requires all five installer targets in a reduced release", () => {
    const full = manifest();
    const value = {
      ...full,
      files: full.files.filter((file) => installerPattern.test(file.filename)),
    };
    expect(() => validateManifest(value, { published: true })).not.toThrow();
    expect(() =>
      validateManifest({ ...value, files: value.files.slice(1) }),
    ).toThrow();
    expect(() =>
      validateManifest({
        ...value,
        files: [full.files[1], ...value.files.slice(1)],
      }),
    ).toThrow();
    expect(() =>
      validateManifest({
        ...value,
        files: [value.files[1], ...value.files.slice(1)],
      }),
    ).toThrow();
  });
  it("verifies a reduced release using its combined checksums without sidecars", async () => {
    const directory = await temporary();
    const value = {
      ...manifest(),
      files: manifest().files.filter((file) =>
        installerPattern.test(file.filename),
      ),
    };
    for (const file of value.files)
      await writeFile(join(directory, file.filename), data);
    const checksums = value.files
      .map((file) => `${file.sha256}  ${file.filename}\n`)
      .join("");
    await writeFile(join(directory, "SHA256SUMS.txt"), checksums);
    await expect(
      verifyLocalArtifacts(directory, value),
    ).resolves.toBeUndefined();
    await writeFile(
      join(directory, "SHA256SUMS.txt"),
      checksums.replace(value.files[0].sha256, "0".repeat(64)),
    );
    await expect(verifyLocalArtifacts(directory, value)).rejects.toThrow(
      "Combined checksum",
    );
    await writeFile(join(directory, "SHA256SUMS.txt"), checksums);
    await writeFile(join(directory, value.files[0].filename), "corrupted");
    await expect(verifyLocalArtifacts(directory, value)).rejects.toThrow(
      "Checksum mismatch",
    );
  });
  it("rejects corrupted local binaries and checksum sidecars", async () => {
    const directory = await temporary(),
      value = manifest();
    for (const file of value.files) {
      await writeFile(join(directory, file.filename), data);
      await writeFile(
        join(directory, `${file.filename}.sha256`),
        `${file.sha256}  ${file.filename}\n`,
      );
    }
    await expect(
      verifyLocalArtifacts(directory, value),
    ).resolves.toBeUndefined();
    await writeFile(join(directory, value.files[0].filename), "corrupted");
    await expect(verifyLocalArtifacts(directory, value)).rejects.toThrow(
      "Checksum mismatch",
    );
    await writeFile(join(directory, value.files[0].filename), data);
    await writeFile(
      join(directory, `${value.files[0].filename}.sha256`),
      "wrong hash",
    );
    await expect(verifyLocalArtifacts(directory, value)).rejects.toThrow(
      "sidecar",
    );
  });
  it("refuses missing, partial, replaced, or unexpected remote assets", () => {
    const files = manifest().files;
    const assets = files.map((file) => ({
      name: file.filename,
      size: file.bytes,
      digest: `sha256:${file.sha256}`,
      state: "uploaded",
    }));
    expect(() => assertReleaseAssets(assets, files)).not.toThrow();
    expect(() => assertReleaseAssets(assets.slice(1), files)).toThrow();
    expect(() => assertReleaseAssets([...assets, assets[0]], files)).toThrow();
    expect(() =>
      assertReleaseAssets(
        [
          { ...assets[0], digest: `sha256:${"0".repeat(64)}` },
          ...assets.slice(1),
        ],
        files,
      ),
    ).toThrow();
    expect(() =>
      assertReleaseAssets(
        [{ ...assets[0], state: "starter" }, ...assets.slice(1)],
        files,
      ),
    ).toThrow();
  });
  it("stages only the published manifest and removes old generated binaries", async () => {
    const directory = await temporary(),
      value = manifest();
    await writeFile(join(directory, value.files[0].filename), data);
    await writeFile(
      join(directory, `${value.files[0].filename}.sha256`),
      "old",
    );
    await writeFile(join(directory, "keep.txt"), "keep");
    await stagePublishedDownloads(value, directory);
    expect((await readdir(directory)).sort()).toEqual([
      "downloads.json",
      "keep.txt",
    ]);
    expect(
      JSON.parse(await readFile(join(directory, "downloads.json"), "utf8")),
    ).toEqual(value);
    await expect(
      stagePublishedDownloads({ ...value, release: null }, directory),
    ).rejects.toThrow();
    expect(
      JSON.parse(await readFile(join(directory, "downloads.json"), "utf8")),
    ).toEqual(value);
  });
});

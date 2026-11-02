import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  sha256,
  validateManifest,
} from "../scripts/assistant/release-manifest.mjs";
import { assistantDownloads } from "../src/assistant/downloads";
import {
  prepareVercelRelease,
  uploadVerifiedFiles,
  verifyPublicFile,
} from "../scripts/assistant/publish-vercel.mjs";

const base =
  "https://teststore.public.blob.vercel-storage.com/project-cad-assistant/v0.1.2";
const files = ["installer.exe", "downloads.json"].map((filename) => {
  const data = Buffer.from(filename);
  return { filename, data, bytes: data.length, sha256: sha256(data) };
});

describe("Blob release publishing", () => {
  it.each(["windows", "windows,linux"])(
    "publishes %s while retaining the other platform downloads",
    async (platform) => {
      const directory = await mkdtemp(
        join(tmpdir(), "project-cad-windows-release-"),
      );
      try {
        const previous = {
          name: "Project CAD Assistant",
          version: "0.1.0",
          distribution: {
            provider: "vercel-blob",
            baseUrl: base.replace("v0.1.2", "v0.1.0"),
          },
          files: ["macos", "windows", "linux"].map((platform) => {
            const filename = `ProjectCAD-Assistant-${platform}-universal${platform === "macos" ? ".pkg" : platform === "windows" ? "-Setup.exe" : ".run"}`;
            return {
              platform,
              architecture: "universal",
              filename,
              bytes: Buffer.byteLength(filename),
              sha256: sha256(Buffer.from(filename)),
            };
          }),
        };
        const windows = {
          ...previous.files[1],
          bytes: 3,
          sha256: sha256(Buffer.from("new")),
        };
        const changed = [
          windows,
          ...(platform.includes("linux")
            ? [
                {
                  ...previous.files[2],
                  bytes: 3,
                  sha256: sha256(Buffer.from("new")),
                },
              ]
            : []),
        ];
        const source = {
          name: previous.name,
          version: "0.1.2",
          files: changed,
        };
        if (platform === "windows,linux") {
          expect(
            validateManifest(
              {
                ...source,
                platforms: ["windows", "linux"],
                release: { repository: "owner/app", tag: "v0.1.2" },
              },
              { published: true },
            ),
          ).toBeTruthy();
          expect(() =>
            validateManifest({ ...source, platforms: ["windows"] }),
          ).toThrow();
          expect(() =>
            validateManifest({ ...source, platforms: ["unknown"] }),
          ).toThrow();
        }
        await writeFile(
          join(directory, "downloads.json"),
          JSON.stringify(source),
        );
        await writeFile(join(directory, windows.filename), "new");
        if (changed[1])
          await writeFile(join(directory, changed[1].filename), "new");
        await writeFile(
          join(directory, "SHA256SUMS.txt"),
          changed.map((file) => `${file.sha256}  ${file.filename}\n`).join(""),
        );
        const prepared = await prepareVercelRelease(directory, base, {
          platform,
          previous,
        });
        expect(
          prepared.assets.map((file: { filename: string }) => file.filename),
        ).toEqual([
          ...changed.map((file) => file.filename),
          "SHA256SUMS.txt",
          "downloads.json",
        ]);
        expect(prepared.manifest.files).toEqual([
          { ...previous.files[0], version: "0.1.0" },
          ...(platform.includes("linux")
            ? []
            : [{ ...previous.files[2], version: "0.1.0" }]),
          ...changed,
        ]);
        const parsed = assistantDownloads(prepared.manifest)!;
        expect(
          parsed.installers.find((file) => file.platform === "windows")?.url,
        ).toBe(`${base}/${windows.filename}`);
        for (const file of parsed.installers.filter(
          (file) => !platform.split(",").includes(file.platform),
        ))
          expect(file.url).toBe(
            `${previous.distribution.baseUrl}/${file.filename}`,
          );
        await expect(
          prepareVercelRelease(
            directory,
            base.replace("teststore.", "otherstore."),
            { platform, previous },
          ),
        ).rejects.toThrow("existing download store");
        await writeFile(join(directory, windows.filename), "corrupt");
        await expect(
          prepareVercelRelease(directory, base, {
            platform,
            previous,
          }),
        ).rejects.toThrow("Checksum mismatch");
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it.each([false, true])(
    "publishes only preferred installers and two metadata files (universal: %s)",
    async (universal) => {
      const directory = await mkdtemp(
        join(tmpdir(), "project-cad-blob-release-"),
      );
      try {
        const inventory = [
          ["macos", "universal", ".pkg"],
          ["macos", "universal", ".zip"],
          ...["x64", "arm64"].flatMap((architecture) => [
            ["windows", architecture, "-Setup.exe"],
            ["windows", architecture, ".zip"],
            ["linux", architecture, ".run"],
            ["linux", architecture, ".tar.gz"],
          ]),
        ]
          .concat(
            universal
              ? [
                  ["windows", "universal", "-Setup.exe"],
                  ["linux", "universal", ".run"],
                ]
              : [],
          )
          .map(([platform, architecture, extension]) => {
            const filename = `ProjectCAD-Assistant-${platform}-${architecture}${extension}`;
            const data = Buffer.from(filename);
            return {
              platform,
              architecture,
              filename,
              bytes: data.length,
              sha256: sha256(data),
            };
          });
        const source = {
          name: "Project CAD Assistant",
          version: "0.1.2",
          files: inventory,
        };
        await writeFile(
          join(directory, "downloads.json"),
          JSON.stringify(source),
        );
        for (const file of inventory) {
          await writeFile(join(directory, file.filename), file.filename);
          await writeFile(
            join(directory, `${file.filename}.sha256`),
            `${file.sha256}  ${file.filename}\n`,
          );
        }
        const prepared = await prepareVercelRelease(directory, base);
        expect(prepared.sourceManifest).toEqual(source);
        expect(prepared.manifest.files).toHaveLength(universal ? 3 : 5);
        expect(
          prepared.assets.map((file: { filename: string }) => file.filename),
        ).toEqual(
          universal
            ? [
                "ProjectCAD-Assistant-macos-universal.pkg",
                "ProjectCAD-Assistant-windows-universal-Setup.exe",
                "ProjectCAD-Assistant-linux-universal.run",
                "SHA256SUMS.txt",
                "downloads.json",
              ]
            : [
                "ProjectCAD-Assistant-macos-universal.pkg",
                "ProjectCAD-Assistant-windows-x64-Setup.exe",
                "ProjectCAD-Assistant-linux-x64.run",
                "ProjectCAD-Assistant-windows-arm64-Setup.exe",
                "ProjectCAD-Assistant-linux-arm64.run",
                "SHA256SUMS.txt",
                "downloads.json",
              ],
        );
        // The published files must be sufficient to resume a later upload.
        for (const file of inventory) {
          await rm(join(directory, `${file.filename}.sha256`));
          if (
            !prepared.manifest.files.some(
              (item: { filename: string }) => item.filename === file.filename,
            )
          )
            await rm(join(directory, file.filename));
        }
        for (const asset of prepared.assets.filter(
          (file: { data?: Buffer }) => file.data,
        ))
          await writeFile(join(directory, asset.filename), asset.data);
        const resumed = await prepareVercelRelease(directory, base);
        expect(resumed.manifest).toEqual(prepared.manifest);
        expect(resumed.assets).toHaveLength(universal ? 5 : 7);
        expect(
          JSON.parse(await readFile(join(directory, "downloads.json"), "utf8")),
        ).toEqual(prepared.manifest);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
  it("verifies every uploaded file, publishes the manifest last, and resumes without overwrites", async () => {
    const remote = new Map<string, Buffer>();
    const fetcher = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      const data = remote.get(
        typeof url === "string" ? url : url instanceof URL ? url.href : url.url,
      );
      return data
        ? new Response(new Uint8Array(data))
        : new Response(null, { status: 404 });
    });
    const upload = vi.fn(async (pathname: string, data: Buffer) => {
      const url = `https://teststore.public.blob.vercel-storage.com/${pathname}`;
      remote.set(url, data);
      return { url };
    });
    await uploadVerifiedFiles(base, files, upload, fetcher);
    expect(upload.mock.calls.map(([path]) => path)).toEqual([
      "project-cad-assistant/v0.1.2/installer.exe",
      "project-cad-assistant/v0.1.2/downloads.json",
    ]);
    expect(upload).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      expect.objectContaining({
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: false,
      }),
    );
    await uploadVerifiedFiles(base, files, upload, fetcher);
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it("stops before publishing metadata when an existing file has different contents", async () => {
    const upload = vi.fn();
    await expect(
      uploadVerifiedFiles(
        base,
        files,
        upload,
        async () => new Response("wrong"),
      ),
    ).rejects.toThrow("checksum mismatch");
    expect(upload).not.toHaveBeenCalled();
  });

  it("does not publish the manifest after a failed binary upload", async () => {
    const upload = vi.fn().mockRejectedValue(new Error("Upload interrupted"));
    await expect(
      uploadVerifiedFiles(
        base,
        files,
        upload,
        async () => new Response(null, { status: 404 }),
      ),
    ).rejects.toThrow("Upload interrupted");
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("waits for public CDN availability before publishing the manifest", async () => {
    const remote = new Map<string, Buffer>();
    const pending = new Set<string>();
    const fetcher = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (pending.delete(url)) return new Response(null, { status: 404 });
      const data = remote.get(url);
      return data
        ? new Response(new Uint8Array(data))
        : new Response(null, { status: 404 });
    });
    const upload = vi.fn(async (pathname: string, data: Buffer) => {
      const url = `https://teststore.public.blob.vercel-storage.com/${pathname}`;
      remote.set(url, data);
      pending.add(url);
      return { url };
    });
    const wait = vi.fn(async () => undefined);
    await uploadVerifiedFiles(base, files, upload, fetcher, wait);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(pending.size).toBe(0);
  });

  it("rejects an upload returned from a different store", async () => {
    const upload = vi.fn().mockResolvedValue({
      url: "https://another.public.blob.vercel-storage.com/installer.exe",
    });
    await expect(
      uploadVerifiedFiles(
        base,
        files,
        upload,
        async () => new Response(null, { status: 404 }),
      ),
    ).rejects.toThrow("unexpected location");
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 500])(
    "does not treat HTTP %s as a missing public file",
    async (status) => {
      await expect(
        verifyPublicFile(`${base}/installer.exe`, files[0], {
          allowMissing: true,
          fetcher: async () => new Response(null, { status }),
        }),
      ).rejects.toThrow(`Public download failed (${status})`);
    },
  );
});

// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { finalizeManifest } from "../scripts/assistant/artifacts.mjs";

it.each(["linux", "darwin", "win32"])(
  "writes file paths that the %s target can resolve",
  async (platform) => {
    const directory = await mkdtemp(join(tmpdir(), "project-cad-manifest-"));
    try {
      await mkdir(join(directory, "app"));
      const payload = "console.log('nested payload ü');\n";
      await writeFile(join(directory, "app", "assistant.mjs"), payload);
      const manifestPath = join(directory, "manifest.json");
      await writeFile(manifestPath, JSON.stringify({ version: "0.1.10" }));
      await finalizeManifest(directory, platform, "x64");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      const expectedPath = platform === "win32"
        ? join("app", "assistant.mjs")
        : "app/assistant.mjs";
      expect(manifest).toEqual({
        version: "0.1.10",
        platform,
        architecture: "x64",
        files: {
          [expectedPath]: createHash("sha256").update(payload).digest("hex"),
        },
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

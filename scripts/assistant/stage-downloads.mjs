import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifest, artifactPattern } from "./release-manifest.mjs";

// Call only after confirming the release is publicly available.
export async function stagePublishedDownloads(
  manifest,
  target = fileURLToPath(
    new URL("../../public/downloads/assistant/", import.meta.url),
  ),
) {
  validateManifest(manifest, { published: true });
  await mkdir(target, { recursive: true });
  const temporary = join(target, "downloads.json.tmp");
  await writeFile(temporary, JSON.stringify(manifest, null, 2) + "\n");
  await rename(temporary, join(target, "downloads.json"));
  // Remove only previously generated installer copies. Keep build outputs intact.
  for (const name of await readdir(target)) {
    if (artifactPattern.test(name.replace(/\.sha256$/, "")))
      await rm(join(target, name));
  }
  console.log(
    "Website download manifest updated. Installer files remain in public release storage.",
  );
}

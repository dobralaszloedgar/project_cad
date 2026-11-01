import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { validateManifest } from "./release-manifest.mjs";
import { assistantDownloadLocation } from "../../src/assistant/download-location.mjs";

const manifest = validateManifest(
  JSON.parse(
    await readFile(
      new URL(
        "../../public/downloads/assistant/downloads.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
  { published: true },
);
const { baseUrl: base } = assistantDownloadLocation(manifest);
const metadata = await fetch(`${base}/downloads.json`, {
  signal: AbortSignal.timeout(60000),
});
if (
  !metadata.ok ||
  JSON.stringify(await metadata.json()) !== JSON.stringify(manifest)
)
  throw new Error(
    "Public release metadata does not match the website manifest.",
  );

// Stream and hash the same unauthenticated URLs used by the download buttons.
const results = await Promise.allSettled(
  manifest.files.map(async (file) => {
    const response = await fetch(`${base}/${file.filename}`, {
      signal: AbortSignal.timeout(180000),
    });
    if (!response.ok || !response.body)
      throw new Error(`Download failed (${response.status}): ${file.filename}`);
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > file.bytes)
        throw new Error(`Unexpected download size: ${file.filename}`);
      hash.update(chunk);
    }
    if (bytes !== file.bytes || hash.digest("hex") !== file.sha256)
      throw new Error(`Downloaded checksum mismatch: ${file.filename}`);
    console.log(`Verified public download: ${file.filename} (${bytes} bytes)`);
  }),
);
const failures = results.filter((result) => result.status === "rejected");
if (failures.length)
  throw new AggregateError(
    failures.map((result) => result.reason),
    "Public download verification failed.",
  );
console.log(
  `All ${manifest.files.length} downloads passed without authentication.`,
);

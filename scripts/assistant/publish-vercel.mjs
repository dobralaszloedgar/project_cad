import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { assistantDownloadLocation } from "../../src/assistant/download-location.mjs";
import { output } from "./artifacts.mjs";
import {
  sha256,
  validateManifest,
  verifyLocalArtifacts,
} from "./release-manifest.mjs";
import { stagePublishedDownloads } from "./stage-downloads.mjs";
import {
  assertReferenceContent,
  checkSourceReferences,
  loadReferencePolicy,
} from "./reference-policy.mjs";
import { checkPackageReferences } from "./reference-check.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

// Always use the public URL: the website must work without a Vercel login.
export async function verifyPublicFile(
  url,
  file,
  { allowMissing = false, fetcher = fetch } = {},
) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(180000) });
  if (allowMissing && response.status === 404) return false;
  if (!response.ok || !response.body)
    throw Object.assign(
      new Error(
        `Public download failed (${response.status}): ${file.filename}`,
      ),
      { status: response.status },
    );
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > file.bytes)
      throw new Error(`Public download size mismatch: ${file.filename}`);
    hash.update(chunk);
  }
  if (bytes !== file.bytes || hash.digest("hex") !== file.sha256)
    throw new Error(`Public download checksum mismatch: ${file.filename}`);
  return true;
}

// Manifest last: an interrupted upload can be resumed without advertising partial releases.
export async function uploadVerifiedFiles(
  baseUrl,
  assets,
  upload,
  fetcher = fetch,
  waitForCache = (milliseconds) =>
    new Promise((done) => setTimeout(done, milliseconds)),
) {
  const prefix = new URL(baseUrl).pathname.slice(1);
  for (const file of assets) {
    const url = `${baseUrl}/${file.filename}`;
    if (await verifyPublicFile(url, file, { allowMissing: true, fetcher })) {
      console.log(`Already verified: ${file.filename}`);
      continue;
    }
    const result = await upload(
      `${prefix}/${file.filename}`,
      file.data ?? createReadStream(file.path),
      {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: false,
        multipart: file.bytes > 5 * 1024 * 1024,
        cacheControlMaxAge: 31536000,
        contentType: file.filename.endsWith(".json")
          ? "application/json"
          : /\.(txt|sha256)$/.test(file.filename)
            ? "text/plain; charset=utf-8"
            : "application/octet-stream",
      },
    );
    if (result.url !== url)
      throw new Error(
        `Blob upload returned an unexpected location: ${file.filename}`,
      );
    // A new URL may briefly retain the pre-upload 404 in the public CDN.
    // Keep the manifest unpublished until the canonical URL serves verified bytes.
    for (let attempt = 0; ; attempt++) {
      try {
        await verifyPublicFile(url, file, { fetcher });
        break;
      } catch (error) {
        if (error.status !== 404 || attempt === 8) throw error;
        console.log(
          `Waiting for public download availability: ${file.filename}`,
        );
        await waitForCache(Math.min(1000 * 2 ** attempt, 16000));
      }
    }
    console.log(`Uploaded and verified: ${file.filename}`);
  }
}

export async function prepareVercelRelease(directory, baseUrl) {
  const local = validateManifest(
    JSON.parse(await readFile(join(directory, "downloads.json"), "utf8")),
  );
  await verifyLocalArtifacts(directory, local);
  const manifest = validateManifest(
    {
      name: local.name,
      version: local.version,
      files: local.files,
      distribution: { provider: "vercel-blob", baseUrl },
    },
    { published: true },
  );
  const assets = [];
  for (const file of local.files) {
    assets.push({ ...file, path: join(directory, file.filename) });
    const filename = `${file.filename}.sha256`;
    const data = await readFile(join(directory, filename));
    assets.push({ filename, data, bytes: data.length, sha256: sha256(data) });
  }
  const instructions = `Project CAD Assistant ${manifest.version}

Choose the installer for your system. macOS uses the universal .pkg (Apple silicon and Intel, macOS 13.5+). Windows uses x64 or ARM64 Setup.exe (Windows 11 / Server 2022+). Linux uses the matching .run file (desktop Linux, glibc 2.28+).

On Linux, make the .run file executable with chmod +x, then run it as your normal user without sudo. Portable ZIP and tar.gz archives are available at the same download location.

Choose your agents in https://projectcad.vercel.app, then install and open Project CAD Assistant. Return to the website, choose Connect assistant, and approve the request inside the assistant app. Your choices appear in the desktop app automatically. Complete any agent sign-in or key setup there if needed. Use Manage agents in the website to change your choices later.

The connector runs on your computer. Project files stay where you choose them. Conversation history and provider settings stay under .project-cad/assistant in your home folder. Vercel hosts the downloads; it does not run your local agents.

macOS packages are ad-hoc signed and not notarized. Windows installers are unsigned. Windows and Linux packages have been cross compiled and checked for archive integrity and CPU architecture, but have not been runtime-tested on those operating systems.

Checksums: ${baseUrl}/SHA256SUMS.txt
Package inventory: ${baseUrl}/downloads.json
`;
  const generated = {
    "INSTALL.txt": instructions,
    "SHA256SUMS.txt": manifest.files
      .map((file) => `${file.sha256}  ${file.filename}\n`)
      .join(""),
    "downloads.json": JSON.stringify(manifest, null, 2) + "\n",
  };
  for (const [filename, text] of Object.entries(generated)) {
    const data = Buffer.from(text);
    assets.push({ filename, data, bytes: data.length, sha256: sha256(data) });
  }
  return { manifest, assets };
}

async function main() {
  const { values } = parseArgs({
    options: {
      directory: { type: "string", default: output },
      "base-url": { type: "string" },
      "dry-run": { type: "boolean" },
      "sync-only": { type: "boolean" },
    },
  });
  if (values["sync-only"]) {
    const current = validateManifest(
      JSON.parse(
        await readFile(
          join(projectRoot, "public/downloads/assistant/downloads.json"),
          "utf8",
        ),
      ),
      { published: true },
    );
    const baseUrl =
      values["base-url"] ?? assistantDownloadLocation(current).baseUrl;
    // Validate an explicit override before fetching any URL.
    if (values["base-url"])
      assistantDownloadLocation({
        version: /\/v(\d+\.\d+\.\d+)$/.exec(baseUrl)?.[1],
        distribution: { provider: "vercel-blob", baseUrl },
      });
    const response = await fetch(`${baseUrl}/downloads.json`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok)
      throw new Error(`Public manifest unavailable (${response.status}).`);
    const manifest = validateManifest(await response.json(), {
      published: true,
    });
    if (assistantDownloadLocation(manifest).baseUrl !== baseUrl)
      throw new Error(
        "Public manifest points to a different release location.",
      );
    for (const file of manifest.files)
      await verifyPublicFile(`${baseUrl}/${file.filename}`, file);
    await stagePublishedDownloads(manifest);
    return;
  }
  if (!values["base-url"])
    throw new Error(
      "Pass --base-url https://<store-id>.public.blob.vercel-storage.com/project-cad-assistant/v<version>.",
    );
  const { manifest, assets } = await prepareVercelRelease(
    values.directory,
    values["base-url"],
  );
  const pins = JSON.parse(
    await readFile(new URL("./releases.json", import.meta.url), "utf8"),
  );
  if (manifest.version !== pins.version)
    throw new Error(
      "Rebuild all packages for the version in releases.json before publishing.",
    );
  const policy = await loadReferencePolicy();
  await checkSourceReferences(projectRoot, policy);
  await checkPackageReferences(values.directory, manifest, policy);
  for (const file of assets.filter((item) => item.data))
    assertReferenceContent(file.data, file.filename, policy);
  if (values["dry-run"]) {
    console.log(
      JSON.stringify(
        {
          version: manifest.version,
          baseUrl: values["base-url"],
          files: assets.map(({ filename, bytes }) => ({ filename, bytes })),
        },
        null,
        2,
      ),
    );
    return;
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token)
    throw new Error(
      "Set BLOB_READ_WRITE_TOKEN for the intended public Blob store.",
    );
  const storeId = /^vercel_blob_rw_([^_]+)_/.exec(token)?.[1]?.toLowerCase();
  if (
    !storeId ||
    new URL(values["base-url"]).hostname !==
      `${storeId}.public.blob.vercel-storage.com`
  )
    throw new Error(
      "The Blob credential does not match the requested download store.",
    );
  const { put } = await import("@vercel/blob");
  await uploadVerifiedFiles(
    values["base-url"],
    assets,
    (pathname, data, options) => put(pathname, data, { ...options, token }),
  );
  await stagePublishedDownloads(manifest);
  console.log(
    `Published ${manifest.version}. Deploy the updated website manifest to activate these downloads.`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();

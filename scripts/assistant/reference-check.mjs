import { execFile } from "node:child_process";
import { promisify, parseArgs } from "node:util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  assertReferenceContent,
  checkDirectoryReferences,
  checkGitReferences,
  checkSourceReferences,
  loadReferencePolicy,
} from "./reference-policy.mjs";
import {
  sha256,
  validateManifest,
  verifyLocalArtifacts,
} from "./release-manifest.mjs";

const execute = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

async function verifiedWindowsNodeHashes(output, manifest, temporary) {
  const architectures = new Set(
    manifest.files
      .filter((file) => file.platform === "windows")
      .flatMap((file) =>
        file.architecture === "universal"
          ? ["x64", "arm64"]
          : [file.architecture],
      ),
  );
  const pins = JSON.parse(
    await readFile(new URL("./releases.json", import.meta.url), "utf8"),
  );
  const hashes = new Set();
  for (const architecture of architectures) {
    const pin = pins.node.targets[`win32-${architecture}`];
    let data;
    try {
      data = await readFile(join(output, "cache", pin.filename));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const response = await fetch(
        `https://nodejs.org/dist/v${pins.node.version}/${pin.filename}`,
        { signal: AbortSignal.timeout(180000), redirect: "error" },
      );
      if (!response.ok)
        throw new Error(`Pinned runtime download failed (${response.status}).`);
      data = Buffer.from(await response.arrayBuffer());
    }
    if (sha256(data) !== pin.sha256)
      throw new Error(`Pinned runtime checksum mismatch: ${architecture}`);
    const archive = join(temporary, pin.filename);
    await writeFile(archive, data);
    await execute(
      process.platform === "win32" ? "tar.exe" : "tar",
      ["-xf", archive, "-C", temporary],
      { timeout: 60000 },
    );
    hashes.add(
      sha256(
        await readFile(
          join(temporary, pin.filename.replace(/\.zip$/, ""), "node.exe"),
        ),
      ),
    );
  }
  return hashes;
}

export async function checkPackageReferences(
  output,
  manifest,
  policy,
  { platform } = {},
) {
  validateManifest(manifest, { platform });
  await verifyLocalArtifacts(output, manifest, { platform });
  const temporary = await mkdtemp(join(tmpdir(), "project-cad-release-check-"));
  const results = [];
  try {
    const verifiedNodeHashes = await verifiedWindowsNodeHashes(
      output,
      manifest,
      temporary,
    );
    for (const file of manifest.files) {
      const source = join(output, file.filename),
        destination = join(temporary, file.filename);
      const data = await readFile(source);
      // Compressed payload bytes can coincidentally spell short restricted words.
      // Check names, executable shell headers, and every extracted file instead.
      assertReferenceContent(Buffer.from(file.filename), file.filename, policy);
      if (file.filename.endsWith(".pkg")) {
        if (process.platform !== "darwin")
          throw new Error(
            "Verify the complete installer set on macOS with pkgutil and 7zz available.",
          );
        await execute("/usr/sbin/pkgutil", [
          "--expand-full",
          source,
          destination,
        ]);
      } else if (
        file.filename.endsWith(".run") ||
        file.filename.endsWith(".tar.gz")
      ) {
        let archive = source;
        if (file.filename.endsWith(".run")) {
          const marker = Buffer.from("\n__PROJECT_CAD_ARCHIVE__\n"),
            index = data.indexOf(marker);
          if (index < 0) throw new Error("Installer payload is missing.");
          assertReferenceContent(data.subarray(0, index), file.filename, policy);
          archive = join(temporary, file.filename + ".tar.gz");
          await writeFile(archive, data.subarray(index + marker.length));
        }
        await mkdir(destination);
        await execute("tar", ["-xzf", archive, "-C", destination]);
      } else {
        await execute(
          process.env.PROJECT_CAD_7ZIP_BIN || "7zz",
          ["x", "-y", "-o" + destination, source],
          {
            maxBuffer: 1024 * 1024,
          },
        );
      }
      const result = await checkDirectoryReferences(destination, policy, {
        verifiedNodeHashes,
      });
      results.push({ filename: file.filename, ...result });
      await rm(destination, { recursive: true, force: true });
    }
    return results;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values } = parseArgs({
    options: { history: { type: "boolean" }, packages: { type: "boolean" } },
  });
  const policy = await loadReferencePolicy();
  if (values.packages) {
    const output = join(projectRoot, "dist", "assistant");
    const manifest = JSON.parse(
      await readFile(join(output, "downloads.json"), "utf8"),
    );
    const results = await checkPackageReferences(output, manifest, policy);
    console.log(
      `Release policy passed: ${results.length} packages, ${results.reduce((sum, item) => sum + item.files, 0)} extracted files.`,
    );
  } else {
    const { files } = await checkSourceReferences(projectRoot, policy);
    console.log(`Release policy passed: ${files} project files.`);
    if (values.history) {
      const { objects } = await checkGitReferences(projectRoot, policy);
      console.log(`Release policy passed: ${objects} Git objects.`);
    }
  }
}

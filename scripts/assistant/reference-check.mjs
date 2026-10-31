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
import { validateManifest, verifyLocalArtifacts } from "./release-manifest.mjs";

const execute = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

export async function checkPackageReferences(output, manifest, policy) {
  validateManifest(manifest);
  await verifyLocalArtifacts(output, manifest);
  const temporary = await mkdtemp(join(tmpdir(), "project-cad-release-check-"));
  const results = [];
  try {
    for (const file of manifest.files) {
      const source = join(output, file.filename),
        destination = join(temporary, file.filename);
      const data = await readFile(source);
      assertReferenceContent(data, file.filename, policy);
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
          archive = join(temporary, file.filename + ".tar.gz");
          await writeFile(archive, data.subarray(index + marker.length));
        }
        await mkdir(destination);
        await execute("tar", ["-xzf", archive, "-C", destination]);
      } else {
        await execute("7zz", ["x", "-y", "-o" + destination, source], {
          maxBuffer: 1024 * 1024,
        });
      }
      const result = await checkDirectoryReferences(destination, policy);
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

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { output } from "./artifacts.mjs";
import {
  assertReleaseAssets,
  repositoryPattern,
  sha256,
  validateManifest,
  verifyLocalArtifacts,
} from "./release-manifest.mjs";
import { stagePublishedDownloads } from "./stage-downloads.mjs";
import { githubPublisher } from "./github-publisher.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  assertReferenceContent,
  checkGitReferences,
  checkSourceReferences,
  loadReferencePolicy,
} from "./reference-policy.mjs";
import { checkPackageReferences } from "./reference-check.mjs";

const execute = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

const { values } = parseArgs({
  options: {
    repo: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    "sync-only": { type: "boolean", default: false },
  },
});
if (values["dry-run"] && values["sync-only"])
  throw new Error("Choose either --dry-run or --sync-only.");
const config = JSON.parse(
  await readFile(new URL("./distribution.json", import.meta.url), "utf8"),
);
const pins = JSON.parse(
  await readFile(new URL("./releases.json", import.meta.url), "utf8"),
);
const repository = values.repo || config.repository;
if (typeof repository !== "string" || !repositoryPattern.test(repository))
  throw new Error("Expected --repo owner/repository.");
const publisher = config.repository.split("/")[0];
if (repository.split("/")[0].toLowerCase() !== publisher.toLowerCase())
  throw new Error(
    `Release repositories must belong to the configured publisher, ${publisher}.`,
  );
const tag = `v${pins.version}`;
if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error("Invalid release version.");
const endpoint = `repos/${repository}/releases/tags/${tag}`;
const baseUrl = `https://github.com/${repository}/releases/download/${tag}`;

let gh;
async function findRelease() {
  try {
    return JSON.parse(await gh(["api", endpoint]));
  } catch (error) {
    if (!String(error.stderr).includes("HTTP 404")) throw error;
    // GitHub has not created the tag for a first draft yet. Include drafts when
    // resuming, otherwise a failed upload could accidentally create a second one.
    const pages = JSON.parse(
      await gh([
        "api",
        `repos/${repository}/releases?per_page=100`,
        "--paginate",
        "--slurp",
      ]),
    );
    return pages.flat().find((release) => release.tag_name === tag);
  }
}
async function getPublicJson(url, { allowMissing = false } = {}) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(60000),
    headers: { Accept: "application/json" },
  });
  if (allowMissing && response.status === 404) return undefined;
  if (!response.ok)
    throw new Error(
      `Public release request failed (${response.status}): ${url}`,
    );
  return response.json();
}
async function syncPublishedRelease() {
  // No authentication: this is the same access an end user has.
  const release = await getPublicJson(`https://api.github.com/${endpoint}`);
  if (release.draft || release.tag_name !== tag)
    throw new Error("Release is not public.");
  const manifest = validateManifest(
    await getPublicJson(`${baseUrl}/downloads.json`),
    { published: true },
  );
  if (
    manifest.release.repository !== repository ||
    manifest.release.tag !== tag
  )
    throw new Error(
      "Release manifest points to a different repository or version.",
    );
  const names = new Set(manifest.files.map((file) => file.filename));
  assertReleaseAssets(
    release.assets.filter((asset) => names.has(asset.name)),
    manifest.files,
  );
  await stagePublishedDownloads(manifest);
  console.log(release.html_url);
}

if (values["sync-only"]) {
  await syncPublishedRelease();
} else {
  const policy = await loadReferencePolicy();
  await checkSourceReferences(projectRoot, policy);
  const local = validateManifest(
    JSON.parse(await readFile(join(output, "downloads.json"), "utf8")),
  );
  if (local.version !== pins.version)
    throw new Error(
      "Rebuild all packages for the version in releases.json before publishing.",
    );
  await verifyLocalArtifacts(output, local);
  await checkPackageReferences(output, local, policy);
  const manifest = { ...local, release: { repository, tag } };
  validateManifest(manifest, { published: true });
  const staging = join(output, "github", tag);
  await mkdir(staging, { recursive: true });
  const notes = `Project CAD Assistant ${local.version}

Installers and portable archives for macOS, Windows, and Linux. Every package includes a private Node runtime.

| System | Installer | Requirement |
| --- | --- | --- |
| macOS | [Universal .pkg](${baseUrl}/ProjectCAD-Assistant-macos-universal.pkg) | macOS 13.5+, Apple silicon or Intel |
| Windows | [x64](${baseUrl}/ProjectCAD-Assistant-windows-x64-Setup.exe) / [ARM64](${baseUrl}/ProjectCAD-Assistant-windows-arm64-Setup.exe) | Windows 11 / Server 2022 or newer |
| Linux | [x64](${baseUrl}/ProjectCAD-Assistant-linux-x64.run) / [ARM64](${baseUrl}/ProjectCAD-Assistant-linux-arm64.run) | Desktop Linux with glibc 2.28+ |

Open the assistant, enter your Project CAD website address in Settings, then set up Codex, Claude Code, or Muse. In the website, choose **Connect local assistant** and approve the connection. Project files and conversation history stay on your computer.

For Linux, make the .run file executable with chmod +x and run it as your normal user. Do not use sudo. Windows and Linux settings open in your local browser.

These macOS packages are ad-hoc signed and not notarized; Windows installers are unsigned. macOS installation and lifecycle checks have passed. Windows and Linux packages have been cross compiled and checked for archive integrity and CPU architecture; this release has not been runtime-tested on those operating systems.

See INSTALL.txt for setup instructions and SHA256SUMS.txt for checksums. Portable ZIP and tar.gz archives are also attached.
`;
  const instructions = `Project CAD Assistant ${local.version}

macOS: Open ProjectCAD-Assistant-macos-universal.pkg and install for your user. Open Project CAD Assistant in your home folder's Applications directory. Requires macOS 13.5+; Apple silicon and Intel are supported. This build is not notarized.

Windows: Open the x64 or ARM64 Setup.exe matching your PC. No administrator access is needed. Start Project CAD Assistant from the Start menu. The ZIP is a portable alternative. These installers are unsigned and have not yet been run on Windows.

Linux: Choose x64 for Intel/AMD PCs or ARM64 for ARM PCs. Run chmod +x on the downloaded .run file, then execute it as your normal user without sudo. A tar.gz archive containing install.sh is also available. Requires glibc 2.28+, tar, xdg-open, and a terminal emulator. Alpine/musl is not supported.

Open the assistant and set your Project CAD website URL in Settings. The default is http://127.0.0.1:3000 for local development. Set up or sign in to Codex / Claude Code, or enter a Muse API key. In the project website, choose Connect local assistant and approve the connection. Keep your project tab open while the assistant works.

The companion runs on this computer. Windows and Linux settings open in the browser on 127.0.0.1:43119. Project files stay in the folder you choose. Conversations and provider settings stay under .project-cad/assistant in your home folder. Updates preserve them.

Verify downloads against SHA256SUMS.txt. Each binary also has a .sha256 sidecar file.
`;
  const generated = {
    "downloads.json": JSON.stringify(manifest, null, 2) + "\n",
    "SHA256SUMS.txt": local.files
      .map((file) => `${file.sha256}  ${file.filename}\n`)
      .join(""),
    "INSTALL.txt": instructions,
  };
  const expected = [];
  for (const file of local.files) {
    expected.push({ ...file, path: join(output, file.filename) });
    const filename = `${file.filename}.sha256`;
    const data = await readFile(join(output, filename));
    expected.push({
      filename,
      path: join(output, filename),
      bytes: data.length,
      sha256: sha256(data),
    });
  }
  for (const [filename, text] of Object.entries(generated)) {
    const data = Buffer.from(text);
    assertReferenceContent(data, filename, policy);
    const path = join(staging, filename);
    await writeFile(path, data);
    expected.push({ filename, path, bytes: data.length, sha256: sha256(data) });
  }
  const notesFile = join(staging, "release-notes.txt");
  assertReferenceContent(Buffer.from(notes), "release-notes.txt", policy);
  await writeFile(notesFile, notes);
  console.log(
    `Verified ${local.files.length} packages. Release: ${repository} ${tag}.`,
  );
  if (values["dry-run"]) {
    console.log(
      JSON.stringify(
        {
          repository,
          tag,
          assets: expected.map(({ filename, bytes }) => ({ filename, bytes })),
          totalBytes: expected.reduce((sum, file) => sum + file.bytes, 0),
          websiteManifest: fileURLToPath(
            new URL(
              "../../public/downloads/assistant/downloads.json",
              import.meta.url,
            ),
          ),
        },
        null,
        2,
      ),
    );
  } else {
    const { stdout: status } = await execute("git", ["status", "--porcelain"], {
      cwd: projectRoot,
    });
    if (status.trim())
      throw new Error(
        "Commit the reviewed project changes before publishing a release.",
      );
    const { stdout: revision } = await execute("git", ["rev-parse", "HEAD"], {
      cwd: projectRoot,
    });
    const sourceCommit = revision.trim();
    await checkGitReferences(projectRoot, policy, sourceCommit);
    const remoteCommit = await getPublicJson(
      `https://api.github.com/repos/${repository}/commits/${sourceCommit}`,
    );
    if (remoteCommit.sha !== sourceCommit)
      throw new Error("Push and verify the release source before publishing.");
    const taggedCommit = await getPublicJson(
      `https://api.github.com/repos/${repository}/commits/${tag}`,
      { allowMissing: true },
    );
    if (taggedCommit && taggedCommit.sha !== sourceCommit)
      throw new Error(
        "The release tag uses a different source commit. Use its matching checkout or a new version.",
      );
    gh = await githubPublisher(publisher);
    const repo = JSON.parse(await gh(["api", `repos/${repository}`]));
    if (repo.private || repo.archived)
      throw new Error(
        "Use a public, active repository dedicated to installer downloads.",
      );
    if (!repo.permissions?.push)
      throw new Error(
        `The ${publisher} account needs write access to ${repository} to publish releases.`,
      );
    let release = await findRelease();
    if (!release) {
      await gh([
        "release",
        "create",
        tag,
        "--repo",
        repository,
        "--draft",
        "--target",
        sourceCommit,
        "--title",
        `Project CAD Assistant ${local.version}`,
        "--notes-file",
        notesFile,
      ]);
      release = await findRelease();
    }
    if (!release) throw new Error("Could not create a draft release.");
    if (release.draft) {
      await gh([
        "release",
        "edit",
        tag,
        "--repo",
        repository,
        "--target",
        sourceCommit,
        "--title",
        `Project CAD Assistant ${local.version}`,
        "--notes-file",
        notesFile,
      ]);
      release = await findRelease();
    }
    assertReferenceContent(
      Buffer.from(JSON.stringify({ name: release.name, body: release.body })),
      "release metadata",
      policy,
    );
    for (const file of expected) {
      const existing = release.assets.find(
        (asset) => asset.name === file.filename,
      );
      if (existing) {
        assertReleaseAssets([existing], [file]);
      } else {
        if (!release.draft)
          throw new Error(
            "Published releases cannot be replaced. Increment the version and rebuild.",
          );
        console.log(`Uploading ${file.filename}`);
        await gh(["release", "upload", tag, file.path, "--repo", repository]);
      }
    }
    release = await findRelease();
    assertReleaseAssets(release?.assets, expected);
    if (release.draft) {
      await gh([
        "release",
        "edit",
        tag,
        "--repo",
        repository,
        "--draft=false",
        "--latest",
      ]);
      console.log("Published the verified release.");
    }
    await syncPublishedRelease();
  }
}

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";

const execute = promisify(execFile);

export function validateReferencePolicy(value) {
  if (
    value?.version !== 1 ||
    !Array.isArray(value.rules) ||
    !value.rules.length
  )
    throw new Error("Release policy must contain at least one rule.");
  const ids = new Set();
  for (const rule of value.rules) {
    if (
      !/^[A-Za-z0-9_-]+$/.test(rule.id) ||
      ids.has(rule.id) ||
      !Array.isArray(rule.terms) ||
      !rule.terms.length ||
      rule.terms.some(
        (term) =>
          typeof term !== "string" || !/^[\x20-\x7e]{3,100}$/.test(term),
      )
    )
      throw new Error("Release policy contains an invalid rule.");
    ids.add(rule.id);
    for (const exception of rule.exceptions ?? []) {
      if (
        typeof exception.pathPattern !== "string" ||
        typeof exception.enclosingText !== "string" ||
        !exception.enclosingText
      )
        throw new Error("Release policy contains an invalid exception.");
      try {
        new RegExp(exception.pathPattern);
      } catch {
        throw new Error("Release policy contains an invalid path pattern.");
      }
    }
  }
  return value;
}

export async function loadReferencePolicy(environment = process.env) {
  let text;
  try {
    text =
      environment.RELEASE_REFERENCE_POLICY ||
      (await readFile(
        environment.RELEASE_REFERENCE_POLICY_FILE ||
          join(homedir(), ".config", "project-cad", "release-policy.json"),
        "utf8",
      ));
  } catch {
    throw new Error(
      "Release policy is required. Set RELEASE_REFERENCE_POLICY or RELEASE_REFERENCE_POLICY_FILE.",
    );
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Release policy must be valid JSON.");
  }
  return validateReferencePolicy(value);
}

function encodings(text) {
  const value = text.toLowerCase();
  const little = Buffer.from(value, "utf16le");
  const wideLittle = Buffer.alloc(value.length * 4),
    wideBig = Buffer.alloc(value.length * 4);
  for (let i = 0; i < value.length; i++) {
    wideLittle.writeUInt32LE(value.charCodeAt(i), i * 4);
    wideBig.writeUInt32BE(value.charCodeAt(i), i * 4);
  }
  return [
    Buffer.from(value),
    little,
    Buffer.from(little).swap16(),
    wideLittle,
    wideBig,
  ].map((buffer) => buffer.toString("latin1"));
}

function normalizeText(text) {
  return text
    .normalize("NFKC")
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\x([0-9a-f]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/%([0-9a-f]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, decimal) => {
      const code = parseInt(hex || decimal, hex ? 16 : 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : "";
    });
}

export function inspectReferenceContent(data, path, policy, normalize = true) {
  const content = data.toString("latin1").toLowerCase();
  const findings = [];
  for (const rule of policy.rules) {
    for (const term of rule.terms) {
      const needles = encodings(term);
      for (let encoding = 0; encoding < needles.length; encoding++) {
        const needle = needles[encoding];
        let offset = content.indexOf(needle);
        while (offset !== -1) {
          const permitted = (rule.exceptions ?? []).some((exception) => {
            if (
              !new RegExp(exception.pathPattern).test(
                path.replaceAll("\\", "/"),
              )
            )
              return false;
            const enclosing = encodings(exception.enclosingText)[encoding];
            const begin = Math.max(
              0,
              offset - enclosing.length + needle.length,
            );
            const position = content.indexOf(enclosing, begin);
            return (
              position >= begin &&
              position <= offset &&
              offset + needle.length <= position + enclosing.length
            );
          });
          if (!permitted) findings.push({ rule: rule.id, path, offset });
          offset = content.indexOf(needle, offset + needle.length);
        }
      }
    }
  }
  if (normalize && !data.includes(0)) {
    const text = data.toString("utf8"),
      normalized = normalizeText(text);
    if (normalized !== text) {
      const extra = inspectReferenceContent(
        Buffer.from(normalized),
        path,
        policy,
        false,
      );
      for (const finding of extra)
        if (!findings.some((item) => item.rule === finding.rule))
          findings.push(finding);
    }
  }
  return findings;
}

export function assertReferenceContent(data, path, policy) {
  const findings = inspectReferenceContent(data, path, policy);
  const nameFindings = inspectReferenceContent(Buffer.from(path), path, policy);
  const rules = [
    ...new Set([...findings, ...nameFindings].map((item) => item.rule)),
  ];
  if (rules.length) {
    const label = nameFindings.length ? "a restricted filename" : path;
    throw new Error(`Release policy rejected ${label} (${rules.join(", ")}).`);
  }
}

async function inspectFile(file, label, policy) {
  const stat = await lstat(file);
  const data = stat.isSymbolicLink()
    ? Buffer.from(await readlink(file))
    : await readFile(file);
  assertReferenceContent(data, label, policy);
}

export async function checkSourceReferences(root, policy = undefined) {
  policy ??= await loadReferencePolicy();
  const { stdout } = await execute(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, maxBuffer: 16 * 1024 * 1024 },
  );
  let files = 0;
  for (const name of new Set(stdout.split("\0").filter(Boolean))) {
    try {
      await inspectFile(join(root, name), name, policy);
      files++;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return { files };
}

export async function checkDirectoryReferences(directory, policy) {
  let files = 0;
  async function visit(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name),
        label = relative(directory, path);
      assertReferenceContent(Buffer.from(label), label, policy);
      if (entry.isDirectory()) await visit(path);
      else {
        await inspectFile(path, label, policy);
        files++;
      }
    }
  }
  await visit(directory);
  return { files };
}

export async function checkGitReferences(root, policy, revision = "--all") {
  const { stdout } = await execute("git", ["rev-list", "--objects", revision], {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
  });
  const objects = stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(" ");
      return separator < 0
        ? [line, ""]
        : [line.slice(0, separator), line.slice(separator + 1)];
    });
  const bytes = await new Promise((resolve, reject) => {
    const child = spawn("git", ["cat-file", "--batch"], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks = [];
    let size = 0;
    child.on("error", reject);
    child.stdin.on("error", reject);
    child.stdout.on("data", (data) => {
      size += data.length;
      if (size > 256 * 1024 * 1024) {
        child.kill();
        reject(new Error("Git history exceeds the release check limit."));
        return;
      }
      chunks.push(data);
    });
    child.stderr.resume();
    child.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new Error("Could not inspect Git history.")),
    );
    child.stdin.end(objects.map(([id]) => id).join("\n") + "\n");
  });
  let cursor = 0;
  for (const [id, path] of objects) {
    const end = bytes.indexOf(10, cursor),
      header = bytes.subarray(cursor, end).toString().split(" ");
    const size = Number(header[2]);
    if (!Number.isSafeInteger(size) || size < 0 || header[0] !== id)
      throw new Error("Invalid Git object response.");
    const data = bytes.subarray(end + 1, end + 1 + size);
    assertReferenceContent(
      data,
      path || `${header[1]} ${id.slice(0, 12)}`,
      policy,
    );
    cursor = end + size + 2;
  }
  return { objects: objects.length };
}

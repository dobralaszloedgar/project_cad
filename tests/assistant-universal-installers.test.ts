import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { linuxUniversalHeader } from "../scripts/assistant/universal-installers.mjs";

const execute = promisify(execFile);
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function fixture(
  machine: string,
  options: { system?: string; user?: string; exitCode?: number } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), "project-cad-universal-"));
  directories.push(directory);
  const payload = join(directory, "payload");
  for (const architecture of ["x64", "arm64"]) {
    const runtime = join(payload, architecture, "runtime");
    await mkdir(runtime, { recursive: true });
    await writeFile(
      join(runtime, "node"),
      `#!/bin/sh
set -eu
[ "$2" = install ]
[ "$1" = "$3/app/desktop.mjs" ]
[ "$4" = '--no-start' ]
# Only the selected architecture should be extracted.
[ ! -d "$3/../${architecture === "x64" ? "arm64" : "x64"}" ]
printf '%s\\n' '${architecture}' "$3" > "$PROJECT_CAD_TEST_REPORT"
exit ${options.exitCode ?? 0}
`,
      { mode: 0o755 },
    );
  }
  const archive = join(directory, "payload.tar.gz");
  await execute("tar", ["-czf", archive, "-C", payload, "x64", "arm64"]);
  const installer = join(directory, "Universal installer.run");
  await writeFile(
    installer,
    Buffer.concat([
      Buffer.from(linuxUniversalHeader()),
      await readFile(archive),
    ]),
  );
  const bin = join(directory, "bin");
  const staging = join(directory, "staging");
  await mkdir(bin);
  await mkdir(staging);
  await writeFile(
    join(bin, "uname"),
    `#!/bin/sh\ncase "$1" in -s) echo '${options.system ?? "Linux"}' ;; -m) echo '${machine}' ;; *) exit 1 ;; esac\n`,
    { mode: 0o755 },
  );
  await writeFile(
    join(bin, "id"),
    `#!/bin/sh\necho '${options.user ?? "1000"}'\n`,
    { mode: 0o755 },
  );
  const report = join(directory, "report.txt");
  const run = () =>
    execute("/bin/sh", [installer, "--no-start"], {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        TMPDIR: staging,
        PROJECT_CAD_TEST_REPORT: report,
      },
    });
  return { run, report, staging };
}

describe("universal Linux installer", () => {
  it.each([
    ["x86_64", "x64"],
    ["amd64", "x64"],
    ["aarch64", "arm64"],
    ["arm64", "arm64"],
  ])(
    "selects only the native payload for %s and cleans it up",
    async (machine, expected) => {
      const { run, report, staging } = await fixture(machine);
      await run();
      const [architecture, source] = (await readFile(report, "utf8"))
        .trim()
        .split("\n");
      expect(architecture).toBe(expected);
      expect(source.endsWith(`/${expected}`)).toBe(true);
      expect(await readdir(staging)).toEqual([]);
    },
  );
  it.each([
    ["riscv64", {}, "requires x64 or ARM64 Linux"],
    ["x86_64", { system: "Darwin" }, "requires Linux"],
    ["x86_64", { user: "0" }, "without sudo"],
  ] as const)(
    "rejects unsupported installation environments before extraction: %s %j",
    async (machine, options, error) => {
      const { run, report, staging } = await fixture(machine, options);
      await expect(run()).rejects.toThrow(error);
      await expect(readFile(report)).rejects.toMatchObject({ code: "ENOENT" });
      expect(await readdir(staging)).toEqual([]);
    },
  );
  it("propagates an installation failure and removes staging files", async () => {
    const { run, staging } = await fixture("aarch64", { exitCode: 23 });
    await expect(run()).rejects.toMatchObject({ code: 23 });
    expect(await readdir(staging)).toEqual([]);
  });
});

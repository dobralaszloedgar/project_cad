// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { promisify } from "node:util";

const execute = promisify(execFile);
export type OwnedProcess = { pid: number; parent: number; started: string };

async function processes(): Promise<OwnedProcess[]> {
  if (process.platform === "win32") {
    const { stdout } = await execute(
      join(
        process.env.SystemRoot || "C:\\Windows",
        "System32/WindowsPowerShell/v1.0/powershell.exe",
      ),
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{ pid=[int]$_.ProcessId; parent=[int]$_.ParentProcessId; started=$_.CreationDate.ToUniversalTime().Ticks.ToString() } }) | ConvertTo-Json -Compress",
      ],
      { windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024 },
    );
    return JSON.parse(stdout);
  }
  if (process.platform === "linux") {
    const entries = await Promise.all(
      (await readdir("/proc"))
        .filter((name) => /^\d+$/.test(name))
        .map(async (name): Promise<OwnedProcess | undefined> => {
          try {
            const text = await readFile(`/proc/${name}/stat`, "utf8");
            const fields = text
              .slice(text.lastIndexOf(")") + 2)
              .trim()
              .split(/\s+/);
            // Zombies have already released their executable and file handles.
            if (fields[0] === "Z" || fields[0] === "X") return;
            return {
              pid: Number(name),
              parent: Number(fields[1]),
              started: fields[19],
            };
          } catch (error) {
            if (
              ["ENOENT", "ESRCH"].includes(
                (error as NodeJS.ErrnoException).code || "",
              )
            )
              return;
            throw error;
          }
        }),
    );
    return entries.filter(
      (entry): entry is OwnedProcess => entry !== undefined,
    );
  }
  const { stdout } = await execute(
    "/bin/ps",
    ["-axo", "pid=,ppid=,stat=,lstart="],
    { timeout: 10000 },
  );
  return stdout
    .trim()
    .split("\n")
    .flatMap((line) => {
      const [pid, parent, state, ...started] = line.trim().split(/\s+/);
      return state.includes("Z")
        ? []
        : [
            {
              pid: Number(pid),
              parent: Number(parent),
              started: started.join(" "),
            },
          ];
    });
}

function includeDescendants(
  owned: Map<number, OwnedProcess>,
  current: OwnedProcess[],
) {
  const live = new Map(current.map((entry) => [entry.pid, entry]));
  for (const parent of owned.values()) {
    if (live.get(parent.pid)?.started !== parent.started) continue;
    for (const child of current)
      if (child.parent === parent.pid && !owned.has(child.pid))
        owned.set(child.pid, child);
  }
}

/** Capture before requesting shutdown so reparented session children remain owned. */
export async function ownedProcessTree(pid: number): Promise<OwnedProcess[]> {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid)
    throw new Error("Invalid assistant process identity.");
  const current = await processes();
  const root = current.find((entry) => entry.pid === pid);
  if (!root) return [];
  const owned = new Map([[pid, root]]);
  includeDescendants(owned, current);
  return [...owned.values()];
}

/** Wait only for captured identities; PID reuse must never target another app. */
export async function waitForProcessTreeExit(
  initial: OwnedProcess[],
  timeout = 15000,
) {
  if (!initial.length) return;
  const owned = new Map(initial.map((entry) => [entry.pid, entry]));
  const deadline = Date.now() + timeout;
  while (true) {
    const current = await processes();
    includeDescendants(owned, current);
    if (
      !current.some((entry) => owned.get(entry.pid)?.started === entry.started)
    )
      return;
    if (Date.now() >= deadline)
      throw new Error(
        "The previous assistant session is still stopping. Close its provider sessions and try again; the existing application has not been replaced.",
      );
    await pause(200);
  }
}

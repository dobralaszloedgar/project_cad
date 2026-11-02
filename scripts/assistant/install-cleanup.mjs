import { lstat, readdir, rm } from "node:fs/promises";
import { setTimeout as pause } from "node:timers/promises";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

const backupId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const contains = (parent, child) => {
  const path = relative(parent, child);
  return (
    !path ||
    (path !== ".." && !path.startsWith(".." + sep) && !isAbsolute(path))
  );
};

// Only the UUID backup folders created by our installers are eligible. A failed
// deletion may already have removed manifest.json, so it cannot identify them.
export async function removePreviousInstallations(destination, preserve = []) {
  destination = resolve(destination);
  const parent = dirname(destination);
  const prefix = basename(destination) + ".previous-";
  const protectedPaths = [
    destination,
    ...preserve.map((path) => resolve(path)),
  ];
  for (const entry of await readdir(parent, { withFileTypes: true })) {
    if (
      !entry.name.startsWith(prefix) ||
      !backupId.test(entry.name.slice(prefix.length))
    )
      continue;
    const backup = resolve(parent, entry.name);
    if (
      dirname(backup) !== parent ||
      protectedPaths.some(
        (path) => contains(backup, path) || contains(path, backup),
      )
    )
      continue;
    // Never follow a replacement symlink/junction outside the install directory.
    const info = await lstat(backup).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!info?.isDirectory() || info.isSymbolicLink()) continue;
    try {
      // Windows can briefly retain executable locks after the old app exits.
      // Retry the whole operation so nested folders do not multiply the wait.
      for (let attempt = 0; ; attempt++) {
        try {
          await rm(backup, { recursive: true, force: true });
          break;
        } catch (error) {
          if (
            attempt >= 20 ||
            ![
              "EBUSY",
              "EPERM",
              "EACCES",
              "ENOTEMPTY",
              "EMFILE",
              "ENFILE",
            ].includes(error.code)
          )
            throw error;
          await pause(250);
        }
      }
    } catch (cause) {
      throw new Error(
        `The new assistant is installed, but its old version could not be removed from ${backup}. Close Project CAD Assistant and run the installer again to finish cleanup. Your settings and history are preserved.`,
        { cause },
      );
    }
  }
}

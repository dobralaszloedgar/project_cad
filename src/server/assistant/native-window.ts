import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

/** Only the packaged Mac service can open its own native approval window. */
export function nativeAssistantWindow(resources: string) {
  const contents = dirname(resources),
    bundle = dirname(contents);
  if (
    process.platform !== "darwin" ||
    basename(resources) !== "Resources" ||
    basename(contents) !== "Contents" ||
    !bundle.endsWith(".app") ||
    !existsSync(join(contents, "Info.plist"))
  )
    return undefined;
  return async () => {
    if (process.env.PROJECT_CAD_NO_DESKTOP_OPEN === "1") return;
    await execute("/usr/bin/open", ["-a", bundle], { timeout: 10000 });
  };
}

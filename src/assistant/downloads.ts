export type AssistantDownload = {
  filename: string;
  url: string;
  bytes: number;
  platform: "macos" | "windows" | "linux";
  name: string;
  architecture: string;
};
export function assistantDownloads(
  value: unknown,
):
  | { version: string; installers: AssistantDownload[]; releaseUrl?: string }
  | undefined {
  if (!value || typeof value !== "object") return;
  const manifest = value as Record<string, unknown>;
  if (
    manifest.name !== "Project CAD Assistant" ||
    typeof manifest.version !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
    !Array.isArray(manifest.files)
  )
    return;
  let baseUrl = "/downloads/assistant";
  let releaseUrl: string | undefined;
  if (manifest.release !== undefined) {
    if (!manifest.release || typeof manifest.release !== "object") return;
    const release = manifest.release as Record<string, unknown>;
    if (
      typeof release.repository !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(
        release.repository,
      ) ||
      release.tag !== `v${manifest.version}`
    )
      return;
    const repositoryUrl = `https://github.com/${release.repository}`;
    baseUrl = `${repositoryUrl}/releases/download/${release.tag}`;
    releaseUrl = `${repositoryUrl}/releases/tag/${release.tag}`;
  }
  const installers: AssistantDownload[] = [];
  const seen = new Set<string>();
  for (const entry of manifest.files) {
    if (
      !entry ||
      typeof entry.filename !== "string" ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes <= 0 ||
      seen.has(entry.filename)
    )
      continue;
    seen.add(entry.filename);
    if (
      entry.filename === "ProjectCAD-Assistant-macos-universal.pkg" &&
      entry.platform === "macos"
    )
      installers.push({
        filename: entry.filename,
        url: `${baseUrl}/${entry.filename}`,
        bytes: entry.bytes,
        platform: "macos",
        name: "macOS",
        architecture: "Apple silicon + Intel",
      });
    else {
      const match =
        /^ProjectCAD-Assistant-(windows|linux)-(x64|arm64)(-Setup\.exe|\.run)$/.exec(
          entry.filename,
        );
      if (
        !match ||
        match[1] !== entry.platform ||
        (match[1] === "windows"
          ? match[3] !== "-Setup.exe"
          : match[3] !== ".run")
      )
        continue;
      installers.push({
        filename: entry.filename,
        url: `${baseUrl}/${entry.filename}`,
        bytes: entry.bytes,
        platform: match[1] as "windows" | "linux",
        name: match[1] === "windows" ? "Windows" : "Linux",
        architecture: match[2] === "arm64" ? "ARM64" : "x64",
      });
    }
  }
  return installers.length
    ? { version: manifest.version, installers, releaseUrl }
    : undefined;
}

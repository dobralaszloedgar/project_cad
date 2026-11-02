import type { Page } from "@playwright/test";

// Keep legacy coverage independent of the currently published release inventory.
export const downloads = {
  name: "Project CAD Assistant",
  version: "0.1.4",
  files: [
    {
      platform: "macos",
      architecture: "universal",
      filename: "ProjectCAD-Assistant-macos-universal.pkg",
    },
    ...["x64", "arm64"].flatMap((architecture) => [
      {
        platform: "windows",
        architecture,
        filename: `ProjectCAD-Assistant-windows-${architecture}-Setup.exe`,
      },
      {
        platform: "linux",
        architecture,
        filename: `ProjectCAD-Assistant-linux-${architecture}.run`,
      },
    ]),
  ].map((file) => ({
    ...file,
    bytes:
      file.platform === "windows"
        ? file.architecture === "arm64"
          ? 23000000
          : 26000000
        : file.platform === "macos"
          ? 83000000
          : 48000000,
    sha256: "0".repeat(64),
  })),
  distribution: {
    provider: "vercel-blob",
    baseUrl:
      "https://teststore.public.blob.vercel-storage.com/project-cad-assistant/v0.1.4",
  },
};
export const universalDownloads = {
  ...downloads,
  files: [
    downloads.files[0],
    ...["windows", "linux"].map((platform) => ({
      platform,
      architecture: "universal",
      filename: `ProjectCAD-Assistant-${platform}-universal${platform === "windows" ? "-Setup.exe" : ".run"}`,
      bytes: 48000000,
      sha256: "0".repeat(64),
    })),
  ],
};
export async function mockAssistantDownloads(page: Page) {
  await page.route("**/downloads/assistant/downloads.json", (route) =>
    route.fulfill({ json: downloads }),
  );
}

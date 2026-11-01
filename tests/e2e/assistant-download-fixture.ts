import type { Page } from "@playwright/test";
import publishedDownloads from "../../public/downloads/assistant/downloads.json" with { type: "json" };

// Exercise a compatible release without touching public installer storage.
export const downloads = {
  ...publishedDownloads,
  version: "0.1.4",
  distribution: {
    provider: "vercel-blob",
    baseUrl:
      "https://teststore.public.blob.vercel-storage.com/project-cad-assistant/v0.1.4",
  },
};
export async function mockAssistantDownloads(page: Page) {
  await page.route("**/downloads/assistant/downloads.json", (route) =>
    route.fulfill({ json: downloads }),
  );
}

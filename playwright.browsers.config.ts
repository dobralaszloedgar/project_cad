// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const shared = ["browser-compatibility.spec.ts", "themes.spec.ts"];
const folders = [
  ...shared,
  "project-folder-setup.spec.ts",
  "project-new-menu.spec.ts",
  "project-folders.spec.ts",
];

export default defineConfig(base, {
  outputDir: "test-results/browsers",
  reporter: [
    ["list"],
    ["html", { outputFolder: "test-results/browser-report", open: "never" }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? base.use?.baseURL,
    trace: "retain-on-failure",
    actionTimeout: 15_000,
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : base.webServer,
  projects: [
    {
      name: "edge",
      testMatch: folders,
      use: { browserName: "chromium", channel: "msedge" },
    },
    {
      name: "chrome",
      testMatch: folders,
      use: { browserName: "chromium", channel: "chrome" },
    },
    { name: "firefox", testMatch: shared, use: { browserName: "firefox" } },
    // Playwright WebKit covers Safari's engine; it is not macOS Safari itself.
    { name: "webkit", testMatch: shared, use: { browserName: "webkit" } },
  ],
});

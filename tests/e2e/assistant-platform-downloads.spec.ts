import { test, expect } from "./test";
import { universalDownloads } from "./assistant-download-fixture";

const files = {
  macos: "ProjectCAD-Assistant-macos-universal.pkg",
  windows: "ProjectCAD-Assistant-windows-universal-Setup.exe",
  linux: "ProjectCAD-Assistant-linux-universal.run",
};
const base = universalDownloads.distribution.baseUrl;

test.beforeEach(async ({ page }) => {
  await page.route("http://127.0.0.1:43118/**", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.route("**/downloads/assistant/downloads.json", (route) =>
    route.fulfill({ json: universalDownloads }),
  );
  await page.route(`${base}/**`, (route) => route.fulfill({ status: 200 }));
  await page.addInitScript(() => {
    localStorage.setItem(
      "project-cad.assistant-agents",
      JSON.stringify({ providers: ["codex"], preferred: "codex" }),
    );
  });
});

for (const [platform, name] of [
  ["macos", "macOS"],
  ["windows", "Windows"],
  ["linux", "Linux"],
] as const) {
  test(`auto-selects ${name} and exposes all three operating systems`, async ({
    page,
  }) => {
    await page.addInitScript((platformName) => {
      Object.defineProperty(navigator, "userAgentData", {
        value: { platform: platformName, mobile: false },
        configurable: true,
      });
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0",
        configurable: true,
      });
    }, name);
    await page.goto("/sandbox/assistant");
    const select = page.getByLabel("Operating system", { exact: true });
    await expect(select).toBeVisible();
    await expect(select).toHaveValue(files[platform]);
    await expect(select.locator("option")).toHaveCount(3);
    await expect(
      page.getByRole("link", { name: `Download for ${name}` }),
    ).toHaveAttribute("href", `${base}/${files[platform]}`);
    for (const alternate of Object.keys(files) as (keyof typeof files)[]) {
      await select.selectOption(files[alternate]);
      await expect(
        page.getByRole("link", { name: /^Download for/ }),
      ).toHaveAttribute("href", `${base}/${files[alternate]}`);
      await expect(select).toBeVisible();
    }
  });
}

test("unknown OS asks for a choice instead of offering macOS", async ({
  page,
}) => {
  await page.addInitScript(() => {
    for (const [key, value] of Object.entries({
      userAgent: "Mozilla/5.0",
      platform: "",
      userAgentData: undefined,
    })) {
      Object.defineProperty(navigator, key, { value, configurable: true });
    }
  });
  await page.goto("/sandbox/assistant");
  const select = page.getByLabel("Operating system", { exact: true });
  await expect(select).toHaveValue("");
  await expect(page.getByRole("link", { name: /^Download for/ })).toHaveCount(
    0,
  );
  await select.selectOption(files.windows);
  await expect(
    page.getByRole("link", { name: "Download for Windows" }),
  ).toHaveAttribute("href", `${base}/${files.windows}`);
});

test("a failed Windows check still lets users choose Linux and preserves the choice on retry", async ({
  page,
}) => {
  let blocked = true;
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "userAgentData", {
      value: { platform: "Windows", mobile: false },
      configurable: true,
    }),
  );
  await page.route(`${base}/${files.windows}`, (route) =>
    route.fulfill({ status: 403 }),
  );
  await page.route(`${base}/${files.linux}`, (route) =>
    route.fulfill({ status: blocked ? 403 : 200 }),
  );
  await page.goto("/sandbox/assistant");
  await expect(
    page
      .getByRole("region", { name: "Assistant connection", exact: true })
      .getByRole("alert"),
  ).toContainText("Installer downloads are temporarily unavailable");
  const select = page.getByLabel("Operating system", { exact: true });
  await expect(select).toBeVisible();
  await select.selectOption(files.linux);
  await expect(
    page.getByRole("button", { name: "Retry downloads" }),
  ).toBeEnabled();
  blocked = false;
  await page.getByRole("button", { name: "Retry downloads" }).click();
  await expect(select).toHaveValue(files.linux);
  await expect(
    page.getByRole("link", { name: "Download for Linux" }),
  ).toHaveAttribute("href", `${base}/${files.linux}`);
});

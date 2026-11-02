import { test, expect } from "./test";
import { universalDownloads } from "./assistant-download-fixture";
import {
  installAssistant,
  approveAssistant,
  pendingAssistantConnection,
} from "./assistant-fixture";

let dispose: (() => Promise<void>) | undefined;
test.beforeEach(async ({ page }) => {
  dispose = await installAssistant(page);
});
test.afterEach(async () => {
  await dispose?.();
});

test("automatically selects only Muse and exposes every discovered model", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/workspace?example=heating");
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Muse connector is ready" }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /Codex|Claude|Muse/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Connect assistant", exact: true })
    .click();
  expect((await pendingAssistantConnection(page)).agents).toEqual({
    providers: ["muse"],
    preferred: "muse",
  });
  await approveAssistant(page);
  const model = page.getByRole("button", { name: "Choose provider and model" });
  await expect(model).toContainText("Muse");
  await model.click();
  await expect(
    page.getByRole("group", { name: "Assistant provider" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Assistant model" }).getByRole("button"),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Muse alternate", exact: true })
    .click();
  await page.getByLabel("Process prompt").fill("read the current project");
  const created = page.waitForRequest(
    (request) =>
      request.url().includes("/conversations?") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  expect((await created).postDataJSON()).toMatchObject({
    provider: "muse",
    model: "muse-second",
  });
  await expect(page.getByText(/Current project:/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("cancelling and retrying preserves automatic Muse selection", async ({
  page,
}) => {
  await page.goto("/workspace?example=heating");
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect assistant", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel connection", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Muse connector is ready" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Connect assistant", exact: true })
    .click();
  await approveAssistant(page);
  await expect(
    page.getByRole("button", { name: "Choose provider and model" }),
  ).toContainText("Muse");
});
test("downloads the matching connector automatically once and retains a manual retry", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:43118/health", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.route("**/downloads/assistant/downloads.json", (route) =>
    route.fulfill({
      json: {
        ...universalDownloads,
        version: "0.1.8",
        distribution: {
          ...universalDownloads.distribution,
          baseUrl: universalDownloads.distribution.baseUrl.replace(
            "v0.1.4",
            "v0.1.8",
          ),
        },
      },
    }),
  );
  await page
    .context()
    .route("https://teststore.public.blob.vercel-storage.com/**", (route) =>
      route.fulfill({
        contentType: "application/octet-stream",
        headers: {
          "Content-Disposition": `attachment; filename="${new URL(route.request().url()).pathname.split("/").at(-1)}"`,
        },
        body: "Installer test fixture",
      }),
    );
  const downloaded: string[] = [];
  page.on("download", (download) =>
    downloaded.push(download.suggestedFilename()),
  );
  await page.goto("/workspace?example=heating");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(
    /^ProjectCAD-Assistant-/,
  );
  await expect(
    page.getByRole("heading", { name: "Open your download" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download again", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await expect(page.getByRole("link", { name: /^Download for/ })).toBeVisible();
  expect(downloaded).toHaveLength(1);
});

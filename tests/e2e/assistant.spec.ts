import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { connectAssistant, installAssistant } from "./assistant-fixture";
import {
  installFolderPicker,
  folderText,
  folderControls,
  recoveryWorkspace,
} from "./folder-fixture";

let dispose: (() => Promise<void>) | undefined;
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on("pageerror", (error) => list.push(error.message));
  dispose = await installAssistant(page);
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  await dispose?.();
});
async function start(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await connectAssistant(page);
  await expect(page.getByLabel("Assistant model")).toHaveValue("test-model");
}
async function send(page: Page, prompt: string) {
  await page.getByLabel("Process prompt").fill(prompt);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
}

test("offers the packaged companion and keeps source setup optional", async ({
  page,
}) => {
  await page.route("**/downloads/assistant/downloads.json", (route) =>
    route.fulfill({
      json: {
        name: "Project CAD Assistant",
        version: "0.1.0",
        release: {
          repository: "jiwoong3/project-cad-downloads",
          tag: "v0.1.0",
        },
        files: [
          {
            filename: "ProjectCAD-Assistant-macos-universal.pkg",
            platform: "macos",
            bytes: 82000000,
          },
          {
            filename: "ProjectCAD-Assistant-windows-x64-Setup.exe",
            platform: "windows",
            bytes: 42000000,
          },
          {
            filename: "ProjectCAD-Assistant-windows-arm64-Setup.exe",
            platform: "windows",
            bytes: 42000000,
          },
          {
            filename: "ProjectCAD-Assistant-linux-x64.run",
            platform: "linux",
            bytes: 50000000,
          },
          {
            filename: "ProjectCAD-Assistant-linux-arm64.run",
            platform: "linux",
            bytes: 50000000,
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  const installer = page.getByLabel("Assistant installer");
  await installer.selectOption("ProjectCAD-Assistant-macos-universal.pkg");
  const download = page.getByRole("link", { name: "Download for macOS" });
  await expect(download).toHaveAttribute(
    "href",
    "https://github.com/jiwoong3/project-cad-downloads/releases/download/v0.1.0/ProjectCAD-Assistant-macos-universal.pkg",
  );
  await installer.selectOption("ProjectCAD-Assistant-windows-arm64-Setup.exe");
  await expect(
    page.getByRole("link", { name: "Download for Windows" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/jiwoong3/project-cad-downloads/releases/download/v0.1.0/ProjectCAD-Assistant-windows-arm64-Setup.exe",
  );
  await installer.selectOption("ProjectCAD-Assistant-linux-arm64.run");
  await expect(
    page.getByRole("link", { name: "Download for Linux" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/jiwoong3/project-cad-downloads/releases/download/v0.1.0/ProjectCAD-Assistant-linux-arm64.run",
  );
  await installer.selectOption("ProjectCAD-Assistant-macos-universal.pkg");
  await expect(
    page.getByRole("link", { name: "All downloads and checksums" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/jiwoong3/project-cad-downloads/releases/tag/v0.1.0",
  );
  await expect(
    page.getByText("npm run assistant", { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect local assistant" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "/tmp/project-cad-assistant-qa/assistant-setup-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(download).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/project-cad-assistant-qa/assistant-setup-mobile.png",
    fullPage: true,
  });
  await page.unroute("**/downloads/assistant/downloads.json");
  await page.route("**/downloads/assistant/downloads.json", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await expect(
    page.getByText("Use your Project CAD Assistant installation to connect."),
  ).toBeVisible();
  await expect(download).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Connect local assistant" }),
  ).toBeEnabled();
});

test("reviews changes, saves one revision, resumes history, and reads the latest project", async ({
  page,
}) => {
  await start(page);
  await send(page, "Set the reactor temperature to 500 K.");
  const proposal = page.getByRole("region", {
    name: "Review proposed changes",
  });
  await expect(proposal).toBeVisible();
  await page.getByRole("button", { name: "Apply reviewed actions" }).click();
  await expect(proposal).toContainText("Applied and saved");
  await send(page, "read the latest project");
  await expect(page.locator(".chat-response").last()).toContainText(
    "6 equipment",
  );
  await page.getByRole("button", { name: "Close assistant panel" }).click();
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await page.getByRole("button", { name: /^Revisions/ }).click();
  await expect(
    page
      .locator(".revision-row")
      .filter({ hasText: "Apply assistant changes" }),
  ).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.reload();
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Review proposed changes" }),
  ).toContainText("Changes applied");
  await mkdir("/tmp/project-cad-assistant-qa", { recursive: true });
  await page.screenshot({
    path: "/tmp/project-cad-assistant-qa/assistant-desktop.png",
    fullPage: true,
  });
});

test("stale proposals cannot apply and minimizing preserves the draft and running request", async ({
  page,
}) => {
  await start(page);
  await send(page, "Prepare a temperature change");
  await expect(
    page.getByRole("button", { name: "Apply reviewed actions" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Close assistant panel" }).click();
  await page.getByRole("button", { name: "Equipment", exact: true }).click();
  await page.getByTitle("Add Feed", { exact: true }).click();
  await page
    .getByRole("button", { name: "Close Equipment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply reviewed actions" }),
  ).toBeDisabled();
  await page.getByLabel("Process prompt").fill("A draft to keep");
  await page.getByRole("button", { name: "Close assistant panel" }).click();
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await expect(page.getByLabel("Process prompt")).toHaveValue(
    "A draft to keep",
  );
  await send(page, "hold this request");
  await expect(
    page.getByRole("button", { name: "Stop response" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close assistant panel" }).click();
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop response" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop response" }).click();
  await expect(page.getByText("Stopped by you.")).toBeVisible();
});

test("supports all providers, read-only conversations, failures and mobile layout", async ({
  page,
}) => {
  await start(page);
  for (const provider of ["claude", "muse", "codex"]) {
    await page
      .getByRole("button", { name: "New conversation", exact: true })
      .click();
    await page.getByLabel("Assistant provider").selectOption(provider);
    await page.getByLabel("Assistant access").selectOption("read-only");
    await send(page, `read with ${provider}`);
    await expect(page.locator(".chat-response").last()).toContainText(
      "6 equipment",
    );
    await expect(
      page.getByRole("button", { name: "Send message", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Apply reviewed actions" }),
    ).toHaveCount(0);
  }
  await send(page, "fail this request");
  await expect(
    page.getByText("Test provider connection failed."),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByLabel("Process prompt")).toBeVisible();
  await page.screenshot({
    path: "/tmp/project-cad-assistant-qa/assistant-mobile.png",
    fullPage: true,
  });
});

test("applies a proposal to the chosen project.json and preserves recovery when disk writing fails", async ({
  page,
}) => {
  await installFolderPicker(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Project navigation" })
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Create project",
    exact: true,
  });
  await dialog
    .getByLabel("Project name", { exact: true })
    .fill("Assistant plant");
  await dialog
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await connectAssistant(page);
  await expect(page.getByLabel("Assistant model")).toHaveValue("test-model");
  await send(page, "Add a feed");
  await page.getByRole("button", { name: "Apply reviewed actions" }).click();
  await expect(
    page.getByRole("region", { name: "Review proposed changes" }),
  ).toContainText("saved to project.json");
  const saved = JSON.parse(await folderText(page, "Assistant plant"));
  expect(saved.workspace.project.units[0].id).toBe("F-901");
  expect(saved.workspace.revisions.at(-1).label).toBe(
    "Apply assistant changes",
  );
  await folderControls(page, { "write-failure": "yes" });
  await send(page, "Change the feed temperature");
  await page.getByRole("button", { name: "Apply reviewed actions" }).click();
  await expect(
    page.getByRole("region", { name: "Review proposed changes" }).last(),
  ).toContainText("local recovery");
  expect(
    JSON.parse(await folderText(page, "Assistant plant")).workspace.project
      .units[0].params.temperature,
  ).not.toBe(500);
  const recovered = await recoveryWorkspace(page);
  expect(recovered.project.units[0]).toMatchObject({
    id: "F-901",
    params: { temperature: 500 },
  });
});

test("switching projects isolates history and interrupts the old project's request", async ({
  page,
}) => {
  await installFolderPicker(page);
  await start(page);
  await send(page, "hold this project request");
  await expect(
    page.getByRole("button", { name: "Stop response" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close assistant panel" }).click();
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Project navigation" })
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Create project",
    exact: true,
  });
  await dialog
    .getByLabel("Project name", { exact: true })
    .fill("Separate study");
  await dialog
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await expect(page.getByLabel("Assistant model")).toHaveValue("test-model");
  await expect(page.locator(".chat-user-message")).toHaveCount(0);
  await send(page, "read this separate project");
  await expect(page.locator(".chat-response")).toContainText(
    "Separate study. 0 equipment",
  );
  await page.getByRole("button", { name: "Close assistant panel" }).click();
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Open Heated reactor with recycle",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await expect(
    page.getByText("The project closed. Send a follow-up to continue."),
  ).toBeVisible();
  await expect(page.locator(".chat-user-message")).toHaveText(
    "hold this project request",
  );
});

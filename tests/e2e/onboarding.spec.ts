import { expect, test } from "@playwright/test";
import {
  folderControls,
  folderText,
  installFolderPicker,
} from "./folder-fixture";

test("landing leads to folder setup, first project, and a remembered workspace", async ({
  page,
}, info) => {
  await installFolderPicker(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Design.", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".canvas-panel")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("landing.png"),
    animations: "disabled",
  });
  await page.getByRole("link", { name: "Open workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(
    page.getByRole("heading", { name: "A home for your projects." }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("onboarding-folder.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await expect(page.getByLabel("Project name", { exact: true })).toBeFocused();
  await page.getByLabel("Project name", { exact: true }).fill("First process");
  await expect(page.locator("#project-destination")).toHaveText(
    "Laptop projects/First process.pcad",
  );
  await page.screenshot({
    path: info.outputPath("onboarding-project.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.locator(".project-heading h1")).toHaveText("First process");
  await expect(page.locator(".save-status")).toContainText(
    "First process.pcad",
  );
  await expect(
    page.getByRole("dialog", { name: "Choose project folder" }),
  ).toHaveCount(0);
  const saved = JSON.parse(await folderText(page, "First process"));
  expect(saved.workspace.project.units.length).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath("first-workspace.png") });
  await page.getByRole("button", { name: "Landing page", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Design.", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.locator(".project-heading h1")).toHaveText("First process");
  expect(JSON.parse(await folderText(page, "First process")).projectId).toBe(
    saved.projectId,
  );
  expect(
    await page.evaluate(() => localStorage.getItem("folder-qa-picker-count")),
  ).toBe("1");
  expect(errors).toEqual([]);
});

test("cancelled selection, invalid names and denied permission remain recoverable", async ({
  page,
}) => {
  await installFolderPicker(page);
  await page.goto("/onboarding");
  await folderControls(page, { cancel: "yes" });
  await page
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A home for your projects." }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await page.getByLabel("Project name", { exact: true }).fill("Invalid/name");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.locator("#project-name-error")).toContainText(
    "folder-safe name",
  );
  await page.getByLabel("Project name", { exact: true }).fill("Blank study");
  await page.getByRole("radio", { name: /Blank flowsheet/ }).check();
  await folderControls(page, { grant: "denied" });
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Allow folder access",
  );
  await folderControls(page, { grant: "granted" });
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workspace$/);
  expect(
    JSON.parse(await folderText(page, "Blank study")).workspace.project.units,
  ).toEqual([]);
});

test("mobile browsers can explore an example without folder setup", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFolderPicker(page, true);
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Open workspace", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("landing-mobile.png"),
    animations: "disabled",
  });
  await page.getByRole("link", { name: "Open workspace", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Choose folder", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("Chrome or Edge");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("onboarding-mobile.png"),
    animations: "disabled",
  });
  await page.getByRole("link", { name: "Explore an example first" }).click();
  await expect(page).toHaveURL(/\/workspace\?example=heating$/);
  await expect(page.locator(".canvas-panel")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Choose project folder" }),
  ).toHaveCount(0);
});

test("old landing and example links lead to their new addresses", async ({
  page,
}) => {
  await page.goto("/landing");
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Design.", exact: true }),
  ).toBeVisible();
  await page.goto("/?example=heating&view=Split&arrange=1");
  await expect(page).toHaveURL(/\/workspace\?example=heating&view=Split$/);
  await expect(page.locator(".canvas-panel")).toBeVisible();
});

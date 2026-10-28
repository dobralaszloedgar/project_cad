import { test, expect } from "@playwright/test";
import { reactorExample } from "../../src/domain/examples";
import { checkpoint } from "../../src/lib/revisions";
test("projects create, rename, search, star, duplicate and reopen independent histories", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Start from a template" })
    .getByRole("button", { name: /Simple heating/ })
    .click();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await expect(page.locator(".project-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Actions for Simple heating" })
    .click();
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("Heating study");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(
    page.getByRole("button", { name: "Open Heating study", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Star Heating study", exact: true })
    .click();
  await page.getByRole("button", { name: "Starred", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "My projects", exact: false })
    .first()
    .click();
  await page.getByLabel("Search projects").fill("Heating");
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.getByLabel("Search projects").fill("");
  await page.getByRole("button", { name: "Actions for Heating study" }).click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(3);
  await page.getByLabel("Sort projects").selectOption("name");
  await page.getByRole("button", { name: "Recent", exact: true }).click();
  await expect(page.getByLabel("Sort projects")).toHaveValue("modified");
  await expect(page.getByLabel("Sort projects")).toBeDisabled();
  await expect(page.locator(".project-card-title strong").first()).toHaveText(
    /^Heating study(?: copy)?$/,
  );
  await page
    .getByRole("button", { name: "My projects", exact: false })
    .first()
    .click();
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.locator(".project-list")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Open Heated reactor with recycle",
      exact: true,
    })
    .click();
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await page.getByRole("button", { name: "Open revision history" }).click();
  await expect(page.locator(".revision-row")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open Heating study", exact: true })
    .click();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.locator(".project-heading h1")).toHaveText("Heating study");
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await expect(page.locator(".project-card")).toHaveCount(3);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "New", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Grid view" }).click();
  const previewsFit = await page
    .locator(".project-preview")
    .evaluateAll((previews) =>
      previews.every((preview) => {
        const bounds = preview.getBoundingClientRect();
        return [...preview.querySelectorAll(".preview-unit")].every((unit) => {
          const box = unit.getBoundingClientRect();
          return (
            box.left >= bounds.left &&
            box.right <= bounds.right &&
            box.top >= bounds.top &&
            box.bottom <= bounds.bottom
          );
        });
      }),
    );
  expect(previewsFit).toBe(true);
  await page
    .getByRole("button", { name: "Open Heating study", exact: true })
    .click();
  await expect(page.locator(".equipment-library")).toHaveCount(0);
  await page.getByRole("button", { name: "Open Meta assistant" }).click();
  await expect(
    page.getByRole("textbox", { name: "Process prompt" }),
  ).toBeVisible();
});

test("existing single-project storage upgrades without losing the graph or history", async ({
  page,
}) => {
  const project = reactorExample();
  project.name = "Existing reactor study";
  const workspace = {
    version: 1,
    project,
    revisions: [checkpoint(project, "Existing checkpoint")],
  };
  await page.goto("/api/ai");
  await page.evaluate(
    (saved) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("project-cad", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("workspace");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("workspace", "readwrite");
          transaction.objectStore("workspace").put(saved, "current");
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    workspace,
  );
  await page.goto("/");
  await expect(page.locator(".project-heading h1")).toHaveText(project.name);
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await page.getByRole("button", { name: "Open revision history" }).click();
  await expect(page.locator(".revision-row")).toContainText(
    "Existing checkpoint",
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: `Open ${project.name}`, exact: true })
    .click();
  await page.reload();
  await expect(page.locator(".project-heading h1")).toHaveText(project.name);
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
});

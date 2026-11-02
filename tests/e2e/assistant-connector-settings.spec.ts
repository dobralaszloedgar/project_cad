import { test, expect } from "./test";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectAssistant, installAssistant } from "./assistant-fixture";

test("older connectors keep chat available and explain the settings update", async ({
  page,
}) => {
  const dispose = await installAssistant(page, undefined, {
    connectorSettings: false,
  });
  try {
    await page.goto("/workspace");
    await connectAssistant(page);
    await page
      .getByRole("button", { name: "Assistant connection", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Connector settings", exact: true })
      .click();
    await expect(
      page.getByText(
        "Update Project CAD Assistant to manage these settings here.",
      ),
    ).toBeVisible();
    await expect(
      page.getByLabel("CAD projects folder", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Back to chat", exact: true })
      .click();
    await expect(page.getByLabel("Process prompt")).toBeVisible();
  } finally {
    await dispose();
  }
});

for (const size of [
  { width: 1536, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`connector preferences stay in the project at ${size.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    const dispose = await installAssistant(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto("/workspace");
      await connectAssistant(page);
      await expect(page.getByLabel("Process prompt")).toBeVisible();
      await page
        .getByRole("button", { name: "Assistant connection", exact: true })
        .click();
      await expect(
        page.getByText("Connected to this computer", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Connector settings", exact: true })
        .click();
      await expect(
        page.getByLabel("Connector access", { exact: true }),
      ).toHaveValue("yolo");
      await page
        .getByLabel("Connector access", { exact: true })
        .selectOption("sandbox");
      await page
        .getByLabel("CAD projects folder", { exact: true })
        .fill("relative/path");
      await page
        .getByRole("button", { name: "Save settings", exact: true })
        .click();
      await expect(
        page
          .getByRole("region", { name: "Connector settings", exact: true })
          .getByRole("alert"),
      ).toContainText("full folder path");
      const folder = join(tmpdir(), "my-cad-projects");
      await page
        .getByLabel("CAD projects folder", { exact: true })
        .fill(folder);
      await page
        .getByRole("button", { name: "Save settings", exact: true })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "Settings saved" }),
      ).toBeVisible();
      expect(page.context().pages()).toHaveLength(1);
      await page
        .getByRole("button", { name: "Back to chat", exact: true })
        .click();
      await expect(page.getByLabel("Process prompt")).toBeVisible();
      await page
        .getByRole("button", { name: "Assistant connection", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Connector settings", exact: true })
        .click();
      await expect(
        page.getByLabel("Connector access", { exact: true }),
      ).toHaveValue("sandbox");
      await expect(
        page.getByLabel("CAD projects folder", { exact: true }),
      ).toHaveValue(folder);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const output =
        process.env.PROJECT_CAD_QA_DIR ||
        join(tmpdir(), "project-cad-connector-in-app-qa");
      await mkdir(output, { recursive: true });
      await page.screenshot({
        path: join(output, `settings-${size.width}.png`),
      });
      expect(errors).toEqual([]);
    } finally {
      await dispose();
    }
  });
}

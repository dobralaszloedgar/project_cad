import { expect, test, type Page } from "./test";
import { installFolderPicker } from "./folder-fixture";

async function openProjectDialog(
  page: Page,
  title: "Create project" | "Rename project",
) {
  if (title === "Create project") {
    await page
      .getByRole("navigation", { name: "Project navigation" })
      .getByRole("button", { name: title, exact: true })
      .click();
  } else {
    await page.locator(".project-card-menu-toggle").first().click();
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  }
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await installFolderPicker(page);
  await page.goto("/workspace");
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
});

for (const title of ["Create project", "Rename project"] as const) {
  test(`${title} keeps name selection drags open across the backdrop`, async ({
    page,
  }) => {
    const dialog = await openProjectDialog(page, title);
    const name = dialog.getByRole("textbox", { name: "Project name" });
    const bounds = (await dialog.boundingBox())!;
    const input = (await name.boundingBox())!;
    const y = input.y + input.height / 2;

    for (const edge of ["left", "right"]) {
      await name.fill("Untitled process");
      const insideX =
        edge === "left" ? input.x + input.width - 12 : input.x + 4;
      const outsideX =
        edge === "left" ? bounds.x - 20 : bounds.x + bounds.width + 20;

      await page.mouse.move(insideX, y);
      await page.mouse.down();
      await page.mouse.move(outsideX, y, { steps: 12 });
      await page.mouse.up();

      await expect(dialog).toBeVisible();
      expect(
        await name.evaluate((element: HTMLInputElement) =>
          element.value.slice(element.selectionStart!, element.selectionEnd!),
        ),
      ).toBe("Untitled process");
      await page.keyboard.insertText("Renamed study");
      await expect(name).toHaveValue("Renamed study");
    }

    // The reverse gesture also targets the dialog as the common ancestor.
    await page.mouse.move(bounds.x - 20, y);
    await page.mouse.down();
    await page.mouse.move(input.x + input.width / 2, y, { steps: 12 });
    await page.mouse.up();
    await expect(dialog).toBeVisible();
    await expect(name).toHaveValue("Renamed study");

    // A subsequent intentional backdrop click must still dismiss it.
    await page.mouse.click(bounds.x - 20, y);
    await expect(dialog).toHaveCount(0);
  });
}

test("project dialogs still close with Escape, Cancel and the close button", async ({
  page,
}) => {
  for (const title of ["Create project", "Rename project"] as const) {
    for (const action of ["Escape", "Cancel", "Close"]) {
      const dialog = await openProjectDialog(page, title);
      if (action === "Escape") await page.keyboard.press("Escape");
      else
        await dialog
          .getByRole("button", {
            name: action === "Close" ? `Close ${title}` : action,
            exact: true,
          })
          .click();
      await expect(dialog).toHaveCount(0);
    }
  }
});

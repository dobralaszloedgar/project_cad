import { expect, type Page } from "@playwright/test";

/** Submit either a remembered destination or the first project's folder step. */
export async function submitNewProject(page: Page, expectSuccess = true) {
  const dialog = page.getByRole("dialog", {
    name: "Create project",
    exact: true,
  });
  await expect(dialog.locator("form")).toHaveAttribute("aria-busy", "false");
  const next = dialog.getByRole("button", { name: "Continue", exact: true });
  if (await next.isVisible()) {
    await next.click();
    const location = page.getByRole("dialog", {
      name: /^(Choose a|Reconnect your) project folder$/,
    });
    await location
      .getByRole("button", { name: /^(Choose folder|Reconnect) & create$/ })
      .click();
  } else {
    await dialog
      .getByRole("button", { name: "Create project", exact: true })
      .click();
  }
  if (expectSuccess)
    await expect(
      page.getByRole("dialog", {
        name: /^(Create project|(Choose a|Reconnect your) project folder)$/,
      }),
    ).toHaveCount(0);
}

export async function startNewProject(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Project navigation" })
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Create project",
    exact: true,
  });
  await dialog.getByLabel("Project name", { exact: true }).fill(name);
  await expect(dialog.locator("form")).toHaveAttribute("aria-busy", "false");
  return dialog;
}

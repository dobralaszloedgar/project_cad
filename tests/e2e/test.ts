import { test as base, type Page } from "@playwright/test";

export { expect, type Page, type Locator } from "@playwright/test";

export async function dismissProjectFolderSetup(page: Page) {
  const setup = page.getByRole("region", {
    name: /^(Choose|Reconnect) project folder$/,
  });
  await page.addLocatorHandler(setup, async () => {
    await setup.getByRole("button", { name: /^Dismiss folder/ }).click();
  });
}

// Existing editor/library tests exercise the optional demo path. Folder setup
// itself is covered without this dismissal in project-folder-setup.spec.ts.
export const test = base.extend({
  context: async ({ context }, runTest) => {
    context.on("page", dismissProjectFolderSetup);
    await runTest(context);
  },
});

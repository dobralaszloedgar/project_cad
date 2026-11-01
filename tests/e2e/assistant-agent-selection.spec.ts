import { test, expect } from "./test";
import { installAssistant } from "./assistant-fixture";

let dispose: (() => Promise<void>) | undefined;
test.beforeEach(async ({ page }) => {
  dispose = await installAssistant(page);
});
test.afterEach(async () => {
  await dispose?.();
});

test("chooses agents before setup and uses the selected default for the first chat", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // A ready example keeps folder onboarding from interrupting connector setup.
  await page.goto("/workspace?example=heating");
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose your agents" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Connect assistant", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Download for/ })).toHaveCount(
    0,
  );
  await page
    .getByRole("checkbox", { name: "Claude Code", exact: true })
    .check();
  await page.getByRole("checkbox", { name: "Muse", exact: true }).check();
  await page.getByLabel("Default agent", { exact: true }).selectOption("muse");
  await page.screenshot({
    path: "/tmp/project-cad-connector-qa/05-website-agent-selection.png",
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your assistant is ready" }),
  ).toBeVisible();
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Connect assistant", exact: true })
    .click();
  const popup = await popupPromise;
  await expect(popup.locator("body")).toContainText(
    "Selected agents: Claude Code, Muse",
  );
  await expect(popup.locator("body")).toContainText("Default: Muse");
  await popup
    .getByRole("button", { name: "Connect assistant", exact: true })
    .click();
  const model = page.getByRole("button", { name: "Choose provider and model" });
  await expect(model).toContainText("Muse");
  await model.click();
  await expect(
    page
      .getByRole("group", { name: "Assistant provider" })
      .getByRole("button", { name: "Codex", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByLabel("Process prompt").fill("read the current project");
  const created = page.waitForRequest(
    (request) =>
      request.url().includes("/conversations?") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  expect((await created).postDataJSON().provider).toBe("muse");
  await expect(page.getByText(/Current project:/)).toBeVisible();
  await model.click();
  await page
    .getByRole("group", { name: "Assistant provider" })
    .getByRole("button", { name: "Claude Code", exact: true })
    .click();
  await expect(model).toContainText("Claude Code");
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(model).toContainText("Muse");
  expect(errors).toEqual([]);
});

test("cancelling approval keeps the selected agent and a retry connects it", async ({
  page,
}) => {
  await page.goto("/workspace?example=heating");
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Claude Code", exact: true })
    .check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  let popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Connect assistant", exact: true })
    .click();
  await (await popupPromise).close();
  await expect(
    page.getByRole("alert").filter({ hasText: "Connection window closed" }),
  ).toContainText("Connection window closed");
  await expect(
    page.getByText("Default: Claude Code", { exact: true }),
  ).toBeVisible();
  popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Connect assistant", exact: true })
    .click();
  await (
    await popupPromise
  )
    .getByRole("button", { name: "Connect assistant", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Choose provider and model" }),
  ).toContainText("Claude Code");
  await page.reload();
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Choose provider and model" }),
  ).toContainText("Claude Code");
});

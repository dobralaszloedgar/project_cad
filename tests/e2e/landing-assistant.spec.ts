import { expect, test, type Page } from "./test";
import { connectAssistant, installAssistant } from "./assistant-fixture";

async function withinViewport(page: Page) {
  const bounds = await page.locator("#landing-assistant").boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 980, height: 600 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`assistant fits ${viewport.width}x${viewport.height} and opens onboarding on request`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors = new Set<string>();
    page.on("pageerror", (error) => errors.add(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.add(message.text());
    });
    await page.goto("/");
    await expect(page).toHaveTitle(/Project CAD/);
    await expect(
      page.getByRole("heading", { name: "Design.", exact: true }),
    ).toBeVisible();
    const chat = page.locator("[data-design-chat]");
    await expect(chat).toHaveAttribute("data-expanded", "true");
    await expect(page.locator("[data-demo-cursor]")).toHaveCount(0);
    await withinViewport(page);
    await expect(
      chat.getByRole("button", { name: "Build this flowsheet" }),
    ).toBeInViewport();
    await page.screenshot({ path: info.outputPath("assistant.png") });
    await page
      .getByRole("button", { name: "Minimize assistant demo", exact: true })
      .click();
    const bubble = page.getByRole("button", {
      name: "Open assistant demo",
      exact: true,
    });
    await expect(bubble).toHaveCSS("width", "44px");
    await expect(bubble).toHaveCSS("height", "44px");
    await bubble.focus();
    await page.keyboard.press("Enter");
    await expect(chat).toHaveAttribute("data-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(chat).toHaveAttribute("data-expanded", "false");
    await bubble.click();
    await page.getByRole("button", { name: "Choose demo provider" }).click();
    await page.getByRole("button", { name: "Muse", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Choose demo provider" }),
    ).toContainText("Muse");
    // Escape from within the dialog returns focus to the launcher.
    await page.getByRole("button", { name: "Choose demo provider" }).focus();
    await page.keyboard.press("Escape");
    await expect(chat).toHaveAttribute("data-expanded", "false");
    await expect(bubble).toBeFocused();
    await bubble.click();
    await withinViewport(page);
    await expect(page).toHaveURL(/\/$/);
    await page
      .getByRole("link", { name: "Open workspace", exact: true })
      .click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(
      page.getByRole("heading", { name: "A home for your projects." }),
    ).toBeVisible();
    expect([...errors]).toEqual([]);
  });
}

test("resizing an open assistant keeps its content and launcher inside the page", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("[data-design-chat]")).toHaveAttribute(
    "data-expanded",
    "true",
  );
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(
        async () =>
          (await page.locator("#landing-assistant").boundingBox())!.width,
      )
      .toBeLessThan(viewport.width);
    await withinViewport(page);
    await expect(
      page.getByRole("button", { name: "Minimize assistant demo" }),
    ).toBeInViewport();
  }
});

test("the workspace assistant keeps usable controls in a narrow panel", async ({
  page,
}, info) => {
  const dispose = await installAssistant(page);
  try {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto("/workspace");
    await connectAssistant(page);
    const panel = page.locator(".assistant-drawer");
    const prompt = page.getByRole("textbox", { name: "Process prompt" });
    await prompt.fill("read the project");
    const send = page.getByRole("button", {
      name: "Send message",
      exact: true,
    });
    await expect(send).toBeInViewport();
    await send.click();
    await expect(page.getByRole("log")).toContainText("equipment");
    await expect(panel).toHaveCSS(
      "font-family",
      '"Geist Variable", sans-serif',
    );
    const size = await panel.boundingBox();
    expect(size!.x + size!.width).toBeLessThanOrEqual(600);
    expect(
      await panel.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath("workspace-assistant.png") });
  } finally {
    await dispose();
  }
});

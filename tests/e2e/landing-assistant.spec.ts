// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, test } from "./test";
import { connectAssistant, installAssistant } from "./assistant-fixture";

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 980, height: 600 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`fixed assistant preview fits ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    const chat = page.locator("#landing-assistant");
    await expect(page.locator("[data-design-chat]")).toHaveAttribute(
      "data-expanded",
      "true",
    );
    await expect(page.locator("[data-demo-cursor]")).toHaveCount(0);
    await expect(chat.locator("button, textarea, input")).toHaveCount(0);
    await expect(chat.locator("[data-demo-result]")).toBeInViewport();
    const bounds = (await chat.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    const header = (await page
      .locator("[data-landing-stage] > header")
      .boundingBox())!;
    const footer = (await page
      .locator("[data-landing-stage] > footer")
      .boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(header.y + header.height);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(footer.y);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    // No clipping inside the decorative panel, including a short phone viewport.
    expect(
      await chat.evaluate((element) => {
        const result = element
          .querySelector('[class*="result"]')!
          .getBoundingClientRect();
        const composer = element
          .querySelector('[class*="composerArea"]')!
          .getBoundingClientRect();
        const conversation = element
          .querySelector('[class*="conversation"]')!
          .getBoundingClientRect();
        return (
          result.bottom <= composer.top && result.bottom <= conversation.bottom
        );
      }),
    ).toBe(true);
    await expect(
      page.getByRole("link", { name: "Open workspace", exact: true }),
    ).toHaveAttribute("href", "/workspace?home=1");
    await page.screenshot({ path: info.outputPath("assistant.png") });
    expect(errors).toEqual([]);
  });
}

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
      '"Figtree Variable", sans-serif',
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

// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, test } from "./test";
import { connectAssistant, installAssistant } from "./assistant-fixture";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`authoring uses the real assistant UI at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const requests: string[] = [];
    page.on("request", (request) => {
      if (/43118|api\.muse/.test(request.url())) requests.push(request.url());
    });
    await page.goto("/?render=live");
    const chat = page.locator("#landing-assistant");
    await expect(chat).toBeVisible();
    await expect(chat.locator("textarea")).toHaveCount(1);
    await expect(chat.locator('[aria-label="Start dictation"]')).toHaveCount(1);
    await expect(chat.locator('[class*="proposal"] h3')).toHaveText(
      "Changes applied",
    );
    await expect(chat).toHaveAttribute("inert", "");
    expect(
      await chat
        .locator('[class*="drawer"]')
        .evaluate((el) => getComputedStyle(el).clipPath),
    ).toMatch(/^inset\(0px(?: 0px){0,3} round 20px\)$/);
    const bounds = (await chat.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(requests).toEqual([]);
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

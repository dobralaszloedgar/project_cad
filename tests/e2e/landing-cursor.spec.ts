// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, test } from "./test";

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
]) {
  test(`the demo uses a plain desktop arrow at ${viewport.width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const cursor = page.locator("[data-demo-cursor]");
    await expect(cursor).toBeVisible();
    await expect(cursor.locator("svg")).toHaveCSS("filter", "none");
    await expect(page.locator("[data-landing-page]")).toHaveCSS(
      "cursor",
      "auto",
    );
    await expect(page.locator("canvas")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("plain-pointer.png") });
    await expect(page.locator("[data-design-chat]")).toHaveAttribute(
      "data-expanded",
      "true",
      { timeout: 10000 },
    );
    await expect(cursor).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator("#landing-assistant")).toHaveCSS("opacity", "1");
  });
}

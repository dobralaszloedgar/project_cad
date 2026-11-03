// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, test } from "./test";

test.use({ reducedMotion: "reduce" });
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`landing media and chapter navigation fit ${viewport.width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(viewport);
    await page.goto("/");
    const video = page.locator("[data-full-story-media] video");
    await expect
      .poll(() => video.evaluate((v) => (v as HTMLVideoElement).readyState))
      .toBeGreaterThanOrEqual(2);
    await expect(
      page.locator("canvas, [data-live-cad], [data-design-chat]"),
    ).toHaveCount(0);
    await expect(video).toHaveAttribute(
      "src",
      viewport.width < 600 ? /portrait\.mp4/ : /desktop\.mp4/,
    );
    for (const [name, index] of [
      ["02 Build", "1"],
      ["03 Explore", "2"],
      ["01 Design", "0"],
    ]) {
      await page
        .getByRole("navigation", { name: "Story chapters" })
        .getByRole("button", { name })
        .click();
      await expect(page.locator("[data-landing-page]")).toHaveAttribute(
        "data-chapter",
        index,
      );
    }
    await expect(
      page.getByRole("link", { name: "Open workspace", exact: true }),
    ).toHaveAttribute("href", "/workspace?home=1");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("rapid reversals retain one player and settle on the requested chapter", async ({
  page,
}) => {
  await page.goto("/");
  const video = page.locator("[data-full-story-media] video");
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(2);
  const original = await video.elementHandle();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const root = document.querySelector<HTMLElement>(
          "[data-landing-page]",
        )!;
        let count = 0;
        const tick = () => {
          scrollTo(
            0,
            (root.offsetHeight - innerHeight) * (count % 2 ? 0.9 : 0.3),
          );
          if (++count < 40) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      }),
  );
  await page
    .getByRole("navigation", { name: "Story chapters" })
    .getByRole("button", { name: "03 Explore" })
    .click();
  await expect(page.locator("[data-landing-page]")).toHaveAttribute(
    "data-chapter",
    "2",
  );
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(24);
  expect(
    await original!.evaluate((v) => v === document.querySelector("video")),
  ).toBe(true);
  await expect(page.locator("video")).toHaveCount(1);
});

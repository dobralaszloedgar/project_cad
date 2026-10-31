import { expect, test } from "./test";
import { STORY_END } from "../../src/components/landing/landing-playback";

test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
test.setTimeout(90000);

for (const preference of ["auto", "webgl"] as const) {
  test(`the drawing-to-3D transition renders cleanly with ${preference} graphics`, async ({
    page,
  }, info) => {
    const errors = new Set<string>();
    page.on("pageerror", (error) => errors.add(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" ||
        message.text().startsWith("3D renderer error")
      )
        errors.add(message.text());
    });
    await page.addInitScript((value) => {
      localStorage.setItem("project-cad.graphics-backend", value);
    }, preference);
    await page.goto("/");
    const canvas = page.locator("[data-shared-scene] canvas");
    await expect(canvas).toHaveAttribute("data-ready", "true", {
      timeout: 30000,
    });
    await expect(canvas).toHaveAttribute(
      "data-graphics-backend",
      preference === "webgl" ? "webgl" : /^(webgpu|webgl)$/,
    );
    await info.attach("graphics-backend", {
      body: JSON.stringify(
        await canvas.evaluate((element) => ({ ...element.dataset })),
      ),
      contentType: "application/json",
    });

    // Sample both ends of the line handoff, the solid plant, and reversal.
    for (const [index, progress] of [
      0.53, 0.59, 0.68, 0.82, 0.95, 0.68,
    ].entries()) {
      await page.evaluate(
        ({ progress, end }) => {
          const root = document.querySelector<HTMLElement>(
            "[data-landing-page]",
          )!;
          window.scrollTo(
            0,
            ((root.offsetHeight - innerHeight) * progress) / end,
          );
        },
        { progress, end: STORY_END },
      );
      await expect
        .poll(async () =>
          Number(await canvas.getAttribute("data-story-progress")),
        )
        .toBeCloseTo(progress, 3);
      await page.screenshot({
        path: info.outputPath(`transition-${index}.png`),
      });
      await expect(canvas).toBeVisible();
      await expect(page.locator("[data-shared-scene] canvas")).toHaveCount(1);
    }
    expect([...errors]).toEqual([]);
  });
}

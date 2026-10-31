import { test, expect, type Page } from "@playwright/test";

async function start(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
}

async function expectFullscreenCanvas(page: Page) {
  await expect(
    page.getByRole("button", { name: "Exit full screen", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page.locator(".canvas-panel").evaluate((canvas) => {
        const bounds = canvas.getBoundingClientRect();
        return (
          bounds.x === 0 &&
          bounds.y === 0 &&
          bounds.width === window.innerWidth &&
          bounds.height === window.innerHeight
        );
      }),
    )
    .toBe(true);
}

async function expectNormalCanvas(page: Page) {
  await expect(
    page.getByRole("button", { name: "Maximize canvas", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(async () => (await page.locator(".canvas-panel").boundingBox())?.y)
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
}

test("fullscreen button and shortcut enter, exit and follow browser exits", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Maximize canvas" }).click();
  await expectFullscreenCanvas(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.fullscreenElement ===
          document.querySelector(".canvas-panel"),
      ),
    )
    .toBe(true);
  await page.screenshot({ path: "test-results/fullscreen-native.png" });
  // The browser also exits independently of our button (Esc/browser controls).
  await page.evaluate(() => document.exitFullscreen());
  await expectNormalCanvas(page);
  await page.keyboard.press("F11");
  await expectFullscreenCanvas(page);
  await page.getByRole("button", { name: "Exit full screen" }).click();
  await expectNormalCanvas(page);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
});

for (const failure of ["unsupported", "rejected"] as const) {
  test(`fullscreen fills the window when the native API is ${failure}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((failure) => {
      Object.defineProperty(Element.prototype, "webkitRequestFullscreen", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(Element.prototype, "requestFullscreen", {
        configurable: true,
        value:
          failure === "unsupported"
            ? undefined
            : () => Promise.reject(new TypeError("Permissions check failed")),
      });
    }, failure);
    await start(page);
    await page.getByRole("button", { name: "Maximize canvas" }).click();
    await expectFullscreenCanvas(page);
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    await page.screenshot({ path: `test-results/fullscreen-${failure}.png` });
    await page.keyboard.press("Escape");
    await expectNormalCanvas(page);
    await page.keyboard.press("F11");
    await expectFullscreenCanvas(page);
    await page.getByRole("button", { name: "Exit full screen" }).click();
    await expectNormalCanvas(page);
    expect(errors).toEqual([]);
  });
}

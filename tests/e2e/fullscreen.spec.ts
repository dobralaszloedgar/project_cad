import { test, expect, type Page } from "./test";

async function start(page: Page) {
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
}

async function allowKeyboardLock(page: Page) {
  const session = await page.context().newCDPSession(page);
  const { targetInfo } = await session.send("Target.getTargetInfo");
  await session.send("Browser.setPermission", {
    permission: { name: "keyboard-lock" },
    setting: "granted",
    browserContextId: targetInfo.browserContextId,
  });
  await session.detach();
}

async function expectFullscreenCanvas(page: Page) {
  await expect(
    page.getByRole("button", { name: "Exit full screen", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Exit full screen", exact: true }),
  ).toHaveAttribute("title", "Exit full screen (hold Esc for 2 seconds)");
  await expect
    .poll(() =>
      page.locator("main.workspace").evaluate((workspace) => {
        const bounds = workspace.getBoundingClientRect();
        const header = workspace
          .querySelector(".app-header")!
          .getBoundingClientRect();
        const canvas = workspace
          .querySelector(".canvas-panel")!
          .getBoundingClientRect();
        return (
          bounds.x === 0 &&
          bounds.y === 0 &&
          bounds.width === window.innerWidth &&
          bounds.height === window.innerHeight &&
          header.y === 0 &&
          header.height > 0 &&
          canvas.y >= header.bottom &&
          canvas.bottom === bounds.bottom
        );
      }),
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Project CAD home", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run simulation", exact: true }),
  ).toBeEnabled();
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

async function useHeaderDialog(page: Page) {
  await page.getByRole("button", { name: "Project thermodynamics" }).click();
  await expect(
    page.getByRole("dialog", { name: "Thermodynamics", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close Thermodynamics" }).click();
  await expectFullscreenCanvas(page);
}

test("fullscreen includes the workspace header and follows button, shortcut and browser exits", async ({
  page,
}) => {
  await allowKeyboardLock(page);
  await start(page);
  await page.getByRole("button", { name: "Maximize canvas" }).click();
  await expectFullscreenCanvas(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.fullscreenElement ===
          document.querySelector("main.workspace"),
      ),
    )
    .toBe(true);
  await useHeaderDialog(page);
  await page.keyboard.press("Escape");
  await expectFullscreenCanvas(page);
  await page.getByRole("button", { name: "Workspace help" }).click();
  const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(help).toBeVisible();
  await expect(
    help.getByText("Exit full screen (hold for 2 seconds)", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await expectFullscreenCanvas(page);
  await page.screenshot({ path: "test-results/fullscreen-native.png" });
  // The browser also exits independently of our button (Esc/browser controls).
  await page.evaluate(() => document.exitFullscreen());
  await expectNormalCanvas(page);
  await page.keyboard.press("F11");
  await expectFullscreenCanvas(page);
  await page.getByRole("button", { name: "Exit full screen" }).click();
  await expectNormalCanvas(page);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  await page.getByRole("button", { name: "Maximize canvas" }).click();
  await expectFullscreenCanvas(page);
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Project library" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.fullscreenElement ===
          document.querySelector("main.workspace"),
      ),
    )
    .toBe(true);
  await page.keyboard.press("F11");
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  await page
    .getByRole("button", { name: "Back to canvas", exact: true })
    .click();
  await expectNormalCanvas(page);
});

for (const failure of [
  "unsupported",
  "rejected",
  "keyboard-unsupported",
  "keyboard-rejected",
] as const) {
  test(`fullscreen requires holding Esc when the native API is ${failure}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((failure) => {
      if (failure.startsWith("keyboard-")) {
        Object.defineProperty(navigator, "keyboard", {
          configurable: true,
          value:
            failure === "keyboard-unsupported"
              ? undefined
              : {
                  lock: () =>
                    Promise.reject(new DOMException("Permission denied")),
                  unlock: () => {},
                },
        });
        return;
      }
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
    await expect(page.locator("main.workspace")).toHaveClass(
      /workspace-fullscreen/,
    );
    await expectFullscreenCanvas(page);
    await useHeaderDialog(page);
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    await page.screenshot({ path: `test-results/fullscreen-${failure}.png` });
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.keyboard.press("Escape");
    await page.clock.runFor(2100);
    await expectFullscreenCanvas(page);
    await page.keyboard.down("Escape");
    await page.clock.runFor(1500);
    await expectFullscreenCanvas(page);
    // Auto-repeat must not restart the hold timer.
    await page.keyboard.down("Escape");
    await page.clock.runFor(500);
    await expectNormalCanvas(page);
    await page.keyboard.up("Escape");
    await page.keyboard.press("F11");
    await expectFullscreenCanvas(page);
    await page.getByRole("button", { name: "Exit full screen" }).click();
    await expectNormalCanvas(page);
    expect(errors).toEqual([]);
  });
}

test("releasing Esc, losing focus and exiting cancel pending fullscreen holds", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "keyboard", { value: undefined });
  });
  await start(page);
  await page.getByRole("button", { name: "Maximize canvas" }).click();
  await expectFullscreenCanvas(page);
  await page.clock.install();
  await page.clock.pauseAt(new Date());

  await page.getByRole("button", { name: "Workspace help" }).click();
  const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(help).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await page.clock.runFor(2100);
  await expectFullscreenCanvas(page);

  await page.keyboard.down("Escape");
  await page.clock.runFor(1500);
  await page.keyboard.up("Escape");
  await page.clock.runFor(1000);
  await expectFullscreenCanvas(page);

  await page.keyboard.down("Escape");
  await page.clock.runFor(1500);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.clock.runFor(1000);
  await expectFullscreenCanvas(page);
  await page.keyboard.up("Escape");

  await page.keyboard.down("Escape");
  await page.clock.runFor(1500);
  await page.getByRole("button", { name: "Exit full screen" }).click();
  await expectNormalCanvas(page);
  await page.getByRole("button", { name: "Maximize canvas" }).click();
  await page.keyboard.up("Escape");
  await page.clock.runFor(2100);
  await expectFullscreenCanvas(page);

  await page.keyboard.down("Escape");
  await page.clock.runFor(2000);
  await expectNormalCanvas(page);
  await page.keyboard.up("Escape");
});

test("holding Esc exits native fullscreen", async ({ page }) => {
  await allowKeyboardLock(page);
  await start(page);
  await page.getByRole("button", { name: "Maximize canvas" }).click();
  await expectFullscreenCanvas(page);
  await page.keyboard.down("Escape");
  await expectNormalCanvas(page);
  await page.keyboard.up("Escape");
});

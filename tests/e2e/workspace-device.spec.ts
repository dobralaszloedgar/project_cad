import { devices } from "@playwright/test";
import { expect, test } from "./test";

const message = "Please use a PC to open the workspace.";

for (const device of ["iPhone 13", "Pixel 7"]) {
  test.describe(device, () => {
    const { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch } =
      devices[device];
    test.use({
      userAgent,
      viewport,
      deviceScaleFactor,
      isMobile,
      hasTouch,
      reducedMotion: "reduce",
    });

    test("workspace links keep the phone on the current landing page", async ({
      page,
    }, info) => {
      await page.goto("/");
      await expect(page.locator("[data-landing-page]")).toBeVisible();
      const workspaceRequests: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/workspace")
          workspaceRequests.push(request.url());
      });

      await page
        .getByRole("link", { name: "Open workspace", exact: true })
        .click();
      await expect(page).toHaveURL(/\/$/);
      await expect(
        page.getByRole("status").filter({ hasText: message }),
      ).toBeVisible();
      await expect(page.locator(".workspace")).toHaveCount(0);
      await page.screenshot({
        path: info.outputPath("phone-workspace-notice.png"),
      });

      await page
        .getByRole("button", { name: "Dismiss workspace message" })
        .click();
      await expect(page.getByText(message, { exact: true })).toHaveCount(0);
      const skip = page.getByRole("link", {
        name: "Skip the story and open workspace",
      });
      await skip.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByText(message, { exact: true })).toBeVisible();
      await expect(page).toHaveURL(/\/$/);

      // Landscape/wider windows must not turn a phone into a supported desktop.
      await page.setViewportSize({ width: 1024, height: 768 });
      await page
        .getByRole("button", { name: "Dismiss workspace message" })
        .click();
      await page
        .getByRole("link", { name: "Open workspace", exact: true })
        .click();
      await expect(page.getByText(message, { exact: true })).toBeVisible();
      await expect(page.locator(".workspace")).toHaveCount(0);
      expect(workspaceRequests).toEqual([]);
    });

    test("direct workspace, onboarding and old example links stay on the landing page", async ({
      page,
    }) => {
      for (const path of [
        "/workspace",
        "/workspace?example=heating&view=3D",
        "/onboarding",
        "/?example=heating&view=3D&play=0&arrange=1",
      ]) {
        await page.goto(path);
        await expect(page.locator("[data-landing-page]")).toBeVisible();
        expect(new URL(page.url()).pathname).toBe("/");
        await expect(page.getByText(message, { exact: true })).toBeVisible();
        await expect(page.locator(".workspace")).toHaveCount(0);
      }
    });
  });
}

test.describe("desktop with a touchscreen", () => {
  test.use({ hasTouch: true, reducedMotion: "reduce" });

  test("resizing, reloading and small windows still allow the workspace", async ({
    page,
  }) => {
    await page.goto("/");
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("link", { name: "Open workspace", exact: true })
      .click();
    await expect(page).toHaveURL(/\/workspace\?home=1$/);
    await expect(page.locator(".workspace")).toBeVisible();
    await expect(page.getByText(message, { exact: true })).toHaveCount(0);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator(".workspace")).toBeVisible();
    await page.setViewportSize({ width: 320, height: 700 });
    await page.reload();
    await expect(page.locator(".workspace")).toBeVisible();
    await expect(page).toHaveURL(/\/workspace\?home=1$/);

    await page.goto("/?example=heating&view=2D&play=0&arrange=1");
    await expect(page).toHaveURL(
      /\/workspace\?example=heating&view=2D&play=0&arrange=1$/,
    );
    await expect(
      page.getByRole("button", { name: "Run simulation" }),
    ).toBeEnabled();
  });
});

test("mobile client hints protect direct workspace entry without a phone user agent", async ({
  request,
}) => {
  // Send the hint through HTTP: Chromium regenerates its own client hints on
  // redirects, so extraHTTPHeaders alone does not emulate a mobile browser.
  const response = await request.get("/workspace", {
    headers: { "sec-ch-ua-mobile": "?1" },
  });
  expect(response.url()).toMatch(/\/\?workspace=desktop-required$/);
  const html = await response.text();
  expect(html).toContain("data-landing-page");
  expect(html).toContain(message);
  expect(html).not.toContain('class="workspace');
});

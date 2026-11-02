// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, test } from "./test";
import { maximumDpr } from "../../src/components/graphics/performance";

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  reducedMotion: "reduce",
});
test.setTimeout(90000);

test("prepares the complete reveal and retains the pixel budget across controls and resize", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("project-cad.graphics-backend", "webgl");
    const createProgram = WebGL2RenderingContext.prototype.createProgram;
    const probe = window as typeof window & { landingPrograms: number };
    probe.landingPrograms = 0;
    WebGL2RenderingContext.prototype.createProgram = function () {
      probe.landingPrograms++;
      return createProgram.call(this);
    };
  });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Story chapters" });
  await nav.getByRole("button", { name: "02 Build" }).click();
  const canvas = page.locator("[data-shared-scene] canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", {
    timeout: 45000,
  });
  const programs = () =>
    page.evaluate(
      () =>
        (window as typeof window & { landingPrograms: number }).landingPrograms,
    );
  const prepared = await programs();
  expect(prepared).toBeGreaterThan(2);
  const withinBudget = async () => {
    const size = await canvas.evaluate((element) => ({
      pixels:
        (element as HTMLCanvasElement).width *
        (element as HTMLCanvasElement).height,
      width: element.clientWidth,
      height: element.clientHeight,
      dpr: devicePixelRatio,
      software: element.dataset.graphicsSoftware === "true",
    }));
    const cap = Math.min(
      size.software ? 1 : Infinity,
      maximumDpr(size.width, size.height, size.dpr),
    );
    expect(size.pixels).toBeLessThanOrEqual(
      Math.ceil(size.width * cap) * Math.ceil(size.height * cap),
    );
  };
  await withinBudget();
  await nav.getByRole("button", { name: "03 Explore" }).click();
  await expect(canvas).toHaveAttribute("data-process-phase", "plant");
  expect(await programs()).toBe(prepared);
  await withinBudget();
  // Chapter navigation replaces the old shell toggle in the updated landing.
  await nav.getByRole("button", { name: "02 Build" }).click();
  await expect(canvas).toHaveAttribute("data-process-phase", "blueprint");
  await withinBudget();
  await nav.getByRole("button", { name: "03 Explore" }).click();
  await expect(canvas).toHaveAttribute("data-process-phase", "plant");
  await withinBudget();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect
    .poll(() => canvas.evaluate((element) => element.clientWidth))
    .toBe(1280);
  await withinBudget();
  expect(errors).toEqual([]);
});

test("a stalled graphics driver reaches the existing fallback and leaves navigation usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: {
        requestAdapter: () => new Promise(() => {}),
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Story chapters" })
    .getByRole("button", { name: "02 Build" })
    .click();
  await expect(page.locator("[data-landing-page]")).toHaveAttribute(
    "data-launch-state",
    "unavailable",
    { timeout: 20000 },
  );
  await expect(
    page.getByText("Explore the equipment collection"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace\?home=1$/);
});

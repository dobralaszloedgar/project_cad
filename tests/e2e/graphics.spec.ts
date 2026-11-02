import { expect, test, type Page } from "./test";

// Opt-in hardware run on Windows: GRAPHICS_CHANNEL=chrome. The normal suite
// also exercises the real software WebGL fallback in Playwright's headless shell.
test.use({
  launchOptions:
    process.env.GRAPHICS_CHANNEL === "chrome"
      ? {
          channel: "chrome",
          args: [
            "--use-angle=d3d11",
            ...(process.env.GRAPHICS_NVIDIA
              ? ["--force-high-performance-gpu"]
              : []),
          ],
        }
      : {},
});
test.setTimeout(120000);

async function ready(page: Page) {
  const canvas = page.getByLabel("Interactive 3D equipment model");
  await expect(canvas).toBeVisible({ timeout: 60000 });
  await expect(canvas).toHaveAttribute(
    "data-graphics-backend",
    /^(webgpu|webgl)$/,
  );
  await expect(page.locator(".equipment-world-label")).toHaveCount(25);
  return canvas;
}

test("automatic rendering, fluid motion, compatibility override and device recovery", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" ||
      message.text().startsWith("3D renderer error")
    )
      errors.push(message.text());
  });
  await page.goto("/sandbox/equipment");
  const canvas = await ready(page);
  if (process.env.GRAPHICS_CHANNEL === "chrome") {
    await expect(canvas).toHaveAttribute("data-graphics-backend", "webgpu");
    await expect(canvas).toHaveAttribute("data-graphics-software", "false");
    if (process.env.GRAPHICS_NVIDIA)
      await expect(canvas).toHaveAttribute("data-graphics-gpu", /nvidia/i);
    await expect(page.getByText(/Limited graphics acceleration/)).toHaveCount(
      0,
    );
  }
  await info.attach("active-gpu", {
    body: JSON.stringify(
      await canvas.evaluate((element) => ({ ...element.dataset })),
    ),
    contentType: "application/json",
  });
  await expect(
    page.getByRole("button", { name: "Pause operation", exact: true }),
  ).toBeVisible();
  await expect(canvas).toHaveAttribute("data-render-scale", /\d/);
  await page.waitForTimeout(1200);
  await page
    .getByRole("button", { name: "Pause operation", exact: true })
    .click();
  await page.screenshot({ path: info.outputPath("plant-graphics.png") });
  await page.getByLabel("Graphics settings").click();
  await expect(page.getByText("Graphics card", { exact: true })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Graphics mode" })
    .selectOption("webgl");
  await ready(page);
  await expect(canvas).toHaveAttribute("data-graphics-backend", "webgl");
  await page.reload();
  await ready(page);
  await expect(canvas).toHaveAttribute("data-graphics-backend", "webgl");
  await canvas.dispatchEvent("graphicsdevicelost");
  await expect(
    page.getByRole("heading", { name: "The 3D connection was interrupted" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reload preview" }).click();
  await ready(page);
  expect(errors).toEqual([]);
});

test("lost native WebGPU recovers with a fresh WebGL canvas", async ({
  page,
}) => {
  test.skip(
    process.env.GRAPHICS_CHANNEL !== "chrome",
    "Requires the opt-in native GPU browser",
  );
  await page.goto("/sandbox/equipment");
  const canvas = await ready(page);
  await expect(canvas).toHaveAttribute("data-graphics-backend", "webgpu");
  const original = await canvas.elementHandle();
  await canvas.dispatchEvent("graphicsdevicelost");
  await expect(
    page.getByRole("heading", { name: "The 3D connection was interrupted" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reload preview" }).click();
  await ready(page);
  await expect(canvas).toHaveAttribute("data-graphics-backend", "webgl");
  expect(await original!.evaluate((element) => element.isConnected)).toBe(
    false,
  );
  await expect(
    page.getByRole("switch", { name: "Transparent shell" }),
  ).toHaveAttribute("aria-checked", "true");
});

for (const failure of ["missing", "null", "rejected", "device"] as const) {
  test(`WebGPU ${failure} falls back to a usable WebGL 2 scene`, async ({
    page,
  }) => {
    await page.addInitScript((mode) => {
      Object.defineProperty(navigator, "gpu", {
        configurable: true,
        value:
          mode === "missing"
            ? undefined
            : {
                requestAdapter: async () => {
                  if (mode === "null") return null;
                  if (mode === "rejected") throw new Error("Adapter blocked");
                  return {
                    features: new Set(),
                    requestDevice: async () => {
                      throw new Error("Device blocked");
                    },
                  };
                },
              },
      });
    }, failure);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/sandbox/equipment");
    const canvas = await ready(page);
    await expect(canvas).toHaveAttribute("data-graphics-backend", "webgl");
    await page.getByRole("switch", { name: "Transparent shell" }).click();
    await expect(
      page.getByRole("switch", { name: "Transparent shell" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(errors).toEqual([]);
  });
}

test("software rendering prompts for acceleration without blocking 3D", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: undefined,
    });
    const getParameter = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function (parameter) {
      // Simulate privacy-safe renderer diagnostics, retaining a real GL context.
      if (parameter === 0x9246) return "ANGLE (Google SwiftShader)";
      return getParameter.call(this, parameter);
    };
  });
  await page.goto("/sandbox/equipment");
  await ready(page);
  await page
    .getByText("Limited graphics acceleration · Enable for smoother 3D")
    .click();
  await expect(
    page.getByText("Your browser reports software or fallback rendering."),
  ).toBeVisible();
  await expect(
    page.getByText(/In Chrome or Edge, open Settings/).first(),
  ).toBeVisible();
});

test("landing acceleration notice stays below mobile navigation", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: undefined,
    });
    const getParameter = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function (parameter) {
      return parameter === 0x9246
        ? "ANGLE (Google SwiftShader)"
        : getParameter.call(this, parameter);
    };
  });
  await page.goto("/landing");
  const notice = page.getByText(
    "Limited graphics acceleration · Enable for smoother 3D",
  );
  await expect(notice).toBeVisible({ timeout: 60000 });
  const nav = await page
    .getByRole("navigation", { name: "Story chapters" })
    .boundingBox();
  const bounds = await notice.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(nav!.y + nav!.height);
  await notice.click();
  await expect(
    page.getByText(/In Chrome or Edge, open Settings/).first(),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("landing-graphics-notice.png"),
  });
});

test("unavailable graphics shows setup instructions and keeps the workspace usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: undefined,
    });
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type,
      ...args
    ) {
      if (type === "webgl" || type === "webgl2" || type === "webgpu")
        return null;
      return getContext.call(this, type, ...args);
    } as typeof getContext;
  });
  await page.goto("/sandbox/equipment");
  await expect(
    page.getByRole("heading", { name: "The 3D preview is unavailable" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByText(/Integrated graphics are supported/),
  ).toBeVisible();
  await expect(
    page.getByText(/In Chrome or Edge, open Settings/),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to workspace" }).click();
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
});

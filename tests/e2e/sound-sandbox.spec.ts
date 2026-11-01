import { expect, test } from "@playwright/test";
import { audioStartCount as starts, observeAudio } from "./sound-fixture";

test("sound is opt-in; each style and cue plays a real audio buffer", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      errors.push(message.text());
  });
  await observeAudio(page);
  await page.goto("/sandbox/sound");
  await expect(page).toHaveTitle("Project CAD – Sound sandbox");
  await expect(
    page.getByRole("heading", { name: "Sound for building." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hear the sequence" }),
  ).toBeDisabled();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  await page.getByRole("button", { name: "Add Mixer", exact: true }).click();
  expect(await page.evaluate(() => window.__soundProbe.contexts)).toBe(0);
  await page.getByRole("button", { name: "Reset canvas", exact: true }).click();
  await page.getByRole("button", { name: "Enable sound", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sound on", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  for (const style of ["Soft tactile", "Clean digital", "Warm wood"]) {
    await page.getByRole("button", { name: new RegExp(style) }).click();
    const before = await starts(page);
    for (const cue of [
      "place component",
      "start a wire",
      "complete connection",
      "remove an item",
    ]) {
      await page
        .getByRole("button", { name: `Preview ${cue}`, exact: true })
        .click();
    }
    expect(await starts(page)).toBe(before + 4);
  }
  const rendered = await page.evaluate(() => window.__soundProbe.starts);
  expect(
    rendered.every(
      (buffer) =>
        buffer.running &&
        buffer.frames > 1000 &&
        buffer.peak > 0.05 &&
        buffer.peak < 0.73,
    ),
  ).toBe(true);
  await page.getByRole("slider", { name: "Volume" }).fill("18");
  await expect(page.locator("output")).toHaveText("18%");
  expect(await page.evaluate(() => window.__soundProbe.volumes.at(-1))).toBe(
    0.18,
  );
  await page.getByRole("button", { name: /Soft tactile/ }).click();
  await page
    .getByRole("button", { name: "Connect next pair", exact: true })
    .click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath("desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});

test("placing, moving, wiring, cancelling, and deleting have discrete feedback", async ({
  page,
}) => {
  await observeAudio(page);
  await page.goto("/sandbox/sound");
  await page.getByRole("button", { name: "Enable sound", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sound on", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Mixer", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Remove selected item", exact: true })
    .click();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);

  // Exercise native palette drag and drop, not just the click fallback.
  const paletteItem = page.getByRole("button", {
    name: "Add Packed-bed reactor",
    exact: true,
  });
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await paletteItem.dispatchEvent("dragstart", { dataTransfer: transfer });
  const canvas = page.getByTestId("sound-canvas");
  const bounds = (await canvas.boundingBox())!;
  await canvas.dispatchEvent("drop", {
    dataTransfer: transfer,
    clientX: bounds.x + bounds.width * 0.65,
    clientY: bounds.y + bounds.height * 0.8,
  });
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page.getByRole("button", { name: "Reset canvas", exact: true }).click();

  const outlet = page.locator('.react-flow__handle[aria-label="F-101 outlet"]');
  const inlet = page.locator('.react-flow__handle[aria-label="H-101 inlet"]');
  await expect(outlet).toBeVisible();
  const beforeWire = await starts(page);
  await outlet.dragTo(inlet);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  expect(await starts(page)).toBe(beforeWire + 2);

  const heater = page.locator('.react-flow__node[data-id="heater"]');
  const center = (await heater.boundingBox())!;
  const beforeMove = await starts(page);
  await page.mouse.move(
    center.x + center.width / 2,
    center.y + center.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    center.x + center.width / 2 + 45,
    center.y + center.height / 2 + 25,
    { steps: 8 },
  );
  expect(await starts(page)).toBe(beforeMove);
  await page.mouse.up();
  expect(await starts(page)).toBe(beforeMove + 1);

  // Cancelling a wire emits pickup only, never a successful connection cue.
  const beforeCancel = await starts(page);
  const source = (await outlet.boundingBox())!;
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(bounds.x + 70, bounds.y + 60, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  expect(await starts(page)).toBe(beforeCancel + 1);

  await heater.click();
  const beforeDelete = await starts(page);
  await page.keyboard.press("Delete");
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);
  expect(await starts(page)).toBe(beforeDelete + 1);
});

test("mute and style changes cancel pending preview sounds", async ({
  page,
}) => {
  await observeAudio(page);
  await page.goto("/sandbox/sound");
  await page.getByRole("button", { name: "Enable sound", exact: true }).click();
  await page
    .getByRole("button", { name: "Hear the sequence", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop sequence", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sound on", exact: true }).click();
  const mutedStarts = await starts(page);
  await page.getByRole("button", { name: "Add Mixer", exact: true }).click();
  await page.waitForTimeout(2400);
  expect(await starts(page)).toBe(mutedStarts);
  await expect(
    page.getByRole("button", { name: "Hear the sequence", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Enable sound", exact: true }).click();
  await page
    .getByRole("button", { name: "Hear the sequence", exact: true })
    .click();
  await page.getByRole("button", { name: /Clean digital/ }).click();
  const switchedStarts = await starts(page);
  await page.waitForTimeout(2400);
  expect(await starts(page)).toBe(switchedStarts);
  await expect(
    page.getByRole("button", { name: "Hear the sequence", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Enable sound", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__soundProbe.contexts)).toBe(0);
});

test("mobile and keyboard users can add and connect without dragging", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sandbox/sound");
  await expect(
    page.getByRole("heading", { name: "Sound for building." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Enable sound", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Sound on", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Warm wood/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /Warm wood/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Add Mixer", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Connect next pair", exact: true })
    .click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath("mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
});

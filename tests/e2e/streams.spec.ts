import { expect, test, type Locator, type Page } from "@playwright/test";

const edgeFor = (page: Page, id: string) =>
  page.locator(`.react-flow__edge[data-id="${id}"]`);
async function openStream(page: Page, id: string) {
  const point = await edgeFor(page, id)
    .locator(".react-flow__edge-path")
    .evaluate((element) => {
      const path = element as SVGPathElement;
      const point = path.getPointAtLength(path.getTotalLength() * 0.2);
      const screen = new DOMPoint(point.x, point.y).matrixTransform(
        path.getScreenCTM()!,
      );
      return { x: screen.x, y: screen.y };
    });
  await page.mouse.dblclick(point.x, point.y);
  await expect(
    page.getByRole("textbox", { name: "Stream name" }),
  ).toBeVisible();
}
const stroke = (edge: Locator) =>
  edge
    .locator(".react-flow__edge-path")
    .evaluate((element) => getComputedStyle(element).stroke);
const anchor = (edge: Locator) =>
  edge.locator(".stream-label-box").evaluate((element) => ({
    x:
      Number(element.getAttribute("x")) +
      Number(element.getAttribute("width")) / 2,
    y:
      Number(element.getAttribute("y")) +
      Number(element.getAttribute("height")) / 2,
  }));

test("stream names, individual palette choices, themes and auto reset persist", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await expect(page.locator(".stream-label text")).toHaveText([
    "Stream 1",
    "Stream 2",
    "Stream 3",
    "Stream 4",
    "Stream 5",
    "Stream 6",
  ]);
  const first = edgeFor(page, "s1");
  const second = edgeFor(page, "s2");
  const automatic = await stroke(first);
  const neighbor = await stroke(second);
  await openStream(page, "s1");
  await expect(
    page.getByRole("button", { name: "Auto stream color" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByRole("group", { name: "Stream color", exact: true })
      .getByRole("button"),
  ).toHaveCount(9);
  await page.getByRole("textbox", { name: "Stream name" }).fill("Fresh feed");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(
    page.getByRole("dialog", { name: "Fresh feed", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Violet stream color", exact: true })
    .click();
  await expect.poll(() => stroke(first)).toBe("rgb(118, 70, 167)");
  expect(await stroke(second)).toBe(neighbor);
  await expect(first.locator(".stream-label text")).toHaveCSS(
    "fill",
    "rgb(118, 70, 167)",
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Color streams by composition" })
    .click();
  await expect.poll(() => stroke(first)).toBe("rgb(118, 70, 167)");
  const neutral = await page.locator("main.workspace").evaluate((workspace) => {
    const sample = document.createElement("span");
    sample.style.color = "var(--stream-stroke)";
    workspace.append(sample);
    const color = getComputedStyle(sample).color;
    sample.remove();
    return color;
  });
  await expect.poll(() => stroke(second)).toBe(neutral);
  await page
    .getByRole("button", { name: "Color streams by composition" })
    .click();
  await expect.poll(() => stroke(second)).toBe(neighbor);
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(first.locator(".stream-label text")).toHaveText("Fresh feed");
  await expect.poll(() => stroke(first)).toBe("rgb(118, 70, 167)");
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect.poll(() => stroke(first)).toBe("rgb(195, 161, 244)");
  await expect(first.locator(".stream-label text")).toHaveCSS(
    "fill",
    "rgb(195, 161, 244)",
  );
  await openStream(page, "s1");
  await expect(
    page.getByRole("button", { name: "Violet stream color", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByRole("button", { name: "Red stream color", exact: true })
      .locator("span"),
  ).toHaveCSS("background-color", "rgb(255, 133, 130)");
  await page.screenshot({ path: "test-results/streams-dark-editor.png" });
  await page.getByRole("button", { name: "Auto stream color" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect.poll(() => stroke(first)).toBe(automatic);
  await page.screenshot({ path: "test-results/streams-light-canvas.png" });
  expect(errors).toEqual([]);
});

test("label anchors stay on their routes through zoom and selection and move with equipment", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  const first = edgeFor(page, "s1");
  await expect(first.locator(".stream-label text")).toHaveText("Stream 1");
  const before = await anchor(first);
  await page.getByRole("button", { name: "Zoom Out", exact: true }).click();
  await expect.poll(() => anchor(first)).toEqual(before);
  await openStream(page, "s1");
  expect(await anchor(first)).toEqual(before);
  await page.keyboard.press("Escape");
  const path = await first.locator(".react-flow__edge-path").getAttribute("d");
  const unit = page.locator('.react-flow__node[data-id="F-101"]');
  const box = await unit.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2,
    box!.y + box!.height / 2 + 81,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(first.locator(".react-flow__edge-path")).not.toHaveAttribute(
    "d",
    path!,
  );
  expect(await anchor(first)).not.toEqual(before);
});

test("manual connections get unique automatic names after a stream is deleted", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await openStream(page, "s2");
  await page.getByRole("button", { name: "Remove stream" }).click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(5);
  const source = page.locator(
    '.react-flow__node[data-id="M-101"] .react-flow__handle.source[data-handleid="out"]',
  );
  const target = page.locator(
    '.react-flow__node[data-id="H-101"] .react-flow__handle.target[data-handleid="in"]',
  );
  await source.dragTo(target);
  await expect(page.locator(".react-flow__edge")).toHaveCount(6);
  const names = await page.locator(".stream-label text").allTextContents();
  expect(new Set(names).size).toBe(6);
  expect(names.at(-1)).toBe("Stream 2");
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.locator(".stream-label text")).toHaveText(names);
});

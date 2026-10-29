import { expect, test, type Locator, type Page } from "@playwright/test";
import { newUnit, type Project } from "../../src/domain/schema";

async function wireToCenter(page: Page, source: Locator, target: Locator) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  expect(from).toBeTruthy();
  expect(to).toBeTruthy();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, {
    steps: 15,
  });
  await page.mouse.up();
}

test("mixer center accepts four stream drops, persists and simulates all feeds", async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[React Flow]")) warnings.push(message.text());
  });
  const project: Project = {
    version: 1,
    name: "Mixer center connections",
    units: [
      ...[0, 1, 2, 3].map((index) =>
        newUnit("Feed", `F-${index + 1}`, 0, index * 170),
      ),
      newUnit("Mixer", "M-center", 330, 250),
      newUnit("Product", "P-out", 660, 250),
    ],
    edges: [
      {
        id: "product",
        source: "M-center",
        target: "P-out",
        sourcePort: "out",
        targetPort: "in",
        color: "teal",
      },
    ],
  };
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await page.getByLabel("Import project file").setInputFiles({
    name: "mixer.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.locator(".project-heading h1")).toHaveText(project.name);
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  const mixer = page.locator('.react-flow__node[data-id="M-center"]');
  for (let index = 1; index <= 4; index++) {
    const source = page.getByLabel(`F-${index} outlet out`, { exact: true });
    if (index === 4) {
      await wireToCenter(
        page,
        source,
        page.getByLabel("P-out inlet in", { exact: true }),
      );
      await expect(page.locator(".react-flow__edge")).toHaveCount(4);
    }
    await wireToCenter(page, source, mixer);
    await expect(page.locator(".react-flow__edge")).toHaveCount(index + 1);
    await expect(source).not.toHaveClass(/\bconnectable\b/);
  }

  const streamPoint = await page
    .getByRole("group", { name: "Edge from F-4 to M-center", exact: true })
    .locator(".react-flow__edge-interaction")
    .evaluate((element) => {
      const path = element as SVGPathElement;
      const point = path
        .getPointAtLength(20)
        .matrixTransform(path.getScreenCTM()!);
      return { x: point.x, y: point.y };
    });
  await page.mouse.click(streamPoint.x, streamPoint.y);
  await page
    .getByRole("button", { name: "Remove stream", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".react-flow__edge")).toHaveCount(4);
  // Occupied mixer inlet handles remain usable as well as the center drop area.
  const fourthSource = page.getByLabel("F-4 outlet out", { exact: true });
  await expect(fourthSource).toHaveClass(/\bconnectable\b/);
  await wireToCenter(
    page,
    fourthSource,
    page.getByLabel("M-center inlet in2", { exact: true }),
  );
  await expect(page.locator(".react-flow__edge")).toHaveCount(5);

  // The invisible drop area must not block normal equipment dragging.
  const before = await mixer.boundingBox();
  await page.mouse.move(
    before!.x + before!.width / 2,
    before!.y + before!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    before!.x + before!.width / 2 + 60,
    before!.y + before!.height / 2 + 30,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await mixer.boundingBox())!.x)
    .toBeGreaterThan(before!.x + 25);
  await expect(page.locator(".react-flow__edge")).toHaveCount(5);
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.locator(".react-flow__edge")).toHaveCount(5);
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
  await expect(
    page
      .locator(".stream-table tbody tr")
      .filter({ hasText: "product" })
      .locator("td")
      .nth(1),
  ).toHaveText("40");
  await page.screenshot({
    path: "test-results/mixer-center.png",
    fullPage: true,
  });
  expect(warnings).toEqual([]);
});

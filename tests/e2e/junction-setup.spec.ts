// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, test } from "./test";
import { loadProject } from "./project-fixture";
import { newUnit } from "../../src/domain/schema";

test("setup adds two through four branches, persists them and updates 3D", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.text().includes("[React Flow]")) errors.push(message.text());
  });
  await page.goto("/workspace");
  await loadProject(page, {
    version: 1,
    name: "Dynamic junction setup",
    units: [
      newUnit("Mixer", "M", 100, 160),
      newUnit("Splitter", "S", 420, 160),
    ],
    edges: [],
  });
  for (const count of [2, 3, 4]) {
    for (const [id, direction] of [
      ["M", "in"],
      ["S", "out"],
    ] as const) {
      const node = page.locator(`.react-flow__node[data-id="${id}"]`);
      const handles = node.locator(
        `.material-handle[data-handleid^="${direction}"]`,
      );
      if (count > 2) {
        await node.dblclick();
        const dialog = page.getByRole("dialog");
        const add = dialog.getByRole("button", {
          name: direction === "in" ? /^Add inlet/ : /^Add outlet/,
        });
        await expect(add).toBeEnabled();
        await add.click();
        await expect(
          dialog.locator(`[data-setup-port^="${direction}"]`),
        ).toHaveCount(count);
        if (id === "S")
          await expect(dialog.getByLabel(/^Outlet \d fraction$/)).toHaveCount(
            count,
          );
        if (count === 4) await expect(add).toBeDisabled();
        if (count === 3)
          await page.screenshot({
            path: `test-results/junction-${id}-setup.png`,
            fullPage: true,
          });
        await dialog
          .getByRole("button", { name: "Apply conditions", exact: true })
          .click();
        await page.keyboard.press("Escape");
      }
      await expect(handles).toHaveCount(count);
    }
    await page.screenshot({
      path: `test-results/junction-${count}-2d.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "3D schematic", exact: true })
      .click();
    await expect(page.getByLabel("Interactive 3D equipment model")).toBeVisible(
      { timeout: 45000 },
    );
    await expect(page.locator(".plant-label")).toHaveCount(2, {
      timeout: 30000,
    });
    await expect(
      page.getByText("The 3D layout could not be arranged.", { exact: false }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `test-results/junction-${count}-3d.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "2D flowsheet", exact: true })
      .click();
  }
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  for (const [id, direction] of [
    ["M", "in"],
    ["S", "out"],
  ] as const)
    await expect(
      page.locator(
        `.react-flow__node[data-id="${id}"] .material-handle[data-handleid^="${direction}"]`,
      ),
    ).toHaveCount(4);
  expect(errors).toEqual([]);
});

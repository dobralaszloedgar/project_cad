// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, test } from "./test";
import { catalogFixture } from "./catalog-fixture";
import { installFolderPicker } from "./folder-fixture";
import { startNewProject, submitNewProject } from "./project-create-fixture";

for (const storage of ["browser", "folder"] as const) {
  test(`new ${storage} projects start without synthetic components and save real selections`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installFolderPicker(page, storage === "browser");
    await catalogFixture(page);
    await page.goto("/workspace?home=1");
    await startNewProject(page, "Empty components");
    await submitNewProject(page);
    await expect(page.locator(".project-heading h1")).toHaveText(
      "Empty components",
    );
    await page.reload();

    const open = page.getByRole("button", {
      name: "Project components",
      exact: true,
    });
    await open.click();
    const picker = page.getByRole("dialog", {
      name: "Project components",
      exact: true,
    });
    await expect(
      picker.getByRole("region", { name: "Selected components" }),
    ).toContainText("0 / 40");
    await expect(picker.getByText(/Synthetic/)).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Drawing and inspecting equipment must work before a mixture exists.
    for (const kind of [
      "Feed",
      "Packed-bed reactor",
      "Splitter",
      "Distillation column",
    ]) {
      const equipment = page.getByRole("button", {
        name: "Equipment",
        exact: true,
      });
      if ((await equipment.getAttribute("aria-expanded")) !== "true")
        await equipment.click();
      const add = page.getByTitle(`Add ${kind}`, { exact: true });
      await add.click();
      await page
        .getByRole("button", { name: "Close Equipment", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Properties", exact: true })
        .click();
      await expect(
        page.getByRole("tab", { name: "Setup", exact: true }),
      ).toBeVisible();
      await page.getByRole("tab", { name: "Results", exact: true }).click();
      await expect(
        page.getByText("Run the simulation to calculate this equipment."),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    }

    await open.click();
    for (const chemical of ["water", "ethanol"]) {
      await picker.getByRole("searchbox").fill(chemical);
      await picker
        .getByRole("button", {
          name: `Add ${chemical} to project`,
          exact: true,
        })
        .click();
    }
    await expect(picker.locator(".project-components")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await expect(
      picker.getByRole("region", { name: "Selected components" }),
    ).toContainText("2 / 40");
    await expect(page.locator(".save-status")).toContainText(/Saved/i);
    await page.reload();
    await open.click();
    await expect(
      picker.getByRole("button", {
        name: "Remove water from project",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      picker.getByRole("button", {
        name: "Remove ethanol from project",
        exact: true,
      }),
    ).toBeVisible();
    await expect(picker.getByText(/Synthetic/)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

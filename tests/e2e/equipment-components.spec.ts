import { expect, test } from "./test";
import { catalogFixture } from "./catalog-fixture";

for (const { theme, width, height, background } of [
  {
    theme: "light",
    width: 1536,
    height: 1024,
    background: "rgb(255, 255, 255)",
  },
  { theme: "nord", width: 390, height: 844, background: "rgb(59, 66, 82)" },
]) {
  test(`feed components use one themed dialog and preserve drafts (${theme})`, async ({
    page,
  }, info) => {
    await catalogFixture(page);
    await page.setViewportSize({ width, height });
    await page.addInitScript((palette) => {
      localStorage.setItem("project-cad.theme", palette);
    }, theme);
    await page.goto("/workspace?example=solution");
    await page.locator('.react-flow__node[data-id="F-201"]').dblclick();
    const editor = page.getByRole("dialog", { name: /Benzene–toluene feed/ });
    const add = editor.getByRole("button", {
      name: "Add components",
      exact: true,
    });
    const flow = editor.getByLabel("Molar flow (kmol/h)", { exact: true });
    const benzene = editor.getByLabel(/^Mole fraction benzene$/i);
    const toluene = editor.getByLabel(/^Mole fraction toluene$/i);
    await flow.fill("42");
    await benzene.fill("0.4");
    await toluene.fill("0.6");
    await add.scrollIntoViewIfNeeded();
    const lastRow = (await editor
      .locator(".equipment-composition-row")
      .last()
      .boundingBox())!;
    expect((await add.boundingBox())!.y).toBeGreaterThanOrEqual(
      lastRow.y + lastRow.height,
    );

    const components = page.getByRole("dialog", {
      name: "Project components",
      exact: true,
    });
    for (const action of ["Escape", "Cancel", "Close"]) {
      await add.click();
      await expect(page.locator("dialog[open]")).toHaveCount(1);
      await expect(editor).toHaveCount(0);
      await expect(components).toHaveCSS("background-color", background);
      await expect(
        components.getByRole("searchbox", { name: "Search chemical database" }),
      ).toBeFocused();
      await expect(
        page.getByText("Feed conditions", { exact: true }),
      ).toHaveCount(0);
      if (action === "Escape") await page.keyboard.press("Escape");
      else
        await components
          .getByRole("button", {
            name: action === "Close" ? "Close Project components" : action,
            exact: true,
          })
          .click();
      await expect(editor).toBeVisible();
      await expect(components).toHaveCount(0);
      await expect(flow).toHaveValue("42");
      await expect(benzene).toHaveValue("0.4");
      await expect(toluene).toHaveValue("0.6");
      await expect(add).toBeFocused();
    }

    await add.click();
    await components
      .getByRole("searchbox", { name: "Search chemical database" })
      .fill("acetone");
    await expect(components.locator(".component-slot-label")).toHaveCount(0);
    expect(
      await components.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath("project-components.png") });
    if (theme === "light")
      await components.getByRole("cell", { name: "acetone C3H6O" }).dblclick();
    else
      await components
        .getByRole("button", { name: "Add acetone to project", exact: true })
        .click();
    await expect(components).toHaveCount(0);
    await expect(editor).toBeVisible();
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    await expect(flow).toHaveValue("42");
    await expect(benzene).toHaveValue("0.4");
    await expect(toluene).toHaveValue("0.6");
    await expect(editor.getByLabel(/^Mole fraction acetone$/i)).toHaveValue(
      "0",
    );
    await expect(editor.locator(".equipment-composition-row")).toHaveCount(3);
    await expect(add).toBeFocused();
    await page.screenshot({ path: info.outputPath("feed-components.png") });
    await editor
      .getByRole("button", { name: "Apply conditions", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await page.locator('.react-flow__node[data-id="F-201"]').dblclick();
    await expect(flow).toHaveValue("42");
    await expect(benzene).toHaveValue("0.4");
    await expect(editor.getByLabel(/^Mole fraction acetone$/i)).toHaveValue(
      "0",
    );
  });
}

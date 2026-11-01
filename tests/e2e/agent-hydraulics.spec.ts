import { expect, test } from "./test";
import { connectAssistant, installAssistant } from "./assistant-fixture";
import { loadProject } from "./project-fixture";
import { hydraulicProject } from "../fixtures/hydraulic-project";
import { recoveryWorkspace } from "./folder-fixture";
import { projectSchema } from "../../src/domain/schema";

test("connected agent reads guide, previews and rates a hydraulic change, then the user applies it", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const dispose = await installAssistant(page);
  try {
    const project = hydraulicProject();
    await loadProject(page, project);
    await connectAssistant(page);
    await page.getByLabel("Process prompt").fill("rate column hydraulics");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.getByText(
        "The simulation predicts flooding. The change is ready for review.",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 30000 });
    const apply = page.getByRole("button", { name: "Apply reviewed actions" });
    await expect(apply).toBeEnabled();
    const savedColumn = async () =>
      projectSchema.parse((await recoveryWorkspace(page)).project).units[1]
        .params.distillation!;
    expect((await savedColumn()).hydraulics?.diameter).toBe(1.2);
    await apply.click();
    await expect(
      page.getByText("Changes applied", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => (await savedColumn()).hydraulics?.diameter)
      .toBe(0.7);
    const saved = await savedColumn();
    expect(saved).toEqual({
      ...project.units[1].params.distillation,
      hydraulics: {
        ...project.units[1].params.distillation!.hydraulics,
        diameter: 0.7,
      },
    });
    await page.getByRole("button", { name: "Close assistant panel" }).click();
    await page
      .getByRole("button", { name: "Run simulation", exact: true })
      .click();
    await expect(page.locator(".diagnostics h3")).toHaveText("Converged");
    await page.locator('.react-flow__node[data-id="D-201"] .unit-tag').click();
    await page.getByRole("button", { name: "Properties", exact: true }).click();
    await page.getByRole("tab", { name: "Results", exact: true }).click();
    await expect(
      page.getByText("Flooding predicted", { exact: true }).first(),
    ).toBeVisible({ timeout: 15000 });
    expect(errors).toEqual([]);
  } finally {
    await dispose();
  }
});

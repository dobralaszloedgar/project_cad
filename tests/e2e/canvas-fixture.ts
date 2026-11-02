import { expect, type Page } from "@playwright/test";

/** Read mouse coordinates only after font measurements and initial fitting finish. */
export async function settleCanvas(page: Page) {
  const viewport = page.locator(".react-flow__viewport");
  await expect(viewport).not.toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  let previous = "";
  let stable = 0;
  await expect
    .poll(
      async () => {
        const current = await viewport.evaluate(
          (element) => getComputedStyle(element).transform,
        );
        stable = current === previous ? stable + 1 : 0;
        previous = current;
        return stable;
      },
      { intervals: [100] },
    )
    .toBeGreaterThanOrEqual(3);
}

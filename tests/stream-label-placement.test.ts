import { expect, it } from "vitest";
import { inlineStreamLabelPosition } from "../src/components/stream-label-placement";

it("keeps a compact inline label away from a shallow rounded dogleg", () => {
  const path = "M0 8L95 8Q100 8 100 13L100 15Q100 20 105 20L200 20";
  const label = inlineStreamLabelPosition(path, { x: 100, y: 14 }, 50, 15, 2);
  expect([8, 20]).toContain(label.y);
  expect(label.x + 25 <= 93 || label.x - 25 >= 107).toBe(true);
});
it("centers labels on tall vertical runs and straight paths", () => {
  expect(
    inlineStreamLabelPosition(
      "M0 8L95 8Q100 8 100 13L100 75Q100 80 105 80L200 80",
      { x: 100, y: 44 },
      50,
      15,
      2,
    ),
  ).toEqual({ x: 100, y: 44 });
  for (const path of ["M0 100L200 100", "M100 0L100 200", "M200 100L0 100"])
    expect(
      inlineStreamLabelPosition(path, { x: 100, y: 100 }, 50, 15, 2),
    ).toEqual({ x: 100, y: 100 });
});

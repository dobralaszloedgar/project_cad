// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { describe, expect, it } from "vitest";
import {
  advanceMorph,
  createMorphSprings,
  morphGeometry,
  morphProperties,
  morphTargets,
  settleMorph,
} from "../src/components/assistant/assistant-morph-motion";
import {
  dockCorners,
  dockPanel,
  dockPoint,
} from "../src/components/assistant/dock";

describe("shared assistant morph", () => {
  const panel = { left: 0, top: 0, width: 640, height: 570 };
  it.each([30, 60, 120])(
    "authored samples match the live spring at %i FPS",
    (fps) => {
      const targets = morphTargets(panel, "panel", 0);
      const live = createMorphSprings(morphTargets(panel, "bubble", 0));
      for (let frame = 1; frame <= fps / 2; frame++) {
        advanceMorph(live, targets, 1 / fps);
        const captured = createMorphSprings(morphTargets(panel, "bubble", 0));
        advanceMorph(captured, targets, frame / fps);
        for (const key of morphProperties) {
          expect(captured[key].value).toBeCloseTo(live[key].value, 8);
          expect(captured[key].velocity).toBeCloseTo(live[key].velocity, 8);
        }
        expect(live.width.value).toBeLessThanOrEqual(panel.width);
        expect(live.height.value).toBeLessThanOrEqual(panel.height);
      }
    },
  );
  it.each(dockCorners)(
    "grows from the actual %s dock and settles on its panel",
    (corner) => {
      const bounds = { left: 0, top: 0, right: 1200, bottom: 900 };
      const panel = dockPanel(bounds, corner),
        point = dockPoint(bounds, corner);
      const springs = createMorphSprings(morphTargets(panel, "bubble", 0));
      const closed = morphGeometry(springs, panel, point, corner);
      expect(closed).toMatchObject({
        width: 44,
        height: 44,
        left: point.x,
        top: point.y,
      });
      settleMorph(springs, morphTargets(panel, "panel", 0));
      const opened = morphGeometry(springs, panel, point, corner);
      expect(opened).toMatchObject({
        width: panel.width,
        height: panel.height,
        left: panel.left,
        top: panel.top,
      });
      expect(opened.clipPath).toBe("inset(0px 0px 0px 0px round 20px)");
    },
  );
});

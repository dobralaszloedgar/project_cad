// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  processCamera,
  createProcessCamera,
  worksheetProjection,
} from "../src/components/landing/landing-camera";
import { makeLandingSystem } from "../src/components/landing/landing-system";
import { equipmentEnvelope } from "../src/components/equipment-3d/plant-routing";
import {
  CAD_WIDTH,
  CAD_HEIGHT,
  CAD_SCALE,
  CAD_CENTER_Z,
} from "../src/components/landing/landing-construction";
describe("live process framing", () => {
  const system = makeLandingSystem();
  it.each([
    { width: 1920, height: 1080 },
    { width: 390, height: 844 },
  ])(
    "fits the whole connected process in the $width × $height overview",
    ({ width, height }) => {
      const camera = processCamera(system, width, height, 0.95);
      for (const unit of system.equipment) {
        const box = equipmentEnvelope(unit);
        for (const x of [box.min[0], box.max[0]])
          for (const y of [box.min[1], box.max[1]])
            for (const z of [box.min[2], box.max[2]]) {
              const point = new Vector3(x, y, z).project(camera);
              expect(Math.abs(point.x)).toBeLessThan(1);
              expect(Math.abs(point.y)).toBeLessThan(1);
            }
      }
    },
  );
  it("keeps neighboring equipment in view along a continuous camera path", () => {
    let previous = processCamera(system, 1920, 1080, 1);
    for (let p = 1.01; p <= 1.65; p += 0.01) {
      const camera = processCamera(system, 1920, 1080, p);
      expect(camera.position.distanceTo(previous.position)).toBeLessThan(2.5);
      expect(camera.position.y).toBeGreaterThan(2);
      const visible = system.equipment.filter((unit) => {
        const point = new Vector3(...unit.position)
          .add(new Vector3(0, 1.3, 0))
          .project(camera);
        return (
          Math.abs(point.x) < 1 &&
          Math.abs(point.y) < 1 &&
          Math.abs(point.z) < 1
        );
      });
      expect(visible.length).toBeGreaterThanOrEqual(3);
      previous = camera;
    }
  });
  it("projects the DOM worksheet onto the same plane as the rendered pipe routes", () => {
    for (const progress of [0.55, 0.64, 0.78]) {
      const camera = processCamera(system, 1920, 1080, progress);
      const [a, b, g, c, d, h, e, f, i] = worksheetProjection(
        camera,
        1920,
        1080,
      );
      for (const [x, y] of [
        [0, 0],
        [CAD_WIDTH, CAD_HEIGHT],
        [864, 388],
      ]) {
        const expected = new Vector3(
          (x - CAD_WIDTH / 2) / CAD_SCALE,
          0.18,
          (y - CAD_HEIGHT / 2) / CAD_SCALE + CAD_CENTER_Z,
        ).project(camera);
        expect((a * x + c * y + e) / (g * x + h * y + i)).toBeCloseTo(
          (expected.x + 1) * 960,
          3,
        );
        expect((b * x + d * y + f) / (g * x + h * y + i)).toBeCloseTo(
          (1 - expected.y) * 540,
          3,
        );
      }
    }
  });
  it("reuses one camera and restores the same pose after reversal and resize", () => {
    const rig = createProcessCamera(system);
    const camera = rig.camera;
    rig.update(1280, 800, 1.23);
    const original = camera.matrixWorld.clone();
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [768, 1024],
      [2048, 794],
    ]) {
      for (const progress of [1.65, 0.55, 1.4, 0.95]) {
        rig.update(width, height, progress);
        expect(rig.camera).toBe(camera);
        expect(camera.matrixWorld.elements.every(Number.isFinite)).toBe(true);
      }
    }
    rig.update(1280, 800, 1.23);
    expect(camera.matrixWorld.elements).toEqual(original.elements);
  });
});

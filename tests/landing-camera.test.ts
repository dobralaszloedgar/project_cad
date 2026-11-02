import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { equipmentView } from "../src/components/landing/landing-camera";
import { makeLandingSystem } from "../src/components/landing/landing-system";
import { equipmentEnvelope } from "../src/components/equipment-3d/plant-routing";
import { tourWeights } from "../src/components/landing/landing-motion";

describe("landing equipment framing", () => {
  it.each([
    [1440, 900],
    [1280, 800],
    [390, 844],
    [320, 568],
    [430, 932],
  ])(
    "keeps every featured assembly inside a %i × %i viewport",
    (width, height) => {
      const system = makeLandingSystem();
      for (const id of ["heater", "reactor", "column"]) {
        const item = system.equipment.find((unit) => unit.id === id)!;
        const view = equipmentView(item, width, height, 38);
        const camera = new PerspectiveCamera(38, width / height, 0.1, 220);
        camera.position.copy(view.position);
        camera.lookAt(view.target);
        camera.updateMatrixWorld();
        const bounds = equipmentEnvelope(item);
        for (const x of [bounds.min[0], bounds.max[0]])
          for (const y of [bounds.min[1], bounds.max[1]])
            for (const z of [bounds.min[2], bounds.max[2]]) {
              const projected = new Vector3(x, y, z).project(camera);
              const screenY = ((1 - projected.y) * height) / 2;
              expect(Math.abs(projected.x)).toBeLessThan(0.85);
              expect(screenY).toBeGreaterThan(width <= 700 ? 120 : 75);
              expect(screenY).toBeLessThan(height - (width <= 700 ? 135 : 85));
            }
      }
    },
  );
  it("holds each close-up and restores the overview in reverse", () => {
    expect(tourWeights(1)).toEqual([1, 0, 0, 0]);
    expect(tourWeights(1.2)).toEqual([0, 1, 0, 0]);
    expect(tourWeights(1.4)).toEqual([0, 0, 1, 0]);
    expect(tourWeights(1.65)).toEqual([0, 0, 0, 1]);
    for (let p = 1.65; p > 0.95; p -= 0.01) {
      const weights = tourWeights(p);
      expect(weights.reduce((total, weight) => total + weight, 0)).toBeCloseTo(
        1,
      );
      expect(weights.every((weight) => weight >= 0 && weight <= 1)).toBe(true);
    }
  });
});

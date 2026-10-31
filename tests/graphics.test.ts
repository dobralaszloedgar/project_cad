import { describe, expect, it } from "vitest";
import { isSoftwareRenderer } from "../src/components/graphics/diagnostics";
import { liquidMaterial } from "../src/components/equipment-3d/fluid-materials";
import { OperationClock } from "../src/components/equipment-3d/operation";
import {
  maximumDpr,
  ResolutionController,
} from "../src/components/graphics/performance";

describe("graphics compatibility", () => {
  it.each([
    "AMD Radeon(TM) 890M Graphics",
    "Intel(R) Iris(R) Xe Graphics",
    "Apple M2",
    "NVIDIA GeForce RTX 5070 Ti Laptop GPU",
    "GPU name unavailable",
  ])("does not tell %s users that acceleration is disabled", (gpu) => {
    expect(isSoftwareRenderer(gpu)).toBe(false);
  });
  it.each([
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))",
    "llvmpipe (LLVM 15.0, 256 bits)",
    "Microsoft Basic Render Driver",
    "WARP",
  ])("recognizes software rendering: %s", (gpu) => {
    expect(isSoftwareRenderer(gpu)).toBe(true);
  });
  it("recognizes a fallback adapter even when its name is private", () => {
    expect(isSoftwareRenderer("", true)).toBe(true);
  });
});

describe("adaptive render resolution", () => {
  it("bounds render pixels on high-density laptop and mobile screens", () => {
    const dpr = maximumDpr(1920, 1080, 2);
    expect(1920 * 1080 * dpr * dpr).toBeCloseTo(2_500_000);
    expect(maximumDpr(390, 844, 3)).toBe(1.75);
    expect(maximumDpr(800, 600, 1)).toBe(1);
    const large = maximumDpr(3840, 2160, 2);
    expect(3840 * 2160 * large * large).toBeCloseTo(2_500_000);
  });
  it("reduces resolution under sustained load and recovers conservatively", () => {
    const controller = new ResolutionController();
    let dpr = 1.75;
    for (let frame = 0; frame < 180; frame++)
      dpr = controller.sample(1 / 30, dpr, 1.75);
    expect(dpr).toBeLessThan(1.75);
    const reduced = dpr;
    for (let frame = 0; frame < 440; frame++)
      dpr = controller.sample(1 / 60, dpr, 1.75);
    expect(dpr).toBeGreaterThan(reduced);
    expect(dpr).toBeLessThanOrEqual(1.75);
  });
  it("does not confuse an idle gap or initial compilation with sustained load", () => {
    const controller = new ResolutionController();
    expect(controller.sample(20, 1.5, 1.75)).toBe(1.5);
    for (let frame = 0; frame < 30; frame++)
      expect(controller.sample(1 / 30, 1.5, 1.75)).toBe(1.5);
  });
});

it("reuses liquid programs across colors and dimensions while preserving separate clocks", () => {
  const firstClock = new OperationClock();
  const secondClock = new OperationClock();
  const first = liquidMaterial(firstClock, {
    mode: "pipe",
    color: "#aa2211",
    length: 3,
  });
  const second = liquidMaterial(secondClock, {
    mode: "pipe",
    color: "#11aa22",
    length: 30,
  });
  expect(first.customProgramCacheKey()).toBe(second.customProgramCacheKey());
  firstClock.advance(0.05, true, 2);
  expect(first.userData.liquid.clock.value).toBeCloseTo(0.1);
  expect(second.userData.liquid.clock.value).toBe(0);
  first.dispose();
  second.dispose();
});

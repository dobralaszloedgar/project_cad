// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { expect, test } from "./test";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`landing opens with the application morph at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?render=capture");
    await page.locator("[data-assistant-morph]").waitFor({ state: "attached" });
    const samples = await page.evaluate(async () => {
      const api = (
        window as typeof window & {
          captureStory: {
            set: (value: {
              p: number;
              d: number;
              c: number;
              s: number;
            }) => void;
          };
        }
      ).captureStory;
      const root = document.querySelector<HTMLElement>(
        "[data-assistant-morph]",
      )!;
      const samples = [];
      for (const seconds of [1.5, 1.8, 2.01, 2.1, 2.25, 2.6]) {
        api.set({ p: 0, d: seconds / 8, c: 0, s: 0 });
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        const skin = root.querySelector<HTMLElement>("[data-animating]")!;
        const text = root.querySelector<HTMLElement>("section")!;
        const shape = skin.getBoundingClientRect();
        const matrix = new DOMMatrix(getComputedStyle(text).transform);
        samples.push({
          seconds,
          width: shape.width,
          height: shape.height,
          color: getComputedStyle(skin).backgroundColor,
          opacity: Number(getComputedStyle(text).opacity),
          scaleX: matrix.a,
          scaleY: matrix.d,
          fullWidth: root.clientWidth,
          fullHeight: root.clientHeight,
          clip: getComputedStyle(text).clipPath,
          chatIcon: Number(
            getComputedStyle(root.querySelector('[data-toggle-icon="chat"]')!)
              .opacity,
          ),
          minimizeIcon: Number(
            getComputedStyle(
              root.querySelector('[data-toggle-icon="minimize"]')!,
            ).opacity,
          ),
          cursorAbove: (() => {
            const pointer =
              document.querySelector<HTMLElement>("[data-demo-cursor]");
            return (
              !pointer ||
              Number(getComputedStyle(pointer).zIndex) >
                Number(getComputedStyle(root).zIndex)
            );
          })(),
        });
      }
      return samples;
    });
    for (const sample of samples.slice(0, 3)) {
      expect(sample.width).toBeCloseTo(44, 1);
      expect(sample.height).toBeCloseTo(44, 1);
      expect(sample.opacity).toBe(0);
      expect(sample.chatIcon).toBe(1);
      expect(sample.minimizeIcon).toBe(0);
    }
    expect(samples[1].color).not.toBe(samples[0].color);
    expect(samples[3].width).toBeGreaterThan(44);
    expect(samples[3].width).toBeLessThan(samples[3].fullWidth);
    for (const sample of samples) {
      expect(sample.scaleX).toBe(1);
      expect(sample.scaleY).toBe(1);
      expect(sample.cursorAbove).toBe(true);
    }
    const end = samples.at(-1)!;
    expect(end.width).toBeCloseTo(end.fullWidth, 1);
    expect(end.height).toBeCloseTo(end.fullHeight, 1);
    expect(end.opacity).toBe(1);
    expect(end.chatIcon).toBe(0);
    expect(end.minimizeIcon).toBe(1);
    expect(end.clip).toMatch(/^inset\(0px(?: 0px){0,3} round 20px\)$/);
    await expect(page.locator("[data-demo-launcher]")).toHaveCount(0);
  });
}

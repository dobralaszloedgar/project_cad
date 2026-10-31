import { expect, test } from "./test";

type CursorFrame = {
  time: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  centerX: number;
  centerY: number;
  sceneMounted: boolean;
};
type CursorEvidence = { frames: CursorFrame[]; complete: boolean };
type ObservedWindow = typeof window & { cursorEvidence: CursorEvidence };

test.use({ video: "on" });

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
]) {
  test(`cursor travels from the page center and settles on the bubble at ${viewport.width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    // Observe the first painted cursor frame, before test navigation can miss the intro.
    await page.addInitScript(() => {
      const evidence: CursorEvidence = { frames: [], complete: false };
      (window as ObservedWindow).cursorEvidence = evidence;
      const sample = () => {
        const pointer = document.querySelector<HTMLElement>(
          "[data-demo-cursor] > div:last-child",
        );
        const button = document.querySelector<HTMLButtonElement>(
          'button[aria-controls="landing-assistant"]',
        );
        if (button?.getAttribute("aria-expanded") === "true") {
          evidence.complete = true;
          return;
        }
        if (
          pointer &&
          button &&
          Number(getComputedStyle(pointer).opacity) > 0.1
        ) {
          const rect = pointer.getBoundingClientRect();
          const target = button.getBoundingClientRect();
          const view = window.visualViewport;
          evidence.frames.push({
            time: performance.now(),
            x: rect.x,
            y: rect.y,
            targetX: target.x + target.width / 2,
            targetY: target.y + target.height / 2,
            centerX: (view?.offsetLeft ?? 0) + (view?.width ?? innerWidth) / 2,
            centerY: (view?.offsetTop ?? 0) + (view?.height ?? innerHeight) / 2,
            sceneMounted: !!document.querySelector(
              "[data-shared-scene] canvas",
            ),
          });
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.goto("/");
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as ObservedWindow).cursorEvidence.complete,
          ),
        { timeout: 15000 },
      )
      .toBe(true);
    const { frames } = await page.evaluate(
      () => (window as ObservedWindow).cursorEvidence,
    );
    expect(frames.length).toBeGreaterThan(5);
    expect(frames.some((frame) => frame.sceneMounted)).toBe(false);
    const first = frames[0],
      last = frames.at(-1)!;
    expect(first.x).toBeCloseTo(first.centerX, 0);
    expect(first.y).toBeCloseTo(first.centerY, 0);
    expect(last.x).toBeCloseTo(last.targetX, 0);
    expect(last.y).toBeCloseTo(last.targetY, 0);
    const dx = last.targetX - first.centerX,
      dy = last.targetY - first.centerY;
    const distance = Math.hypot(dx, dy);
    const departure = frames.map(
      (frame) =>
        Math.abs(
          (frame.x - first.centerX) * dy - (frame.y - first.centerY) * dx,
        ) / distance,
    );
    expect(Math.max(...departure)).toBeGreaterThan(2);
    expect(Math.max(...departure)).toBeLessThan(40);
    const settled = frames.filter(
      (frame) =>
        Math.hypot(frame.x - frame.targetX, frame.y - frame.targetY) < 1,
    );
    expect(settled.at(-1)!.time - settled[0].time).toBeGreaterThan(100);
    const speeds = frames.slice(1).map((frame, index) => ({
      progress:
        Math.hypot(frame.x - first.centerX, frame.y - first.centerY) / distance,
      speed:
        Math.hypot(frame.x - frames[index].x, frame.y - frames[index].y) /
        (frame.time - frames[index].time),
    }));
    const average = (min: number, max: number) => {
      const values = speeds.filter(
        (frame) => frame.progress > min && frame.progress < max,
      );
      expect(values.length).toBeGreaterThan(0);
      return (
        values.reduce((total, frame) => total + frame.speed, 0) / values.length
      );
    };
    expect(average(0.3, 0.7)).toBeGreaterThan(average(0.9, 0.99));
    await info.attach("cursor-frames", {
      body: JSON.stringify(frames),
      contentType: "application/json",
    });
    await expect(page.locator("#landing-assistant")).toHaveCSS("opacity", "1");
    await page.screenshot({ path: info.outputPath("cursor-opened-chat.png") });
    expect(errors).toEqual([]);
  });
}

import { describe, expect, it } from "vitest";
import {
  advancePlayback,
  initialPlayback,
  STORY_END,
} from "../src/components/landing/landing-playback";

describe("landing story playback", () => {
  it("keeps the eight-second chat and plays the shorter build and simulation in order", () => {
    let state = initialPlayback();
    const advance = (frames: number, target: number) => {
      for (let i = 0; i < frames; i++)
        state = advancePlayback(state, target, 1 / 60);
    };
    advance(479, STORY_END);
    expect(state.design).toBeLessThan(1);
    expect(state.progress).toBe(0);
    advance(2, STORY_END);
    expect(state.design).toBe(1);

    state = { ...initialPlayback(), design: 1, progress: 0.53 };
    advance(287, 0.53);
    expect(state.construction).toBeLessThan(1);
    expect(state.simulation).toBe(0);
    advance(2, 0.53);
    expect(state.construction).toBe(1);
    advance(70, 0.53);
    expect(state.simulation).toBeLessThan(1);
    advance(3, 0.53);
    expect(state.simulation).toBe(1);
  });
  it("plays every construction step before unfolding, even when scrolling straight to the end", () => {
    let state = initialPlayback();
    const visited = new Set<number>();
    let firstFinished = 0;
    for (let frame = 0; frame < 2400; frame++) {
      state = advancePlayback(state, STORY_END, 1 / 60);
      visited.add(Math.floor(state.construction * 18));
      if (state.simulation < 1)
        expect(state.progress).toBeLessThanOrEqual(0.53);
      else if (!firstFinished) firstFinished = frame / 60;
    }
    expect(visited).toEqual(new Set(Array.from({ length: 19 }, (_, i) => i)));
    expect(firstFinished).toBeGreaterThan(3);
    expect(state.progress).toBe(STORY_END);
  });
  it("accelerates on scroll without skipping steps during a stalled frame", () => {
    const atWorkbench = { ...initialPlayback(), progress: 0.4, design: 1 };
    const normal = advancePlayback(atWorkbench, 0.53, 1 / 60);
    const fast = advancePlayback(atWorkbench, STORY_END, 1 / 60);
    expect(fast.construction).toBeGreaterThan(normal.construction * 3);
    const stalled = advancePlayback(atWorkbench, STORY_END, 5);
    expect(stalled.construction * 18).toBeLessThan(1);
    expect(stalled.progress - atWorkbench.progress).toBeLessThan(0.085);
  });
  it("can reverse through the same scene and reset the construction at the beginning", () => {
    let state = { ...initialPlayback(), progress: STORY_END, construction: 1 };
    for (let i = 0; i < 2400; i++) state = advancePlayback(state, 0, 1 / 60);
    expect(state.progress).toBe(0);
    expect(state.construction).toBe(0);
    expect(advancePlayback(state, 0.53, 1 / 60, true)).toMatchObject({
      progress: 0.53,
      construction: 1,
      simulation: 1,
      design: 1,
      velocity: 0,
    });
  });
  it("finishes the chat before building, then simulates only the connected flowsheet", () => {
    let state = initialPlayback();
    let sawSimulation = false;
    for (let frame = 0; frame < 1800; frame++) {
      state = advancePlayback(state, STORY_END, 1 / 60);
      if (state.design < 1) expect(state.progress).toBe(0);
      if (state.construction < 1) expect(state.simulation).toBe(0);
      if (state.simulation > 0 && state.simulation < 1) {
        sawSimulation = true;
        expect(state.construction).toBe(1);
        expect(state.progress).toBeLessThanOrEqual(0.53);
      }
    }
    expect(sawSimulation).toBe(true);
    expect(state.simulation).toBe(1);
    expect(state.progress).toBe(STORY_END);
  });
});

// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { describe, expect, it } from "vitest";
import {
  advancePlayback,
  initialPlayback,
  STORY_END,
} from "../src/components/landing/landing-playback";

describe("landing story playback", () => {
  it("lets the chat play at rest, but scrolling moves on immediately", () => {
    let state = initialPlayback();
    const advance = (frames: number, target: number) => {
      for (let i = 0; i < frames; i++)
        state = advancePlayback(state, target, 1 / 60);
    };
    advance(479, 0);
    expect(state.design).toBeLessThan(1);
    expect(state.progress).toBe(0);
    advance(2, 0);
    expect(state.design).toBe(1);
    expect(
      advancePlayback(initialPlayback(), 0.53, 1 / 60).progress,
    ).toBeGreaterThan(0);

    state = { ...initialPlayback(), design: 1, progress: 0.53 };
    advance(143, 0.53);
    expect(state.construction).toBeLessThan(1);
    expect(state.simulation).toBe(0);
    advance(2, 0.53);
    expect(state.construction).toBe(1);
    advance(24, 0.53);
    expect(state.simulation).toBeLessThan(1);
    advance(4, 0.53);
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
    expect(firstFinished).toBeGreaterThan(0.7);
    expect(firstFinished).toBeLessThan(2);
    expect(state.progress).toBe(STORY_END);
  });
  it("accelerates on scroll without skipping steps during a stalled frame", () => {
    const atWorkbench = { ...initialPlayback(), progress: 0.4, design: 1 };
    const normal = advancePlayback(atWorkbench, 0.53, 1 / 60);
    const fast = advancePlayback(atWorkbench, STORY_END, 1 / 60);
    expect(fast.construction).toBeGreaterThan(normal.construction * 3);
    const stalled = advancePlayback(atWorkbench, STORY_END, 5);
    expect(stalled.construction * 18).toBeLessThan(1);
    expect(stalled.progress).toBeLessThanOrEqual(0.53);
  });
  it("follows a completed tour promptly at both 30 and 60 fps without overshooting", () => {
    for (const fps of [30, 60]) {
      let state = {
        ...initialPlayback(),
        design: 1,
        progress: 0.95,
        construction: 1,
        simulation: 1,
        completedFor: 1,
      };
      for (let frame = 0; frame < fps; frame++) {
        state = advancePlayback(state, STORY_END, 1 / fps);
        expect(state.progress).toBeLessThanOrEqual(STORY_END);
      }
      expect(state.progress).toBe(STORY_END);
      for (let frame = 0; frame < fps; frame++)
        state = advancePlayback(state, 0.95, 1 / fps);
      expect(state.progress).toBe(0.95);
    }
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
  it("keeps the eight-second introduction at one frame per second", () => {
    let state = initialPlayback();
    for (let second = 0; second < 7; second++)
      state = advancePlayback(state, 0, 1);
    expect(state.design).toBeLessThan(1);
    state = advancePlayback(state, 0, 1);
    expect(state.design).toBe(1);
  });
  it("finishes the drawing before waiting for 3D, then continues the same camera journey", () => {
    let state = { ...initialPlayback(), design: 1, progress: 0.53 };
    for (let frame = 0; frame < 600; frame++)
      state = advancePlayback(state, 0.95, 1 / 60, false, false);
    expect(state).toMatchObject({
      construction: 1,
      simulation: 1,
      progress: 0.53,
    });
    state = advancePlayback(state, 0.95, 1 / 60, false, true);
    expect(state.progress).toBeGreaterThan(0.53);
    expect(state.progress).toBeLessThan(0.95);
    for (let frame = 0; frame < 240; frame++)
      state = advancePlayback(state, 0.95, 1 / 60, false, true);
    expect(state.progress).toBeCloseTo(0.95, 3);
    expect(
      advancePlayback(initialPlayback(), 0.95, 0, true, false).progress,
    ).toBe(0.95);
  });
});

// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { describe, expect, it } from "vitest";
import {
  advancePlayback,
  initialPlayback,
  BUILD_SECONDS,
  SIMULATION_SECONDS,
  STORY_END,
} from "../src/components/landing/landing-playback";

describe("landing story playback", () => {
  it("lets the chat play at rest while navigation moves on promptly", () => {
    let state = initialPlayback();
    for (let second = 0; second < 7; second++)
      state = advancePlayback(state, 0, 1);
    expect(state.design).toBeLessThan(1);
    expect(state.progress).toBe(0);
    expect(advancePlayback(state, 0, 1).design).toBe(1);
    expect(
      advancePlayback(initialPlayback(), 0.53, 1 / 60).progress,
    ).toBeGreaterThan(0);
  });
  it.each([30, 60, 120])(
    "gives every build step ten seconds in total, then a separate simulation beat at %i fps",
    (fps) => {
      let state = { ...initialPlayback(), design: 1, progress: 0.53 };
      const steps = new Set<number>();
      for (let frame = 0; frame < BUILD_SECONDS * fps; frame++) {
        steps.add(Math.floor(state.construction * 18));
        state = advancePlayback(state, 0.53, 1 / fps);
        if (frame < (BUILD_SECONDS - 0.1) * fps)
          expect(state.construction).toBeLessThan(1);
        expect(state.simulation).toBe(0);
      }
      expect(steps.size).toBe(18);
      state = advancePlayback(state, 0.53, 1 / fps);
      expect(state.construction).toBe(1);
      for (let frame = 0; frame < (SIMULATION_SECONDS * fps) / 2; frame++)
        state = advancePlayback(state, 0.53, 1 / fps);
      expect(state.simulation).toBeGreaterThan(0.4);
      expect(state.simulation).toBeLessThan(0.6);
      for (let frame = 0; frame < SIMULATION_SECONDS * fps; frame++)
        state = advancePlayback(state, 0.53, 1 / fps);
      expect(state.simulation).toBe(1);
    },
  );
  it("does not accelerate construction as the user scrolls within Build", () => {
    const state = { ...initialPlayback(), progress: 0.4, design: 1 };
    expect(advancePlayback(state, 0.54, 1 / 60).construction).toBe(
      advancePlayback(state, 0.4, 1 / 60).construction,
    );
    expect(advancePlayback(state, 0.53, 5).construction * 18).toBeLessThan(1);
  });
  it("honors a direct Explore jump without holding the camera behind the build clock", () => {
    let state = initialPlayback();
    for (let i = 0; i < 60; i++)
      state = advancePlayback(state, STORY_END, 1 / 60);
    expect(state).toMatchObject({
      progress: STORY_END,
      construction: 1,
      simulation: 1,
    });
  });
  it.each([30, 60])(
    "follows and reverses the tour without overshoot at %i fps",
    (fps) => {
      let state = {
        ...initialPlayback(),
        progress: 0.95,
        design: 1,
        construction: 1,
        simulation: 1,
      };
      for (let i = 0; i < fps; i++) {
        state = advancePlayback(state, STORY_END, 1 / fps);
        expect(state.progress).toBeLessThanOrEqual(STORY_END);
      }
      expect(state.progress).toBe(STORY_END);
      for (let i = 0; i < fps; i++)
        state = advancePlayback(state, 0.95, 1 / fps);
      expect(state.progress).toBe(0.95);
    },
  );
  it("replays Build on return and respects reduced motion", () => {
    let state = {
      ...initialPlayback(),
      progress: STORY_END,
      construction: 1,
      simulation: 1,
    };
    state = advancePlayback(state, 0.53, 1 / 60);
    expect(state.construction).toBe(0);
    expect(advancePlayback(state, 0.53, 0, true)).toMatchObject({
      progress: 0.53,
      construction: 1,
      simulation: 1,
      velocity: 0,
    });
    for (let i = 0; i < 120; i++) state = advancePlayback(state, 0, 1 / 60);
    expect(state.progress).toBe(0);
    expect(state.construction).toBe(0);
  });
});

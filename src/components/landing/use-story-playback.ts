// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import { useEffect, useRef } from "react";
import { useMotionValue, type MotionValue } from "motion/react";
import {
  advancePlayback,
  initialPlayback,
  STORY_END,
} from "./landing-playback";

/** Wake only for playback or scrolling; a settled/hidden page has no story RAF. */
export function useStoryPlayback(
  scroll: MotionValue<number>,
  visible: boolean,
  reduced: boolean,
) {
  const progress = useMotionValue(0);
  const design = useMotionValue(0);
  const construction = useMotionValue(0);
  const simulation = useMotionValue(0);
  const state = useRef(initialPlayback());
  useEffect(() => {
    if (!visible) return;
    let frame = 0,
      previous = 0;
    const tick = (time: number) => {
      frame = 0;
      const target = Math.max(0, Math.min(1, scroll.get())) * STORY_END;
      const seconds = previous ? (time - previous) / 1000 : 1 / 60;
      previous = time;
      state.current = advancePlayback(state.current, target, seconds, reduced);
      const next = state.current;
      progress.set(next.progress);
      design.set(next.design);
      construction.set(next.construction);
      simulation.set(next.simulation);
      const destination = target;
      const travelling = Math.abs(destination - next.progress) > 0.00001;
      const building = target >= 0.3 && next.simulation < 1;
      const chatting = next.design < 1;
      if (!reduced && (travelling || building || chatting))
        frame = requestAnimationFrame(tick);
      else {
        previous = 0;
      }
    };
    const wake = () => {
      if (!frame) {
        previous = 0;
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    const stop = scroll.on("change", wake);
    return () => {
      cancelAnimationFrame(frame);
      stop();
    };
  }, [scroll, visible, reduced, progress, design, construction, simulation]);
  return { progress, design, construction, simulation };
}

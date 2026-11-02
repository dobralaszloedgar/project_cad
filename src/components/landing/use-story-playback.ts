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
  enabled: boolean,
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
      previous = 0,
      manual = false;
    const tick = (time: number) => {
      frame = 0;
      if (!enabled && !manual && !reduced) return;
      const target = Math.max(0, Math.min(1, scroll.get())) * STORY_END;
      const seconds = previous ? (time - previous) / 1000 : 1 / 60;
      previous = time;
      state.current = advancePlayback(
        state.current,
        target,
        seconds,
        reduced || !enabled,
      );
      const next = state.current;
      progress.set(next.progress);
      design.set(next.design);
      construction.set(next.construction);
      simulation.set(next.simulation);
      const travelling = Math.abs(target - next.progress) > 0.00001;
      const building = target >= 0.3 && next.simulation < 1;
      const chatting = next.design < 1;
      if (!reduced && (travelling || building || chatting))
        frame = requestAnimationFrame(tick);
      else {
        manual = false;
        previous = 0;
      }
    };
    const wake = () => {
      manual = true;
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
  }, [
    scroll,
    enabled,
    visible,
    reduced,
    progress,
    design,
    construction,
    simulation,
  ]);
  return { progress, design, construction, simulation };
}

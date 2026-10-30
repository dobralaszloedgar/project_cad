"use client";

import { useEffect, useRef } from "react";
import {
  useAnimationFrame,
  useMotionValue,
  type MotionValue,
} from "motion/react";
import {
  advancePlayback,
  initialPlayback,
  STORY_END,
} from "./landing-playback";

export function useStoryPlayback(
  scroll: MotionValue<number>,
  enabled: boolean,
  visible: boolean,
  reduced: boolean,
) {
  const progress = useMotionValue(0);
  const construction = useMotionValue(0);
  const speed = useMotionValue(1);
  const state = useRef(initialPlayback());
  const previousTarget = useRef(0);
  const manualJourney = useRef(false);
  const previousTime = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) manualJourney.current = false;
  }, [enabled]);
  useAnimationFrame((time) => {
    // Motion caps its supplied delta at 40 ms. Use its real timestamp so a
    // slower WebGL frame doesn't stretch a nine-second build into a minute.
    const seconds =
      previousTime.current === null ? 0 : (time - previousTime.current) / 1000;
    previousTime.current = time;
    if (!visible) return;
    const target = Math.max(0, Math.min(1, scroll.get())) * STORY_END;
    // Pausing stops ambient playback; explicit navigation remains usable.
    if (Math.abs(previousTarget.current - target) > 0.0001)
      manualJourney.current = true;
    previousTarget.current = target;
    if (!enabled && !manualJourney.current && !reduced) return;
    state.current = advancePlayback(state.current, target, seconds, reduced);
    progress.set(state.current.progress);
    construction.set(state.current.construction);
    speed.set(state.current.speed);
    if (Math.abs(target - state.current.progress) < 0.00001)
      manualJourney.current = false;
  });
  return { progress, construction, speed };
}

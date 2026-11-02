// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

/** A readable build sequence followed by responsive, scroll-controlled views. */
export const STORY_END = 1.65;
export const STORY_STOPS = [0, 0.53, 0.95] as const;
export const BUILD_SECONDS = 10;
export const SIMULATION_SECONDS = 1.2;

export type PlaybackState = {
  design: number;
  progress: number;
  velocity: number;
  construction: number;
  simulation: number;
  completedFor: number;
  speed: number;
};

export function initialPlayback(): PlaybackState {
  return {
    design: 0,
    progress: 0,
    velocity: 0,
    construction: 0,
    simulation: 0,
    completedFor: 0,
    speed: 1,
  };
}

export function advancePlayback(
  state: PlaybackState,
  requested: number,
  seconds: number,
  reduced = false,
): PlaybackState {
  const target = Math.max(0, Math.min(STORY_END, requested));
  if (reduced)
    return {
      design: 1,
      progress: target,
      velocity: 0,
      construction: target >= 0.3 ? 1 : 0,
      simulation: target >= 0.3 ? 1 : 0,
      completedFor: 1,
      speed: 1,
    };

  // Keep the same pacing at low frame rates. Visibility changes reset the
  // clock at the call site; bound isolated stalls without turning a 1 FPS
  // device's eight-second introduction into thirty-two seconds.
  const dt = Math.min(Math.max(Number.isFinite(seconds) ? seconds : 0, 0), 1);
  let { progress, velocity, construction, simulation, completedFor } = state;
  // Scrolling is an explicit request to move on. Never hold it behind the
  // eight-second introductory chat, which can play at leisure while at rest.
  let design = target > 0.12 ? 1 : Math.min(1, state.design + dt / 8);
  const speed = 1;
  if (target > 0.55) {
    // Native scroll and chapter shortcuts always win. Play the slower build
    // while the user is watching it, without queuing a delayed camera catch-up.
    construction = 1;
    simulation = 1;
    completedFor = 1;
  } else if (progress < 0.18 || (progress > 0.65 && target >= 0.3)) {
    construction = 0;
    simulation = 0;
    completedFor = 0;
  } else if (progress >= 0.3 && target >= 0.3) {
    construction = Math.min(
      1,
      construction + Math.min(1 / 36, dt / BUILD_SECONDS),
    );
    // Simulation is its own visible beat, after the last recycle connection.
    if (construction === 1 && state.construction === 1)
      simulation = Math.min(1, simulation + dt / SIMULATION_SECONDS);
    if (simulation === 1) completedFor += dt;
  }

  const destination = design < 1 ? 0 : target;
  // Frame-rate independent damping without a speed cap or a second spring.
  // A completed story catches the scroll in well under a second, without bounce.
  const next = progress + (destination - progress) * (1 - Math.exp(-dt * 14));
  velocity = dt > 0 ? (next - progress) / dt : 0;
  progress = next;
  if (Math.abs(destination - progress) < 0.00001) {
    progress = destination;
    velocity = 0;
  }
  if (target === 0 && progress === 0 && state.progress > 0) design = 0;
  return {
    design,
    progress,
    velocity,
    construction,
    simulation,
    completedFor,
    speed,
  };
}

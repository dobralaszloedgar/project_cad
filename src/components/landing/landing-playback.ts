/** A single playback clock keeps a quick scroll from skipping construction. */
export const STORY_END = 1.65;
export const STORY_STOPS = [0, 0.53, 0.95] as const;

export type PlaybackState = {
  progress: number;
  velocity: number;
  construction: number;
  completedFor: number;
  speed: number;
};

export function initialPlayback(): PlaybackState {
  return {
    progress: 0,
    velocity: 0,
    construction: 0,
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
      progress: target,
      velocity: 0,
      construction: target >= 0.3 ? 1 : 0,
      completedFor: 1,
      speed: 1,
    };

  // Keep real-time pacing on slower devices, but show each construction step
  // for at least one frame. A stalled tab must not swallow the whole sequence.
  const dt = Math.min(Math.max(seconds, 0), 0.25);
  let { progress, velocity, construction, completedFor } = state;
  const speed = 1 + Math.min(2.2, Math.max(0, target - 0.53) * 6);
  if (progress < 0.18) {
    construction = 0;
    completedFor = 0;
  } else if (progress >= 0.3 && target >= 0.3) {
    construction = Math.min(
      1,
      construction + Math.min(1 / 24, (dt * speed) / 9),
    );
    if (construction === 1) completedFor += dt;
  }

  // Hold the camera over the workbench until every unit and stream is drawn.
  // More scroll accelerates that work; it never changes construction to 100%.
  const destination =
    target > 0.53 && (construction < 1 || completedFor < 0.4) ? 0.53 : target;
  const limit = progress < 0.55 ? 0.34 : progress < 0.95 ? 0.18 : 0.2;
  const steps = Math.max(1, Math.ceil(dt * 120));
  const step = dt / steps;
  for (let i = 0; i < steps; i++) {
    const error = destination - progress;
    velocity += (error * 48 - velocity * 14) * step;
    velocity = Math.max(-limit, Math.min(limit, velocity));
    const next = progress + velocity * step;
    if ((destination - next) * error <= 0) {
      progress = destination;
      velocity = 0;
    } else progress = next;
  }
  if (
    Math.abs(destination - progress) < 0.00001 &&
    Math.abs(velocity) < 0.001
  ) {
    progress = destination;
    velocity = 0;
  }
  return { progress, velocity, construction, completedFor, speed };
}

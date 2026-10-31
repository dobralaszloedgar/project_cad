/** Cap actual render pixels as well as DPR on large/high-density displays. */
export function maximumDpr(width: number, height: number, deviceDpr: number) {
  return Math.min(
    deviceDpr || 1,
    1.75,
    Math.sqrt(2_500_000 / Math.max(1, width * height)),
  );
}

/** Samples only continuous animation; idle gaps and shader warmup are excluded. */
export class ResolutionController {
  private elapsed = 0;
  private frames = 0;
  private warmup = 2;
  private fastWindows = 0;

  reset() {
    this.elapsed = this.frames = this.fastWindows = 0;
    this.warmup = 2;
  }

  sample(delta: number, current: number, maximum: number) {
    if (delta <= 0 || delta > 1) {
      this.reset();
      return current;
    }
    if (this.warmup > 0) {
      this.warmup -= delta;
      return current;
    }
    this.elapsed += delta;
    this.frames++;
    if (this.elapsed < 2) return current;
    const fps = this.frames / this.elapsed;
    this.elapsed = this.frames = 0;
    if (fps < 42) {
      this.fastWindows = 0;
      return Math.max(Math.min(0.75, maximum), current - 0.2);
    }
    this.fastWindows = fps > 57 ? this.fastWindows + 1 : 0;
    if (this.fastWindows >= 3) {
      this.fastWindows = 0;
      return Math.min(maximum, current + 0.1);
    }
    return current;
  }
}

import type { ActivityDataset, Chemical } from "./data";
import { selectParameters } from "./data";
import type { ModelId } from "./registry";

export function propertyRange(
  c: Chemical,
  model: ModelId,
): [number, number] | null {
  let lo = 250,
    hi = 800;
  if (c.gasCp) {
    const ranges = [...c.gasCp.ranges].sort((a, b) => a.min - b.min);
    const merged: { min: number; max: number }[] = [];
    for (const r of ranges) {
      const last = merged.at(-1);
      if (last && last.max >= r.min) last.max = Math.max(last.max, r.max);
      else merged.push({ ...r });
    }
    const connected = merged.find((r) => r.min <= 298.15 && r.max >= 298.15);
    if (!connected) return null;
    lo = Math.max(lo, connected.min);
    hi = Math.min(hi, connected.max);
  }
  if (model !== "ideal-gas") {
    const vp = c.vaporPressure;
    if (vp?.model === "iapws-1992") {
      lo = Math.max(lo, 273.16);
      hi = Math.min(hi, 647.095999);
    } else if (vp?.model === "dippr-101") {
      lo = Math.max(lo, vp.min);
      hi = Math.min(hi, vp.max, vp.criticalTemperature - 1e-6);
    } else if (c.antoine.length) {
      // Samples use overlapping records. The kernel separately rejects gaps.
      lo = Math.max(lo, Math.min(...c.antoine.map((a) => a.min)));
      hi = Math.min(hi, Math.max(...c.antoine.map((a) => a.max)));
    } else return null;
    if (c.latentHeat) {
      lo = Math.max(lo, c.latentHeat.min);
      hi = Math.min(
        hi,
        c.latentHeat.max,
        c.latentHeat.criticalTemperature - 1e-6,
      );
    }
  }
  return lo < hi ? [lo, hi] : null;
}
export function availableModels(
  c: Chemical,
  parameters: ActivityDataset,
): ModelId[] {
  const models: ModelId[] = [];
  if (propertyRange(c, "ideal-gas")) models.push("ideal-gas");
  if (propertyRange(c, "ideal-solution")) {
    models.push("ideal-solution");
    try {
      selectParameters([c], parameters);
      models.push("modified-unifac-2.0");
    } catch {
      /* Coverage is explicit. */
    }
  }
  return models;
}

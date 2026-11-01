import type { Stream } from "./solver";
import type { Unit } from "./schema";

/** Accept fractions, percentages or mole ratios and retain their proportions. */
export function normalizeComposition(
  values: Record<string, number>,
): Record<string, number> {
  const entries = Object.entries(values);
  if (entries.some(([, value]) => !Number.isFinite(value) || value < 0))
    throw new Error("Composition values must be finite and nonnegative.");
  const largest = Math.max(0, ...entries.map(([, value]) => value));
  if (largest === 0)
    throw new Error(
      "Specify composition: enter a positive amount for at least one component.",
    );
  const sum = entries.reduce((total, [, value]) => total + value, 0);
  // Avoid perturbing already normalized saved inputs by a rounding-only change.
  if (Math.abs(sum - 1) <= 4 * Number.EPSILON) return { ...values };
  if (Number.isFinite(sum))
    return Object.fromEntries(entries.map(([id, value]) => [id, value / sum]));
  // Scaling first also handles large, finite ratios without overflowing the sum.
  const total = entries.reduce((sum, [, value]) => sum + value / largest, 0);
  return Object.fromEntries(
    entries.map(([id, value]) => [id, value / largest / total]),
  );
}

export function componentFlows(
  stream: Stream,
  ids: readonly string[],
): Record<string, number> {
  if (stream.components) {
    if (Object.keys(stream.components).some((id) => !ids.includes(id)))
      throw new Error("Stream contains a component absent from the project.");
    return Object.fromEntries(
      ids.map((id) => [id, stream.components![id] ?? 0]),
    );
  }
  return Object.fromEntries(
    ids.map((id, index) => [
      id,
      index === 0 ? stream.a : index === 1 ? stream.b : 0,
    ]),
  );
}

export function withComponentFlows(
  stream: Pick<Stream, "temperature" | "pressure" | "vaporFraction">,
  values: Record<string, number>,
  ids: readonly string[],
): Stream {
  return {
    temperature: stream.temperature,
    pressure: stream.pressure,
    ...(stream.vaporFraction === undefined
      ? {}
      : { vaporFraction: stream.vaporFraction }),
    a: values[ids[0]] ?? 0,
    b: values[ids[1]] ?? 0,
    ...(ids.length > 2 ? { components: values } : {}),
  };
}

export function feedComposition(
  params: Unit["params"],
  ids: readonly string[],
): Record<string, number> {
  if (params.composition) {
    if (Object.keys(params.composition).some((id) => !ids.includes(id)))
      throw new Error(
        "Feed composition refers to a removed component. Review the feed setup.",
      );
    const fractions = normalizeComposition(params.composition);
    return Object.fromEntries(ids.map((id) => [id, fractions[id] ?? 0]));
  }
  return Object.fromEntries(
    ids.map((id, i) => [
      id,
      i === 0 ? params.fractionA : i === 1 ? 1 - params.fractionA : 0,
    ]),
  );
}

import type { Stream } from "./solver";
import type { Unit } from "./schema";

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
    const sum = Object.values(params.composition).reduce((s, n) => s + n, 0);
    if (Math.abs(sum - 1) > 1e-8)
      throw new Error("Feed mole fractions must sum to 1.");
    return Object.fromEntries(
      ids.map((id) => [id, params.composition![id] ?? 0]),
    );
  }
  return Object.fromEntries(
    ids.map((id, i) => [
      id,
      i === 0 ? params.fractionA : i === 1 ? 1 - params.fractionA : 0,
    ]),
  );
}

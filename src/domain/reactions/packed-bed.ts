import type { Chemical } from "../thermo/data";
import { compileRateLaw, reactionRateLaw } from "./rateLaw";
import { integrateExtents } from "./integrate";
import { packedBedIssues } from "./validation";
import type { PackedBedConfig } from "./schema";

export interface ReactionProfilePoint {
  catalystMass: number;
  conversion: number;
  pressure: number;
  flows: Record<string, number>;
}
export interface PackedBedResult {
  flows: Record<string, number>;
  catalystMass: number;
  conversion: number;
  pressure: number;
  extents: Record<string, number>;
  profile: ReactionProfilePoint[];
  warnings?: string[];
}

/** Coupled isothermal species balances, integrated in stoichiometric extent space. */
export function solvePackedBed(
  config: PackedBedConfig,
  chemicals: Chemical[],
  initial: Record<string, number>,
  temperature: number,
  inletPressure: number,
): PackedBedResult {
  const issues = packedBedIssues(config, chemicals);
  if (issues.length) throw new Error(issues.join(" "));
  if (
    !Number.isFinite(temperature) ||
    temperature < 250 ||
    temperature > 800 ||
    !Number.isFinite(inletPressure) ||
    inletPressure <= config.pressureDrop
  )
    throw new Error(
      "Require 250–800 K and a pressure drop smaller than inlet pressure.",
    );
  const ids = chemicals.map((c) => c.id);
  if (
    Object.keys(initial).some((id) => !ids.includes(id)) ||
    Object.values(initial).some((value) => !Number.isFinite(value) || value < 0)
  )
    throw new Error("The reactor inlet contains invalid component flows.");
  const reactions = config.reactions.filter((r) => r.enabled);
  const warnings: string[] = [];
  for (const reaction of reactions) {
    const source = reaction.kineticsSource;
    if (!source) continue;
    const [tMin, tMax] = source.temperatureRange;
    const [pMin, pMax] = source.pressureRange;
    if (temperature < tMin || temperature > tMax)
      warnings.push(
        `${reaction.name}: temperature is outside the published kinetics range (${tMin}–${tMax} K).`,
      );
    if (inletPressure > pMax || inletPressure - config.pressureDrop < pMin)
      warnings.push(
        `${reaction.name}: bed pressure is outside the published kinetics range (${pMin / 1e5}–${pMax / 1e5} bar absolute).`,
      );
  }
  const participating = new Set(
    reactions.flatMap((r) => r.stoichiometry.map((s) => s.componentId)),
  );
  // Inert inventory must not dilute the accuracy required for trace reactions.
  const flowScale = Math.max(
    1e-12,
    ...ids.filter((id) => participating.has(id)).map((id) => initial[id] ?? 0),
  );
  const scales = reactions.map(
    (r) =>
      flowScale /
      Math.max(...r.stoichiometry.map((s) => Math.abs(s.coefficient))),
  );
  const matrix = ids.map((id) =>
    reactions.map(
      (r, j) =>
        (r.stoichiometry.find((s) => s.componentId === id)?.coefficient ?? 0) *
        scales[j],
    ),
  );
  const basis = reactions.map(
    (r) =>
      -r.stoichiometry.find((s) => s.componentId === r.basisComponentId)!
        .coefficient,
  );
  const rates = reactions.map((r) =>
    compileRateLaw(reactionRateLaw(r), chemicals, true),
  );
  const flowsAt = (x: number[]) =>
    Object.fromEntries(
      ids.map((id, i) => [
        id,
        (initial[id] ?? 0) + matrix[i].reduce((sum, n, j) => sum + n * x[j], 0),
      ]),
    );
  const tolerance = flowScale * 2e-12;
  const feasible = (x: number[]) =>
    Object.values(flowsAt(x)).every(
      (n) => Number.isFinite(n) && n >= -tolerance,
    );
  const conversion = (x: number[]) => {
    const index = ids.indexOf(config.conversionComponentId);
    const feed = initial[config.conversionComponentId] ?? 0;
    return feed
      ? -matrix[index].reduce((sum, n, j) => sum + n * x[j], 0) / feed
      : 0;
  };
  const sizing = config.sizingMode === "target-conversion";
  if (sizing && !(initial[config.conversionComponentId] > 0))
    throw new Error(
      "Conversion sizing requires the selected reactant in the inlet.",
    );

  function integrate(mass: number, stopAtTarget: boolean) {
    const profile: ReactionProfilePoint[] = [];
    const pointAt = (x: number[], position: number): ReactionProfilePoint => ({
      catalystMass: position * mass,
      conversion: conversion(x),
      pressure: inletPressure - config.pressureDrop * position,
      flows: Object.fromEntries(
        Object.entries(flowsAt(x)).map(([id, n]) => [id, Math.max(0, n)]),
      ),
    });
    let lastSample = -1;
    const derivative = (x: number[], position: number): number[] | null => {
      if (!feasible(x)) return null;
      const flows = flowsAt(x);
      for (const id of ids) flows[id] = Math.max(0, flows[id]);
      const total = Object.values(flows).reduce((sum, n) => sum + n, 0);
      if (!total || !mass) return reactions.map(() => 0);
      const pressure = inletPressure - config.pressureDrop * position;
      const volumetricFlow =
        config.flowModel === "constant-flow"
          ? config.volumetricFlow
          : (total * 8.31446261815324 * temperature) / pressure;
      return rates.map((evaluate, j) => {
        const rate = evaluate({ flows, volumetricFlow, temperature, pressure });
        const value = (mass * rate) / basis[j] / scales[j];
        if (!Number.isFinite(value))
          throw new Error(
            `${reactions[j].name}: rate exceeds the numerical range.`,
          );
        return value;
      });
    };
    const integrated = integrateExtents(
      derivative,
      feasible,
      reactions.length,
      stopAtTarget ? (x) => conversion(x) - config.targetConversion : undefined,
      (x, position) => {
        if (position - lastSample >= 1 / 80) {
          profile.push(pointAt(x, position));
          lastSample = position;
        }
      },
    );
    const point = pointAt(integrated.x, integrated.position);
    if (lastSample !== integrated.position) profile.push(point);
    const extents = Object.fromEntries(config.reactions.map((r) => [r.id, 0]));
    reactions.forEach((r, j) => {
      extents[r.id] = integrated.x[j] * scales[j];
    });
    return {
      flows: point.flows,
      catalystMass: point.catalystMass,
      conversion: point.conversion,
      pressure: point.pressure,
      extents,
      profile,
      warnings,
      reachedTarget: integrated.reachedTarget,
    };
  }
  if (!sizing) return integrate(config.catalystMass, false);
  let low = 0,
    high = Math.max(1e-8, config.catalystMass || 1);
  for (let attempt = 0; attempt < 50 && high <= 1e9; attempt++) {
    const trial = integrate(high, true);
    if (trial.reachedTarget) {
      if (!config.pressureDrop) return trial;
      // The prescribed total drop spans the unknown bed; solve mass with that
      // full pressure profile, rather than adopting an intermediate pressure.
      for (let i = 0; i < 55 && high - low > 2e-10 * high; i++) {
        const mid = (low + high) / 2;
        if (integrate(mid, true).reachedTarget) high = mid;
        else low = mid;
      }
      const result = integrate(high, false);
      if (Math.abs(result.conversion - config.targetConversion) > 1e-7)
        throw new Error(
          "Target conversion could not be resolved at outlet pressure.",
        );
      return result;
    }
    low = high;
    high *= 4;
  }
  throw new Error(
    "Target conversion is unreachable within the catalyst-mass range. Check equilibrium, rate units and feed availability.",
  );
}

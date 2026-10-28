export interface BedPoint {
  catalystMass: number;
  conversion: number;
}

/**
 * Isothermal A -> B with equal molar stoichiometry and no pressure drop.
 * k is m3/(kg-cat s), F is mol/s and W is kg-cat:
 * dFA/dW = -k CA = -k P FA / (F R T).
 * Integrating conversion in the dimensionless coordinate
 * u = k P W/(F R T) keeps the numerical step independent of physical units.
 */
export function integratePackedBed({
  catalystMass,
  rateConstant,
  totalFlow,
  temperature,
  pressure,
}: {
  catalystMass: number;
  rateConstant: number;
  totalFlow: number;
  temperature: number;
  pressure: number;
}): { conversion: number; profile: BedPoint[] } {
  if (
    ![catalystMass, rateConstant, totalFlow, temperature, pressure].every(
      Number.isFinite,
    ) ||
    catalystMass < 0 ||
    rateConstant < 0 ||
    totalFlow < 0 ||
    temperature <= 0 ||
    pressure <= 0
  )
    throw new Error("Invalid packed-bed integration inputs.");

  const coefficient = totalFlow
    ? (rateConstant * pressure) / (totalFlow * 8.314462618 * temperature)
    : 0;
  let coordinate = 0;
  let conversion = 0;
  const profile: BedPoint[] = [{ catalystMass: 0, conversion: 0 }];
  for (let sample = 1; sample <= 40; sample++) {
    const mass = (sample / 40) * catalystMass;
    const target = Math.min(coefficient * mass, 36);
    // Integrate dX/du = 1-X directly so very small conversions do not suffer
    // cancellation from subtracting a remaining fraction near one.
    // Classical RK4 has a bounded step inside its positive stable region.
    // At u=36 the analytic remaining fraction is about one machine epsilon.
    while (coordinate < target) {
      const step = Math.min(0.02, target - coordinate);
      const k1 = 1 - conversion;
      const k2 = 1 - (conversion + (step * k1) / 2);
      const k3 = 1 - (conversion + (step * k2) / 2);
      const k4 = 1 - (conversion + step * k3);
      conversion = Math.min(
        1,
        conversion + (step * (k1 + 2 * k2 + 2 * k3 + k4)) / 6,
      );
      coordinate += step;
    }
    profile.push({ catalystMass: mass, conversion });
  }
  return { conversion: profile.at(-1)!.conversion, profile };
}

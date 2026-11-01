import type { Point } from "./operation";

/** Illustrative downflow vessel, not a dimensioned reactor design. Real catalyst
 * is commonly 1–5 mm; these grains remain enlarged enough to inspect on screen.
 * Shell, packing, distributor bores and liquid share the same coordinates.
 * References:
 * https://encyclopedia.che.engin.umich.edu/packed-bed-reactors/
 * https://johnsonscreens.com/wp-content/uploads/2022/08/Internals-for-Down-Flow-Reactor_Eng.pdf
 * https://www.norpro.saint-gobain.com/news/tools-help-optimize-selection-denstoner-bed-support-media
 */
export const packedBedLayout = {
  shellRadius: 0.66,
  bedRadius: 0.601,
  pelletRadius: 0.013,
  beds: [
    { support: 1.12, bottom: 1.235, top: 1.94, distributor: 2.1 },
    { support: 2.22, bottom: 2.335, top: 3.04, distributor: 3.2 },
  ],
  collector: 0.82,
} as const;

export const packingRandom = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

// Staggered bores cover the cross section instead of feeding only its front edge.
export const distributorBores: { x: number; z: number; radius: number }[] = [];
for (let row = -3; row <= 3; row++) {
  for (let col = -3; col <= 3; col++) {
    const x = (col + (Math.abs(row) % 2) * 0.5) * 0.155;
    const z = row * 0.134;
    if (Math.hypot(x, z) < 0.535)
      distributorBores.push({ x, z, radius: 0.015 });
  }
}

/** Thin, gravity-driven paths, with gentle lateral deviations at grain scale.
 * These illustrate wetting; they do not claim to solve pore-scale hydraulics. */
export function bedRivulets(bedIndex: number): Point[][] {
  const bed = packedBedLayout.beds[bedIndex];
  const seeds = [
    ...distributorBores,
    ...Array.from({ length: 20 }, (_, i) => {
      const angle =
        ((i + (packingRandom(i + 117) - 0.5) * 0.5) / 20) * Math.PI * 2;
      return { x: Math.cos(angle) * 0.592, z: Math.sin(angle) * 0.592 };
    }),
  ];
  return seeds.map(({ x, z }, i) =>
    Array.from({ length: 33 }, (_, step): Point => {
      const seed = i * 181 + step * 13 + bedIndex * 7919;
      const taper = Math.sin((step / 32) * Math.PI);
      // The visible outer films follow the grain envelope, with most of their
      // meander tangential to the bed. They never run down the vessel exterior.
      const outer = i >= distributorBores.length;
      const lane = i - distributorBores.length;
      const sourceAngle = Math.atan2(z, x);
      const mergeAngle = ((Math.floor(lane / 2) * 2 + 0.5) / 20) * Math.PI * 2;
      const turn = Math.atan2(
        Math.sin(mergeAngle - sourceAngle),
        Math.cos(mergeAngle - sourceAngle),
      );
      const angle =
        sourceAngle +
        turn * (step / 32) +
        (Math.sin(step * 0.8 + i * 2.4) * 0.035 +
          (packingRandom(seed) - 0.5) * 0.022) *
          taper;
      const radius = 0.592 + (packingRandom(seed + 71) - 0.5) * 0.002 * taper;
      return [
        outer
          ? Math.cos(angle) * radius
          : x + (packingRandom(seed) - 0.5) * 0.018 * taper,
        bed.top + 0.025 - (step / 32) * (bed.top + 0.025 - bed.support),
        outer
          ? Math.sin(angle) * radius
          : z + (packingRandom(seed + 71) - 0.5) * 0.018 * taper,
      ];
    }),
  );
}

/** Local films gather beneath the support into fuller streams and independent
 * pendant drops, like the underside of a bottomless coffee basket. */
export function bedDrainage(bedIndex: number) {
  const bed = packedBedLayout.beds[bedIndex];
  const lower =
    bedIndex === 1
      ? packedBedLayout.beds[0].distributor + 0.014
      : packedBedLayout.collector;
  const height = bed.support - lower;
  const branches: Point[][] = [];
  const streams: Point[][] = [];
  const drips: Point[][] = [];
  for (let cluster = 0; cluster < 3; cluster++) {
    const angle = (cluster * Math.PI * 2) / 3 + bedIndex * 0.65 + 0.4;
    const x = Math.cos(angle) * (cluster === 0 ? 0.18 : 0.34);
    const z = Math.sin(angle) * (cluster === 0 ? 0.18 : 0.34);
    const join: Point = [x, bed.support - height * 0.38, z];
    for (let branch = 0; branch < 4; branch++) {
      const a = (branch * Math.PI) / 2 + angle;
      const dx = Math.cos(a) * 0.075;
      const dz = Math.sin(a) * 0.075;
      branches.push([
        [x + dx, bed.support - 0.008, z + dz],
        [x + dx * 0.7, bed.support - height * 0.17, z + dz * 0.7],
        join,
      ]);
    }
    streams.push([
      join,
      [x + 0.008, lower + height * 0.24, z - 0.006],
      [x + 0.012, lower, z - 0.008],
    ]);
  }
  for (let i = 0; i < 11; i++) {
    const a = ((i + packingRandom(i + 41) * 0.6) * Math.PI * 2) / 11;
    const radius = 0.45 + packingRandom(i + 87) * 0.11;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    drips.push([
      [x, bed.support - 0.01, z],
      [x + 0.006, lower, z - 0.004],
    ]);
  }
  return { branches, streams, drips };
}

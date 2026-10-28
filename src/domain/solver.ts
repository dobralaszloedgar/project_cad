import {
  projectSchema,
  validateGraph,
  type Project,
  type Unit,
  type Connection,
} from "./schema";
// Original synthetic teaching parameters; no claim to fit a real chemical system.
export const MODEL = {
  cp: 30,
  molecularWeight: 0.028,
  reactionEnthalpy: -20000,
  kRef: 0.1,
  tRef: 450,
  activationEnergy: 40000,
  R: 8.314462618,
  referenceTemperature: 298.15,
} as const;
export interface Stream {
  a: number;
  b: number;
  temperature: number;
  pressure: number;
}
export interface EquipmentResult {
  duty: number;
  conversion?: number;
  extent: number;
}
export interface Result {
  streams: Record<string, Stream>;
  equipment: Record<string, EquipmentResult>;
  converged: boolean;
  iterations: number;
  residual: number;
  history: number[];
  massResidual: number;
  energyResidual: number;
  conversion: number;
  heatDuty: number;
  warnings: string[];
  tearId?: string;
}
export const flow = (s: Stream) => s.a + s.b;
export const enthalpy = (s: Stream) =>
  flow(s) * MODEL.cp * (s.temperature - MODEL.referenceTemperature) +
  s.b * MODEL.reactionEnthalpy;
export const volume = (s: Stream) =>
  (flow(s) * MODEL.R * s.temperature) / s.pressure;
export const rate = (t: number) =>
  MODEL.kRef *
  Math.exp((-MODEL.activationEnergy / MODEL.R) * (1 / t - 1 / MODEL.tRef));
const scale = (s: Stream, f: number): Stream => ({
  ...s,
  a: s.a * f,
  b: s.b * f,
});
export function operate(
  unit: Unit,
  inputs: Stream[],
): { outputs: Stream[]; result: EquipmentResult } {
  const p = unit.params;
  const result: EquipmentResult = { duty: 0, extent: 0 };
  if (unit.kind === "Feed")
    return {
      outputs: [
        {
          a: p.flow * p.fractionA,
          b: p.flow * (1 - p.fractionA),
          temperature: p.temperature,
          pressure: p.pressure,
        },
      ],
      result,
    };
  if (!inputs.length) throw new Error(`${unit.name}: missing inlet.`);
  const total = inputs.reduce((s, n) => s + flow(n), 0);
  const mixed: Stream = {
    a: inputs.reduce((s, n) => s + n.a, 0),
    b: inputs.reduce((s, n) => s + n.b, 0),
    temperature: total
      ? inputs.reduce((s, n) => s + flow(n) * n.temperature, 0) / total
      : inputs[0].temperature,
    pressure: Math.min(...inputs.map((s) => s.pressure)),
  };
  let outputs: Stream[] = [mixed];
  switch (unit.kind) {
    case "Product":
      outputs = [];
      break;
    case "Mixer":
      break;
    case "Heater":
    case "Cooler":
      if (unit.kind === "Heater" && p.temperature < mixed.temperature - 1e-7)
        throw new Error(
          `${unit.name}: heater target is below inlet temperature.`,
        );
      if (unit.kind === "Cooler" && p.temperature > mixed.temperature + 1e-7)
        throw new Error(
          `${unit.name}: cooler target is above inlet temperature.`,
        );
      outputs = [{ ...mixed, temperature: p.temperature }];
      result.duty = enthalpy(outputs[0]) - enthalpy(mixed);
      break;
    case "PBR": {
      const conversion = -Math.expm1(-rate(p.temperature) * p.residenceTime);
      const extent = mixed.a * conversion;
      outputs = [
        {
          ...mixed,
          a: mixed.a - extent,
          b: mixed.b + extent,
          temperature: p.temperature,
        },
      ];
      result.extent = extent;
      result.conversion = conversion;
      result.duty = enthalpy(outputs[0]) - enthalpy(mixed);
      break;
    }
    case "Splitter":
      outputs = [
        scale(mixed, 1 - p.recycleFraction),
        scale(mixed, p.recycleFraction),
      ];
      break;
    case "Distillation": {
      // One ideal equilibrium contact: y=alpha*x/(1+(alpha-1)*x), z=d*y+(1-d)*x.
      // Fixed distillate cut; no stages, latent heat, condenser or reboiler prediction.
      const z = total ? mixed.a / total : 0;
      const d = p.distillateFraction,
        alpha = p.relativeVolatility;
      let low = 0,
        high = 1;
      for (let i = 0; i < 80; i++) {
        const x = (low + high) / 2,
          y = (alpha * x) / (1 + (alpha - 1) * x);
        if (d * y + (1 - d) * x > z) high = x;
        else low = x;
      }
      const x = (low + high) / 2;
      const bottomA = total * (1 - d) * x;
      const topA = mixed.a - bottomA;
      outputs = [
        { ...mixed, a: Math.max(0, topA), b: Math.max(0, total * d - topA) },
        { ...mixed, a: bottomA, b: Math.max(0, total * (1 - d) - bottomA) },
      ];
      break;
    }
  }
  for (const s of outputs)
    if (!Object.values(s).every(Number.isFinite) || s.a < 0 || s.b < 0)
      throw new Error("Nonphysical numerical result.");
  return { outputs, result };
}
function order(project: Project, tear?: Connection): Unit[] | null {
  const pending = new Set(project.units.map((n) => n.id)),
    sorted: Unit[] = [];
  while (pending.size) {
    const n = project.units.find(
      (n) =>
        pending.has(n.id) &&
        project.edges
          .filter((e) => e.target === n.id && e.id !== tear?.id)
          .every((e) => !pending.has(e.source)),
    );
    if (!n) return null;
    sorted.push(n);
    pending.delete(n.id);
  }
  return sorted;
}
export function simulate(
  raw: Project,
  options: { maxIterations?: number; tolerance?: number } = {},
): Result {
  const project = projectSchema.parse(raw);
  const errors = validateGraph(project, true);
  if (errors.length) throw new Error(errors.join(" "));
  let sorted = order(project),
    tear: Connection | undefined;
  if (!sorted) {
    tear = project.edges.find(
      (e) =>
        project.units.find((n) => n.id === e.target)?.kind === "Mixer" &&
        order(project, e),
    );
    if (!tear)
      throw new Error(
        "Only one recycle loop, returning to a mixer, is supported.",
      );
    sorted = order(project, tear)!;
  }
  let guess: Stream = { a: 0, b: 0, temperature: 300, pressure: 101325 };
  let streams: Record<string, Stream> = {},
    equipment: Record<string, EquipmentResult> = {};
  const history: number[] = [];
  let converged = !tear;
  const tolerance = options.tolerance ?? 1e-9;
  const maxIterations = options.maxIterations ?? 500;
  if (
    maxIterations < 1 ||
    !Number.isInteger(maxIterations) ||
    maxIterations > 2000 ||
    !Number.isFinite(tolerance) ||
    tolerance <= 0
  )
    throw new Error("Invalid solver controls.");
  for (let iteration = 0; iteration < (tear ? maxIterations : 1); iteration++) {
    streams = {};
    equipment = {};
    for (const n of sorted) {
      const incoming = project.edges
        .filter((e) => e.target === n.id)
        .map((e) => (e.id === tear?.id ? guess : streams[e.id]));
      const op = operate(n, incoming);
      equipment[n.id] = op.result;
      for (const e of project.edges.filter((e) => e.source === n.id))
        streams[e.id] = op.outputs[e.sourcePort === "out2" ? 1 : 0];
    }
    if (!tear) break;
    const actual = streams[tear.id];
    const residual = Math.max(
      Math.abs(actual.a - guess.a) / Math.max(1, actual.a),
      Math.abs(actual.b - guess.b) / Math.max(1, actual.b),
      Math.abs(actual.temperature - guess.temperature) /
        Math.max(1, actual.temperature),
      Math.abs(actual.pressure - guess.pressure) / Math.max(1, actual.pressure),
    );
    history.push(residual);
    if (residual < tolerance) {
      converged = true;
      break;
    }
    guess = actual;
  }
  const feeds = project.units
    .filter((n) => n.kind === "Feed")
    .map((n) => operate(n, []).outputs[0]);
  const products = project.edges
    .filter(
      (e) => project.units.find((n) => n.id === e.target)?.kind === "Product",
    )
    .map((e) => streams[e.id]);
  const sum = (a: Stream[], fn: (s: Stream) => number) =>
    a.reduce((s, n) => s + fn(n), 0);
  const heatDuty = Object.values(equipment).reduce((s, n) => s + n.duty, 0);
  const feedA = sum(feeds, (s) => s.a);
  const result: Result = {
    streams,
    equipment,
    converged,
    iterations: tear ? history.length : 1,
    residual: history.at(-1) ?? 0,
    history,
    massResidual:
      (sum(products, flow) - sum(feeds, flow)) * MODEL.molecularWeight,
    energyResidual: sum(products, enthalpy) - sum(feeds, enthalpy) - heatDuty,
    conversion: feedA ? (feedA - sum(products, (s) => s.a)) / feedA : 0,
    heatDuty,
    warnings: [
      "Synthetic A/B species; equal 28 g/mol molecular weight and constant 30 J/(mol·K) heat capacity.",
      "Isothermal first-order PBR surrogate; no catalyst transport, pressure drop or mechanical design.",
    ],
    tearId: tear?.id,
  };
  if (project.units.some((n) => n.kind === "Splitter"))
    result.warnings.push(
      "A splitter recycles both A and B in equal proportions; it does not selectively recover unreacted A.",
    );
  if (project.units.some((n) => n.kind === "Distillation"))
    result.warnings.push(
      "Distillation is one ideal equilibrium contact at fixed cut and constant relative volatility. No stage count, latent heat or reboiler/condenser duties.",
    );
  if (!converged)
    result.warnings.unshift(
      "Recycle did not converge. Values are the final iterate, not a validated steady state.",
    );
  return result;
}

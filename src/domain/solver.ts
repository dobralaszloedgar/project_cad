import {
  projectSchema,
  unitSchema,
  validateGraph,
  type Project,
  type Unit,
  type Connection,
} from "./schema";
import {
  evaluateProperties,
  flashPressureEnthalpy,
  provenance,
  type Properties,
} from "./thermo";
import { defaultThermo, type ThermoSettings } from "./thermo/registry";
import { thermoContext } from "./thermo/catalog";
import { integratePackedBed, type BedPoint } from "./equipment/packed-bed";
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
  // Preserves a PH-resolved phase amount, including pure-component saturation.
  vaporFraction?: number;
}
export interface EquipmentResult {
  duty: number;
  conversion?: number;
  extent: number;
  profile?: BedPoint[];
}
export interface Result {
  properties: Record<string, Properties>;
  provenance: ReturnType<typeof provenance>;
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
function validateStream(s: Stream) {
  if (
    !s ||
    ![s.a, s.b, s.temperature, s.pressure].every(Number.isFinite) ||
    s.a < 0 ||
    s.b < 0 ||
    s.temperature < 250 ||
    s.temperature > 800 ||
    s.pressure <= 0
  )
    throw new Error(
      "Nonphysical stream: require nonnegative finite flows, 250–800 K and positive pressure.",
    );
}
export function streamProperties(
  s: Stream,
  settings: ThermoSettings = defaultThermo,
): Properties {
  validateStream(s);
  if (flow(s) === 0)
    return {
      temperature: s.temperature,
      phase: "empty",
      vaporFraction: null,
      liquidComposition: null,
      vaporComposition: null,
      kValues: null,
      activityCoefficients: [],
      saturationPressures: null,
      partialPressures: null,
      molarEnthalpy: null,
      gasMolarVolume: null,
      molecularWeight: 0,
      iterations: 0,
      equilibriumResidual: 0,
      componentResidual: 0,
      enthalpyResidual: null,
      warnings: ["Zero flow: composition and phase are undefined."],
    };
  return evaluateProperties(
    s.temperature,
    s.pressure,
    [s.a / flow(s), s.b / flow(s)],
    settings,
    undefined,
    undefined,
    s.vaporFraction,
  );
}
export function enthalpy(
  s: Stream,
  settings: ThermoSettings = defaultThermo,
): number {
  validateStream(s);
  if (flow(s) === 0) return 0;
  const h = streamProperties(s, settings).molarEnthalpy;
  if (h === null)
    throw new Error(
      "Phase amount is indeterminate at saturation; specify a nonsaturated state.",
    );
  return flow(s) * h;
}
export function volume(s: Stream, settings: ThermoSettings = defaultThermo) {
  validateStream(s);
  if (flow(s) === 0) return 0;
  const molarVolume = streamProperties(s, settings).gasMolarVolume;
  return molarVolume === null ? null : flow(s) * molarVolume;
}
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
  settings: ThermoSettings = defaultThermo,
): { outputs: Stream[]; result: EquipmentResult } {
  unit = unitSchema.parse(unit);
  const p = unit.params;
  const result: EquipmentResult = { duty: 0, extent: 0 };
  const maxInlets =
    unit.kind === "Feed" ? 0 : unit.kind === "Mixer" ? Infinity : 1;
  if (inputs.length > maxInlets)
    throw new Error(`${unit.name}: too many material inlets.`);
  // The exported evaluator uses the same selected-model validity checks as
  // a complete flowsheet, including for pass-through units and splitters.
  inputs.forEach((input) => streamProperties(input, settings));
  if (unit.kind === "Feed") {
    const stream = {
      a: p.flow * p.fractionA,
      b: p.flow * (1 - p.fractionA),
      temperature: p.temperature,
      pressure: p.pressure,
    };
    streamProperties(stream, settings);
    return {
      outputs: [stream],
      result,
    };
  }
  if (!inputs.length) throw new Error(`${unit.name}: missing inlet.`);
  // A zero-flow recycle guess has no pressure or enthalpy contribution.
  const flowing = inputs.filter((s) => flow(s) > 0);
  if (flowing.length) inputs = flowing;
  const total = inputs.reduce((s, n) => s + flow(n), 0);
  const mixed: Stream = {
    ...(inputs.length === 1 ? inputs[0] : {}),
    a: inputs.reduce((s, n) => s + n.a, 0),
    b: inputs.reduce((s, n) => s + n.b, 0),
    temperature: total
      ? inputs.reduce((s, n) => s + flow(n) * n.temperature, 0) / total
      : inputs[0].temperature,
    pressure: Math.min(...inputs.map((s) => s.pressure)),
  };
  if (inputs.length > 1 && total > 0) {
    const target = inputs.reduce((sum, s) => sum + enthalpy(s, settings), 0);
    const state = flashPressureEnthalpy(
      mixed.pressure,
      target / total,
      [mixed.a / total, mixed.b / total],
      settings,
    );
    mixed.temperature = state.temperature;
    if (settings.modelId !== "ideal-gas")
      mixed.vaporFraction = state.vaporFraction!;
  }
  let outputs: Stream[] = [mixed];
  switch (unit.kind) {
    case "Product":
      outputs = [];
      break;
    case "Mixer":
      break;
    case "Heater":
    case "Cooler": {
      let target = p.temperature;
      if (p.thermalMode === "duty") {
        if (settings.modelId !== "ideal-gas")
          throw new Error(
            `${unit.name}: specified duty supports the ideal-gas model only; select an outlet temperature for liquid models.`,
          );
        if (
          (unit.kind === "Heater" && p.heatDuty < 0) ||
          (unit.kind === "Cooler" && p.heatDuty > 0)
        )
          throw new Error(
            `${unit.name}: heater duty must be nonnegative and cooler duty nonpositive.`,
          );
        if (!total && p.heatDuty !== 0)
          throw new Error(`${unit.name}: nonzero duty requires material flow.`);
        if (total) {
          target = flashPressureEnthalpy(
            mixed.pressure,
            (enthalpy(mixed, settings) + p.heatDuty) / total,
            [mixed.a / total, mixed.b / total],
            settings,
          ).temperature;
        } else {
          target = mixed.temperature;
        }
      }
      if (unit.kind === "Heater" && target < mixed.temperature - 1e-7)
        throw new Error(
          `${unit.name}: heater target is below inlet temperature.`,
        );
      if (unit.kind === "Cooler" && target > mixed.temperature + 1e-7)
        throw new Error(
          `${unit.name}: cooler target is above inlet temperature.`,
        );
      outputs = [
        {
          a: mixed.a,
          b: mixed.b,
          pressure: mixed.pressure,
          temperature: target,
        },
      ];
      validateStream(outputs[0]);
      result.duty = enthalpy(outputs[0], settings) - enthalpy(mixed, settings);
      if (
        (unit.kind === "Heater" && result.duty < -1e-7) ||
        (unit.kind === "Cooler" && result.duty > 1e-7)
      )
        throw new Error(
          `${unit.name}: calculated duty has the wrong sign for this equipment.`,
        );
      break;
    }
    case "PBR": {
      if (settings.mixture !== "demo" || settings.modelId !== "ideal-gas")
        throw new Error(
          "The sample PBR reaction supports synthetic A/B with the ideal-gas model only.",
        );
      let conversion = mixed.a
        ? -Math.expm1(-rate(p.temperature) * p.residenceTime)
        : 0;
      if (p.reactorMode === "catalyst-weight") {
        const bed = integratePackedBed({
          catalystMass: p.catalystMass,
          rateConstant:
            p.catalystRateConstant *
            Math.exp(
              (-MODEL.activationEnergy / MODEL.R) *
                (1 / p.temperature - 1 / MODEL.tRef),
            ),
          totalFlow: total,
          temperature: p.temperature,
          pressure: mixed.pressure,
        });
        conversion = mixed.a ? bed.conversion : 0;
        result.profile = mixed.a
          ? bed.profile
          : bed.profile.map((point) => ({ ...point, conversion: 0 }));
      }
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
      result.duty = enthalpy(outputs[0], settings) - enthalpy(mixed, settings);
      break;
    }
    case "Splitter":
      outputs = [
        scale(mixed, 1 - p.recycleFraction),
        scale(mixed, p.recycleFraction),
      ];
      break;
    case "Distillation": {
      if (settings.modelId !== "ideal-gas") {
        const props = streamProperties(mixed, settings);
        const beta = props.vaporFraction;
        if (total === 0) {
          outputs = [scale(mixed, 0), scale(mixed, 0)];
          break;
        }
        if (beta === null)
          throw new Error(
            "TP alone does not determine the saturated phase split.",
          );
        const vaporA = total * beta * (props.vaporComposition?.[0] ?? 0);
        const vaporB = total * beta * (props.vaporComposition?.[1] ?? 0);
        outputs = [
          { ...mixed, a: vaporA, b: vaporB, vaporFraction: 1 },
          {
            ...mixed,
            a: Math.max(0, mixed.a - vaporA),
            b: Math.max(0, mixed.b - vaporB),
            vaporFraction: 0,
          },
        ];
        for (const [index, output] of outputs.entries()) {
          if (
            flow(output) > 0 &&
            streamProperties(output, settings).phase !==
              (index === 0 ? "vapor" : "liquid")
          )
            throw new Error(
              "The separated outlet phase is not supported at these conditions by the sample equilibrium model.",
            );
        }
        const phaseEnergyResidual =
          outputs.reduce((sum, s) => sum + enthalpy(s, settings), 0) -
          enthalpy(mixed, settings);
        if (
          Math.abs(phaseEnergyResidual) >
          1e-7 * Math.max(1, Math.abs(enthalpy(mixed, settings)))
        )
          throw new Error(
            "The separated equilibrium phases do not close the energy balance in this sample model.",
          );
        // An equilibrium phase separator at inlet T/P adds no heat. Do not
        // disguise a failed phase calculation as a condenser or reboiler duty.
        result.duty = 0;
        break;
      }
      // One ideal equilibrium contact: y=alpha*x/(1+(alpha-1)*x), z=d*y+(1-d)*x.
      // Fixed distillate cut; no stages, latent heat, condenser or reboiler prediction.
      const z = total ? mixed.a / total : 0;
      const d = p.distillateFraction,
        alpha = p.relativeVolatility;
      if (mixed.a === 0 || mixed.b === 0) {
        // Pure-component endpoints are exact; numerical bisection must not
        // manufacture a trace of an absent component.
        outputs = [scale(mixed, d), scale(mixed, 1 - d)];
        break;
      }
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
  outputs.forEach(validateStream);
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
  const settings = project.thermo ?? defaultThermo;
  if (settings.modelId !== "ideal-gas" && settings.mixture === "demo")
    throw new Error(
      "Choose a real sample mixture for the liquid-solution models; synthetic A/B has no vapor-pressure or group data.",
    );
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
      const op = operate(n, incoming, settings);
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
      Math.abs((actual.vaporFraction ?? 0) - (guess.vaporFraction ?? 0)),
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
    .map((n) => operate(n, [], settings).outputs[0]);
  const products = project.edges
    .filter(
      (e) => project.units.find((n) => n.id === e.target)?.kind === "Product",
    )
    .map((e) => streams[e.id]);
  const sum = (a: Stream[], fn: (s: Stream) => number) =>
    a.reduce((s, n) => s + fn(n), 0);
  const heatDuty = Object.values(equipment).reduce((s, n) => s + n.duty, 0);
  const feedA = sum(feeds, (s) => s.a);
  const properties = Object.fromEntries(
    Object.entries(streams).map(([id, s]) => [
      id,
      streamProperties(s, settings),
    ]),
  );
  const context = thermoContext(settings);
  const [chemicalA, chemicalB] = context.ids.map((id) =>
    context.catalog.get(id),
  );
  const mass = (s: Stream) =>
    s.a * chemicalA.molecularWeight + s.b * chemicalB.molecularWeight;
  const h = (s: Stream) => enthalpy(s, settings);
  const result: Result = {
    properties,
    provenance: provenance(settings),
    streams,
    equipment,
    converged,
    iterations: tear ? history.length : 1,
    residual: history.at(-1) ?? 0,
    history,
    massResidual: sum(products, mass) - sum(feeds, mass),
    energyResidual: sum(products, h) - sum(feeds, h) - heatDuty,
    conversion: feedA ? (feedA - sum(products, (s) => s.a)) / feedA : 0,
    heatDuty,
    warnings:
      settings.mixture === "demo"
        ? [
            "Synthetic A/B species; equal 28 g/mol molecular weight and constant 30 J/(mol·K) heat capacity.",
          ]
        : [...new Set(Object.values(properties).flatMap((p) => p.warnings))],
    tearId: tear?.id,
  };
  if (project.units.some((n) => n.kind === "PBR"))
    result.warnings.push(
      "Isothermal first-order synthetic A → B; no catalyst transport, pressure drop, reversible kinetics or mechanical design. Catalyst-weight and residence-time modes use distinct rate-constant units.",
    );
  if (project.units.some((n) => n.kind === "Splitter"))
    result.warnings.push(
      "A splitter divides both components in the same proportions; it does not selectively separate chemicals.",
    );
  if (project.units.some((n) => n.kind === "Distillation"))
    result.warnings.push(
      settings.modelId === "ideal-gas"
        ? "Distillation is one ideal equilibrium contact at fixed cut and constant relative volatility. No stage count, latent heat or reboiler/condenser duties."
        : "Distillation is a single TP equilibrium flash at feed temperature and pressure. No stage count, reflux or column design; outlet phase amounts come from the selected model.",
    );
  if (!converged)
    result.warnings.unshift(
      "Recycle did not converge. Values are the final iterate, not a validated steady state.",
    );
  return result;
}

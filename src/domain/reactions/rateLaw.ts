import type { Chemical as ChemicalComponent } from "../thermo/data";
import type { RateLaw, RateVariable } from "./rateLawSchema";
import { compileRateExpression, reservedRateSymbols } from "./rateExpression";
import { rateLawSchema } from "./rateLawSchema";

export const basisOptions: {
  value: RateVariable["basis"];
  label: string;
  units: RateVariable["unit"][];
}[] = [
  {
    value: "concentration",
    label: "Molar concentration",
    units: ["mol/m3", "mol/L", "kmol/m3"],
  },
  {
    value: "partial-pressure",
    label: "Partial pressure",
    units: ["Pa", "kPa", "bar", "atm"],
  },
  { value: "mole-fraction", label: "Mole fraction", units: ["1"] },
  {
    value: "mass-concentration",
    label: "Mass concentration",
    units: ["kg/m3", "g/L"],
  },
  { value: "mass-fraction", label: "Mass fraction", units: ["1"] },
];
export const displayUnit = (unit: string) =>
  unit.replaceAll("m3", "m³").replaceAll("*", "·");
const factorText = (factor: RateLaw["forward"][number]) =>
  factor.order === 1 ? factor.variable : `${factor.variable}^(${factor.order})`;
export function rateFormula(law: RateLaw) {
  if (law.mode === "custom") return law.expression;
  const product = (name: string, factors: RateLaw["forward"]) =>
    [name, ...factors.filter((f) => f.order !== 0).map(factorText)].join(" * ");
  const numerator =
    product("kf", law.forward) +
    (law.reversible ? ` - ${product("kr", law.reverse)}` : "");
  return law.adsorption.length
    ? `(${numerator}) / (1 + ${law.adsorption.map((a) => `${a.parameter} * ${factorText(a)}`).join(" + ")})^(${law.denominatorPower})`
    : numerator;
}
export function ratePreview(law: RateLaw, components: ChemicalComponent[]) {
  const labels = Object.fromEntries(
    law.variables.map((v) => {
      const name =
        components.find((c) => c.id === v.componentId)?.name ?? v.componentId;
      const prefix = {
        concentration: "C",
        "partial-pressure": "p",
        "mole-fraction": "x",
        "mass-concentration": "ρ",
        "mass-fraction": "w",
      }[v.basis];
      return [v.symbol, `${prefix}[${name}]`];
    }),
  );
  return rateFormula(law)
    .replace(/\b[A-Za-z][A-Za-z0-9_]*\b/g, (s) =>
      Object.hasOwn(labels, s) ? labels[s] : s,
    )
    .replaceAll(" * ", " × ");
}
export function defaultRateLaw(
  componentId: string,
  packed: boolean,
  rate = 1,
  order = 1,
): RateLaw {
  return {
    mode: "table",
    phase: "gas",
    rateUnit: packed ? "mol/(kg*s)" : "mol/(m3*s)",
    variables: [
      { symbol: "a", componentId, basis: "concentration", unit: "mol/m3" },
    ],
    parameters: [
      { symbol: "kf", value: rate },
      { symbol: "kr", value: 0 },
    ],
    forward: [{ variable: "a", order }],
    reversible: false,
    reverse: [],
    adsorption: [],
    denominatorPower: 1,
    expression: "",
  };
}
export function rateLawIssues(
  law: RateLaw,
  componentIds: string[],
  packed: boolean,
): string[] {
  const parsed = rateLawSchema.safeParse(law);
  if (!parsed.success)
    return parsed.error.issues.map(
      (issue) => `${issue.path.join(" → ")}: ${issue.message}`,
    );
  const errors: string[] = [];
  const names = [...law.variables, ...law.parameters].map((v) => v.symbol);
  if (new Set(names).size !== names.length)
    errors.push("Every species and parameter needs a unique symbol.");
  for (const name of names)
    if (reservedRateSymbols.has(name))
      errors.push(`${name} is reserved. Choose another symbol.`);
  if (packed !== law.rateUnit.includes("kg"))
    errors.push(
      packed
        ? "Choose a rate per kg of catalyst for a packed bed."
        : "Choose a rate per reactor volume for a CSTR or PFR.",
    );
  for (const v of law.variables) {
    if (!componentIds.includes(v.componentId))
      errors.push(`${v.symbol}: select a species in this project.`);
    if (!basisOptions.find((b) => b.value === v.basis)?.units.includes(v.unit))
      errors.push(`${v.symbol}: choose units matching its basis.`);
    if (v.basis === "partial-pressure" && law.phase !== "gas")
      errors.push(`${v.symbol}: partial pressure requires the gas phase.`);
  }
  for (const p of law.parameters)
    if (p.activationEnergy !== undefined && !p.referenceTemperature)
      errors.push(
        `${p.symbol}: enter a positive reference temperature for Arrhenius scaling.`,
      );
  if (law.mode === "table") {
    for (const f of [
      ...law.forward,
      ...(law.reversible ? law.reverse : []),
      ...law.adsorption,
    ])
      if (!law.variables.some((v) => v.symbol === f.variable))
        errors.push(`Select a species for term “${f.variable}”.`);
    for (const name of [
      "kf",
      ...(law.reversible ? ["kr"] : []),
      ...law.adsorption.map((a) => a.parameter),
    ]) {
      const p = law.parameters.find((p) => p.symbol === name);
      if (!p) errors.push(`Add parameter ${name}.`);
      else if (p.value < 0)
        errors.push(`${name} must be nonnegative in the table builder.`);
    }
  }
  try {
    compileRateExpression(rateFormula(law), names);
  } catch (e) {
    errors.push((e as Error).message);
  }
  return [...new Set(errors)];
}
export function parameterUnit(law: RateLaw, name: string) {
  const unitProduct = (factors: RateLaw["forward"]) =>
    factors
      .filter((f) => f.order !== 0)
      .map((f) => {
        const unit = law.variables.find((v) => v.symbol === f.variable)?.unit;
        return unit && unit !== "1" ? `(${displayUnit(unit)})^${f.order}` : "";
      })
      .filter(Boolean)
      .join(" · ");
  if (law.mode === "custom") return "units consistent with the expression";
  const adsorption = law.adsorption.find((a) => a.parameter === name);
  const denominator = unitProduct(
    adsorption
      ? [adsorption]
      : name === "kf"
        ? law.forward
        : name === "kr"
          ? law.reverse
          : [],
  );
  return `${adsorption ? "1" : displayUnit(law.rateUnit)}${denominator ? ` / (${denominator})` : ""}`;
}
export interface RateState {
  flows: Record<string, number>;
  volumetricFlow: number;
  temperature: number;
  pressure: number;
}
export function rateVariableValues(
  law: RateLaw,
  components: ChemicalComponent[],
  state: RateState,
) {
  const total = Object.values(state.flows).reduce((s, n) => s + n, 0);
  // Concentration/pressure laws do not use mass data. This runs at every ODE
  // stage, so avoid allocating an entire component table for those laws.
  const needsMass = law.variables.some(
    (v) => v.basis === "mass-concentration" || v.basis === "mass-fraction",
  );
  const masses = needsMass
    ? Object.fromEntries(
        components.map((c) => [
          c.id,
          (state.flows[c.id] ?? 0) * c.molecularWeight,
        ]),
      )
    : {};
  const mass = needsMass ? Object.values(masses).reduce((s, n) => s + n, 0) : 0;
  if (!(
    total > 0 &&
    state.volumetricFlow > 0 &&
    state.temperature > 0 &&
    state.pressure > 0
  ))
    throw new Error(
      "Rate evaluation needs positive total flow, volume flow, temperature and absolute pressure.",
    );
  const values: Record<string, number> = Object.create(null);
  Object.assign(values, {
    T: state.temperature,
    P: state.pressure,
    R: 8.31446261815324,
  });
  for (const v of law.variables) {
    const n = state.flows[v.componentId] ?? 0;
    if (n < 0) throw new Error(`${v.symbol}: species flow cannot be negative.`);
    const x = n / total;
    values[v.symbol] =
      v.basis === "concentration"
        ? n / state.volumetricFlow / (v.unit === "mol/m3" ? 1 : 1000)
        : v.basis === "partial-pressure"
          ? (x * state.pressure) /
            { Pa: 1, kPa: 1000, bar: 100000, atm: 101325 }[v.unit as "Pa"]
          : v.basis === "mole-fraction"
            ? x
            : v.basis === "mass-concentration"
              ? (masses[v.componentId] ?? 0) / state.volumetricFlow
              : mass > 0
                ? (masses[v.componentId] ?? 0) / mass
                : 0;
  }
  for (const p of law.parameters)
    values[p.symbol] =
      p.value *
      (p.activationEnergy === undefined
        ? 1
        : Math.exp(
            (-p.activationEnergy / values.R) *
              (1 / state.temperature - 1 / p.referenceTemperature!),
          ));
  return values;
}
export function compileRateLaw(
  law: RateLaw,
  components: ChemicalComponent[],
  packed: boolean,
) {
  const errors = rateLawIssues(
    law,
    components.map((c) => c.id),
    packed,
  );
  if (errors.length) throw new Error(errors.join(" "));
  const evaluate = compileRateExpression(
    rateFormula(law),
    [...law.variables, ...law.parameters].map((v) => v.symbol),
  );
  const scale =
    law.rateUnit === "mol/(L*s)" || law.rateUnit.startsWith("kmol") ? 1000 : 1;
  return (state: RateState) => {
    const rate = evaluate(rateVariableValues(law, components, state)) * scale;
    if (!Number.isFinite(rate))
      throw new Error(
        "Rate exceeds the numerical range after unit conversion.",
      );
    return rate;
  };
}

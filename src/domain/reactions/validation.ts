import type { Chemical } from "../thermo/data";
import { rateLawIssues } from "./rateLaw";
import { packedBedSchema, type PackedBedConfig, type Reaction } from "./schema";

/** Parse neutral molecular formulae, including parenthesized groups and hydrates. */
export function formulaElements(formula: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const part of formula.split(/[·.]/)) {
    const tokens = part.match(/[A-Z][a-z]?|\d+|[()\[\]]/g) ?? [];
    if (tokens.join("") !== part || !tokens.length)
      throw new Error(`Unsupported molecular formula: ${formula}`);
    let index = 0;
    const number = () =>
      /^\d+$/.test(tokens[index] ?? "") ? Number(tokens[index++]) : 1;
    const multiplier = number();
    const group = (closing?: string): Record<string, number> => {
      const counts: Record<string, number> = {};
      while (index < tokens.length && tokens[index] !== closing) {
        const token = tokens[index++];
        if (token === "(" || token === "[") {
          const end = token === "(" ? ")" : "]";
          const inner = group(end);
          if (tokens[index++] !== end)
            throw new Error(`Unclosed group in ${formula}`);
          const count = number();
          for (const [element, n] of Object.entries(inner))
            counts[element] = (counts[element] ?? 0) + n * count;
        } else {
          if (!/^[A-Z][a-z]?$/.test(token))
            throw new Error(`Unsupported molecular formula: ${formula}`);
          counts[token] = (counts[token] ?? 0) + number();
        }
      }
      return counts;
    };
    for (const [element, n] of Object.entries(group()))
      result[element] = (result[element] ?? 0) + n * multiplier;
  }
  return result;
}

export function reactionIssues(
  reaction: Reaction,
  chemicals: Chemical[],
): string[] {
  const issues: string[] = [];
  if (!reaction.name.trim()) issues.push("Give the reaction a name.");
  const rows = reaction.stoichiometry;
  if (
    !rows.some((s) => s.coefficient < 0) ||
    !rows.some((s) => s.coefficient > 0)
  )
    issues.push("Add at least one reactant and one product.");
  if (
    !rows.some(
      (s) => s.componentId === reaction.basisComponentId && s.coefficient < 0,
    )
  )
    issues.push("Choose a consumed reactant as the rate basis.");
  if (new Set(rows.map((s) => s.componentId)).size !== rows.length)
    issues.push("Use each component once in the reaction.");
  const atoms: Record<string, number> = {};
  let mass = 0,
    massScale = 0;
  for (const row of rows) {
    const chemical = chemicals.find((c) => c.id === row.componentId);
    if (!chemical) {
      issues.push(`Component ${row.componentId} is missing from the project.`);
      continue;
    }
    if (!Number.isFinite(row.coefficient) || row.coefficient === 0)
      issues.push("Use finite, nonzero stoichiometric coefficients.");
    mass += row.coefficient * chemical.molecularWeight;
    massScale += Math.abs(row.coefficient * chemical.molecularWeight);
    if (["A", "B"].includes(chemical.id)) continue;
    if (!chemical.formula) {
      issues.push(
        `${chemical.name}: a molecular formula is required to check atom balance.`,
      );
      continue;
    }
    try {
      for (const [element, n] of Object.entries(
        formulaElements(chemical.formula),
      ))
        atoms[element] = (atoms[element] ?? 0) + row.coefficient * n;
    } catch (error) {
      issues.push((error as Error).message);
    }
    if (
      chemical.formationEnthalpy === undefined ||
      chemical.formationSource?.startsWith("Explicit reference convention:")
    )
      issues.push(
        `${chemical.name}: formation enthalpy data is required for reaction heat duty.`,
      );
  }
  const unbalanced = Object.entries(atoms)
    .filter(([, n]) => Math.abs(n) > 1e-8)
    .map(([element]) => element);
  if (unbalanced.length)
    issues.push(
      `Balance the reaction: ${unbalanced.join(", ")} atoms do not balance.`,
    );
  if (Math.abs(mass) > Math.max(1e-10, massScale * 1e-4))
    issues.push("Stoichiometry does not conserve molecular mass.");
  if (reaction.rateLaw) {
    issues.push(
      ...rateLawIssues(
        reaction.rateLaw,
        chemicals.map((c) => c.id),
        true,
      ),
    );
    if (reaction.rateLaw.phase !== "gas")
      issues.push(
        "This PBR uses gas thermodynamics; select the gas phase for the rate law.",
      );
  }
  return [...new Set(issues)];
}

export function packedBedIssues(
  config: PackedBedConfig,
  chemicals: Chemical[],
): string[] {
  const parsed = packedBedSchema.safeParse(config);
  if (!parsed.success)
    return parsed.error.issues.map(
      (issue) => `${issue.path.join(" → ")}: ${issue.message}`,
    );
  const issues: string[] = [];
  if (!config.reactions.length)
    issues.push("Add a reaction before calculating.");
  if (
    new Set(config.reactions.map((r) => r.id)).size !== config.reactions.length
  )
    issues.push("Reaction IDs must be unique.");
  for (const reaction of config.reactions.filter((r) => r.enabled))
    issues.push(
      ...reactionIssues(reaction, chemicals).map(
        (message) => `${reaction.name}: ${message}`,
      ),
    );
  if (!chemicals.some((c) => c.id === config.conversionComponentId))
    issues.push("Select a project component for conversion reporting.");
  if (config.sizingMode === "target-conversion") {
    if (!(config.targetConversion > 0 && config.targetConversion < 1))
      issues.push("Target conversion must be strictly between 0 and 100%.");
    if (
      !config.reactions.some(
        (r) =>
          r.enabled &&
          r.stoichiometry.some(
            (s) =>
              s.componentId === config.conversionComponentId &&
              s.coefficient < 0,
          ),
      )
    )
      issues.push(
        "Choose a reactant in an enabled reaction for conversion sizing.",
      );
  }
  return issues;
}

export function reactionEquation(reaction: Reaction, chemicals: Chemical[]) {
  const side = (sign: number) =>
    reaction.stoichiometry
      .filter((s) => sign * s.coefficient > 0)
      .map((s) => {
        const chemical = chemicals.find((c) => c.id === s.componentId);
        return `${Math.abs(s.coefficient) === 1 ? "" : `${Math.abs(s.coefficient)} `}${chemical?.formula || chemical?.name || s.componentId}`;
      })
      .join(" + ") || "…";
  return `${side(-1)} ${reaction.rateLaw?.reversible ? "⇌" : "→"} ${side(1)}`;
}

export function rateConstantUnit(order: number) {
  if (order === 0) return "mol/(kg·s)";
  if (order === 1) return "m³/(kg·s)";
  if (order === 2) return "m⁶/(mol·kg·s)";
  return `(mol/m³)^${1 - order}·m³/(kg·s)`;
}

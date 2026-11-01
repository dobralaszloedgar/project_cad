import {
  graphDiagnostics,
  unitSchema,
  type Project,
  type Unit,
} from "./schema";
import type { Result } from "./solver";
import { defaultThermo } from "./thermo/registry";
import { thermoContext } from "./thermo/catalog";
import { feedComposition } from "./stream-composition";
import { packedBedIssues, reactionIssues } from "./reactions/validation";

export type EquipmentTarget = {
  section:
    | "settings"
    | "connections"
    | "composition"
    | "reactions"
    | "thermodynamics"
    | "results";
  field?: string;
  port?: string;
  reactionId?: string;
};
export type EquipmentIssue = {
  kind: "missing" | "error" | "warning";
  message: string;
  target: EquipmentTarget;
};
export type SimulationFailure = { message: string; unitId?: string };
export type EquipmentStatus = {
  state:
    | "unresolved"
    | "invalid"
    | "failed"
    | "ready"
    | "stale"
    | "calculated"
    | "warning";
  issues: EquipmentIssue[];
};
export const equipmentStatusLabels: Record<EquipmentStatus["state"], string> = {
  unresolved: "Missing setup",
  invalid: "Fix equipment errors",
  failed: "Simulation failed",
  ready: "Ready to simulate",
  stale: "Ready to simulate again",
  calculated: "Simulated successfully",
  warning: "Simulated with warnings",
};

/** Numerical identity excludes labels, positions and stream presentation. */
export function simulationKey(project: Project): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, canonical(entry)]),
      );
    return value;
  };
  return JSON.stringify(
    canonical({
      units: project.units
        .map(({ id, kind, params }) => ({ id, kind, params }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      edges: project.edges
        .map(({ id, source, target, sourcePort, targetPort }) => ({
          id,
          source,
          target,
          sourcePort,
          targetPort,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      thermo: project.thermo ?? defaultThermo,
    }),
  );
}

/** Runtime messages fall back to a visible setup section if no field is known. */
export function equipmentIssueTarget(message: string): EquipmentTarget {
  if (/composition|mole fraction|removed component/i.test(message))
    return { section: "composition" };
  if (
    /thermodynamic|ideal-gas model|sample mixture|property data|catalog/i.test(
      message,
    )
  )
    return { section: "thermodynamics" };
  if (/feed tray/i.test(message))
    return { section: "settings", field: "distillation.feedTray" };
  if (/distillate flow/i.test(message))
    return { section: "settings", field: "distillation.distillateFlow" };
  if (/relative volatility|volatilities|key volatility/i.test(message))
    return { section: "settings", field: "distillation.relativeVolatilities" };
  if (/light.*heavy.*key/i.test(message))
    return { section: "settings", field: "distillation.lightKey" };
  if (/reflux/i.test(message))
    return { section: "settings", field: "distillation.refluxRatio" };
  if (/temperature/i.test(message))
    return { section: "settings", field: "temperature" };
  if (/duty/i.test(message)) return { section: "settings", field: "heatDuty" };
  if (/reaction|reactant|stoichiometr|rate law|kinetic/i.test(message))
    return { section: "reactions" };
  if (/pressure/i.test(message))
    return { section: "settings", field: "pressure" };
  if (/connect|inlet|path from Feed/i.test(message))
    return { section: "connections" };
  return { section: "settings" };
}

function reactionTarget(message: string, reactionId: string): EquipmentTarget {
  const field = /name/i.test(message)
    ? "name"
    : /rate basis|consumed reactant/i.test(message)
      ? "basisComponentId"
      : /reactant|product|stoichiometr|balanc|component/i.test(message)
        ? "stoichiometry"
        : "kinetics";
  return { section: "reactions", reactionId, field: `reaction.${field}` };
}

export function equipmentSetupIssues(
  project: Project,
  unit: Unit,
): EquipmentIssue[] {
  const issues: EquipmentIssue[] = [];
  const add = (
    message: string,
    kind: EquipmentIssue["kind"] = "error",
    target = equipmentIssueTarget(message),
  ) => issues.push({ kind, message, target });
  const parsed = unitSchema.safeParse(unit);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.filter((part) => part !== "params").join(".");
      add(`${path}: ${issue.message}`, "error", {
        section: "settings",
        field: path,
      });
    }
    return issues;
  }
  if (!unit.name.trim())
    add("Enter an equipment name.", "missing", {
      section: "settings",
      field: "name",
    });
  const settings = project.thermo ?? defaultThermo;
  if (settings.mixture === "catalog" && !settings.catalog) {
    add("Select project components and load their property data.", "missing", {
      section: "thermodynamics",
      field: "components",
    });
    return issues;
  }
  if (settings.modelId !== "ideal-gas" && settings.mixture === "demo")
    add(
      "Choose a real sample mixture for the liquid-solution models; synthetic A/B has no vapor-pressure or group data.",
    );
  try {
    const { ids, catalog } = thermoContext(settings);
    if (unit.kind === "Feed") feedComposition(unit.params, ids);
    if (unit.kind === "PBR") {
      const config = unit.params.packedBed;
      if (config) {
        const chemicals = ids.map((id) => catalog.get(id));
        const reactionMessages = new Set<string>();
        for (const reaction of config.reactions.filter(
          (entry) => entry.enabled,
        )) {
          for (const message of reactionIssues(reaction, chemicals)) {
            const full = `${reaction.name}: ${message}`;
            reactionMessages.add(full);
            add(
              full,
              /^(Add|Choose|Select|Give)\b/.test(message) ? "missing" : "error",
              reactionTarget(message, reaction.id),
            );
          }
        }
        for (const message of packedBedIssues(config, chemicals)) {
          if (!reactionMessages.has(message))
            add(
              message,
              /^(Add|Choose|Select)\b/.test(message) ? "missing" : "error",
              {
                section: "reactions",
                ...(message.includes("conversion")
                  ? { field: "packedBed.conversionComponentId" }
                  : {}),
              },
            );
        }
        if (settings.modelId !== "ideal-gas")
          add("The reaction-set PBR requires the ideal-gas model.");
      } else if (
        settings.mixture !== "demo" ||
        settings.modelId !== "ideal-gas"
      )
        add(
          "The sample PBR reaction supports synthetic A/B with the ideal-gas model only.",
        );
    }
    const d = unit.params.distillation;
    if (unit.kind === "Distillation" && d) {
      if (d.method === "fug") {
        for (const key of ["lightKey", "heavyKey"] as const)
          if (!d[key] || !new Set<string>(ids).has(d[key]!))
            add(
              `Select a ${key === "lightKey" ? "light" : "heavy"} key from the project components.`,
              "missing",
              { section: "settings", field: `distillation.${key}` },
            );
        if (d.lightKey && d.lightKey === d.heavyKey)
          add("FUG requires distinct light and heavy keys.", "error", {
            section: "settings",
            field: "distillation.heavyKey",
          });
        // Only direct feeds establish active species before calculation. An upstream
        // separator or reactor can remove species; do not invent required inputs.
        const active = new Set<string>();
        for (const edge of project.edges.filter(
          (edge) => edge.target === unit.id,
        )) {
          const source = project.units.find(
            (entry) => entry.id === edge.source,
          );
          if (source?.kind !== "Feed") continue;
          try {
            for (const [id, fraction] of Object.entries(
              feedComposition(source.params, ids),
            ))
              if (fraction > 0) active.add(id);
          } catch {
            /* The feed owns its invalid composition. */
          }
        }
        for (const id of active)
          if (!(d.relativeVolatilities[id] > 0))
            add(
              `Supply a positive relative volatility for ${catalog.get(id).name}.`,
              "missing",
              {
                section: "settings",
                field: `distillation.relativeVolatilities.${id}`,
              },
            );
      } else {
        if (d.feedTray > unit.params.trayCount)
          add("Feed tray must be within the installed equilibrium trays.");
        if (settings.modelId === "ideal-gas")
          add(
            "MESH requires liquid thermodynamics. Select a liquid model and real project components.",
          );
      }
    }
    if (
      (unit.kind === "Heater" || unit.kind === "Cooler") &&
      unit.params.thermalMode === "duty"
    ) {
      if (settings.modelId !== "ideal-gas")
        add(
          "Specified duty supports the ideal-gas model only; select an outlet temperature for liquid models.",
          "error",
          { section: "settings", field: "thermalMode" },
        );
      if (
        (unit.kind === "Heater" && unit.params.heatDuty < 0) ||
        (unit.kind === "Cooler" && unit.params.heatDuty > 0)
      )
        add("Heater duty must be nonnegative and cooler duty nonpositive.");
    }
  } catch (error) {
    add(
      error instanceof Error ? error.message : "Review the equipment settings.",
    );
  }
  return issues;
}

export function equipmentStatuses(
  project: Project,
  result: Result | null,
  failure?: SimulationFailure,
  previousResult?: Result | null,
): Record<string, EquipmentStatus> {
  const graph = graphDiagnostics(project, true);
  return Object.fromEntries(
    project.units.map((unit) => {
      const connections: EquipmentIssue[] = graph
        .filter((issue) => issue.unitId === unit.id)
        .map((issue) => ({
          kind: issue.kind,
          message: issue.port
            ? `Connect ${issue.port.startsWith("in") ? "inlet" : "outlet"}${issue.port.endsWith("2") ? " 2" : " 1"}.`
            : issue.message
                .replace(`${unit.name}: `, "")
                .replace(/^equipment/, "Equipment"),
          target: { section: "connections", port: issue.port },
        }));
      const issues = [
        ...equipmentSetupIssues(project, unit),
        ...connections.sort(
          (a, b) => Number(!!b.target.port) - Number(!!a.target.port),
        ),
      ].sort((a, b) => Number(b.kind === "error") - Number(a.kind === "error"));
      let state: EquipmentStatus["state"];
      if (failure?.unitId === unit.id) {
        issues.unshift({
          kind: "error",
          message: failure.message,
          target: equipmentIssueTarget(failure.message),
        });
        state = "failed";
      } else if (issues.length)
        state = issues.some((issue) => issue.kind === "error")
          ? "invalid"
          : "unresolved";
      else if (result?.equipment[unit.id]) {
        const eq = result.equipment[unit.id];
        const warnings = [
          ...(!result.converged
            ? [
                "Recycle did not converge. Results are provisional; inspect the simulation diagnostics.",
              ]
            : []),
          ...(eq.distillation?.warnings ?? []),
          ...(eq.packedBed?.warnings ?? []),
          ...project.edges
            .filter(
              (edge) =>
                edge.source === unit.id ||
                (unit.kind === "Product" && edge.target === unit.id),
            )
            .flatMap((edge) => result.properties[edge.id]?.warnings ?? []),
        ];
        for (const message of new Set(warnings))
          issues.push({
            kind: "warning",
            message,
            target: { section: "results", field: "warnings" },
          });
        state = issues.length ? "warning" : "calculated";
      } else state = previousResult?.equipment[unit.id] ? "stale" : "ready";
      return [
        unit.id,
        {
          state,
          issues: issues.filter(
            (issue, index) =>
              issues.findIndex(
                (other) =>
                  other.message === issue.message &&
                  other.target.reactionId === issue.target.reactionId,
              ) === index,
          ),
        },
      ];
    }),
  );
}

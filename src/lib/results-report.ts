import type { Project } from "../domain/schema";
import { flow, type Result } from "../domain/solver";
import { componentFlows } from "../domain/stream-composition";
import { componentNames, mixtureName } from "../domain/thermo/catalog";
import { defaultThermo, modelInfo } from "../domain/thermo/registry";
import {
  type Dimension,
  UNIT_SYSTEMS,
  unitLabel,
} from "../domain/unit-definitions";
import {
  matchingPreset,
  pressureLabel,
  type UnitPreferences,
} from "../domain/unit-preferences";
import { fromSI } from "../domain/units";

export type ReportCell = string | number | null;
export interface ReportTable {
  title: string;
  headers: string[];
  rows: ReportCell[][];
}
export interface ResultsReport {
  projectName: string;
  generatedAt: string;
  unitSystem: string;
  status: string;
  summary: ReportTable;
  streams: ReportTable;
  conditions: ReportTable;
  composition: ReportTable;
  equipment: ReportTable;
  diagnostics: ReportTable;
  convergence: ReportTable;
  warnings: string[];
}

const finite = (value: number | null | undefined): number | null =>
  value != null && Number.isFinite(value) ? value : null;

/** One snapshot feeds every export; numbers retain their calculation precision. */
export function buildResultsReport(
  project: Project,
  result: Result,
  preferences: UnitPreferences,
  generatedAt = new Date().toISOString(),
): ResultsReport {
  const settings = project.thermo ?? defaultThermo;
  const names = componentNames(settings);
  const ids = result.provenance.chemicalIds;
  const preset = matchingPreset(preferences.units);
  const unitSystem = preset ? UNIT_SYSTEMS[preset].label : "Custom";
  const label = (dimension: Dimension) =>
    dimension === "pressure"
      ? pressureLabel(preferences.units[dimension])
      : unitLabel(preferences.units[dimension]);
  const value = (n: number, dimension: Dimension) =>
    finite(fromSI(n, preferences.units[dimension], preferences.atmosphere));
  const conditions: ReportTable = {
    title: "Stream conditions",
    headers: [
      "Stream",
      `Flow (${label("molarFlow")})`,
      `Temperature (${label("temperature")})`,
      `Pressure (${label("pressure")})`,
      "Phase",
      "Vapor fraction",
    ],
    rows: project.edges.map((edge) => {
      const stream = result.streams[edge.id];
      const properties = result.properties[edge.id];
      return [
        edge.name ?? edge.id,
        stream ? value(flow(stream), "molarFlow") : null,
        stream ? value(stream.temperature, "temperature") : null,
        stream ? value(stream.pressure, "pressure") : null,
        properties?.phase ?? null,
        finite(properties?.vaporFraction),
      ];
    }),
  };
  const composition: ReportTable = {
    title: "Composition · mole fractions",
    headers: ["Stream", ...ids.map((id, i) => `${names[i] ?? id} fraction`)],
    rows: project.edges.map((edge) => {
      const stream = result.streams[edge.id];
      const total = stream ? flow(stream) : 0;
      const components = stream ? componentFlows(stream, ids) : {};
      return [
        edge.name ?? edge.id,
        ...ids.map((id) => (total > 0 ? finite(components[id] / total) : null)),
      ];
    }),
  };
  const status = result.converged ? "Converged" : "Not converged";
  return {
    projectName: project.name,
    generatedAt,
    unitSystem,
    status,
    summary: {
      title: "Summary",
      headers: ["Metric", "Value", "Unit / basis"],
      rows: [
        ["Project", project.name, null],
        ["Exported at", generatedAt, "UTC"],
        ["Calculation status", status, null],
        ["Unit system", unitSystem, null],
        ["Mixture", mixtureName(settings), null],
        [
          `Conversion of ${names[0] ?? "first component"}`,
          finite(result.conversion * 100),
          "% · fresh-feed basis",
        ],
        ["Net heat duty", value(result.heatDuty, "power"), label("power")],
        [
          "Mass balance residual",
          value(result.massResidual, "massFlow"),
          label("massFlow"),
        ],
        [
          "Energy balance residual",
          value(result.energyResidual, "power"),
          label("power"),
        ],
        ["Equipment", project.units.length, null],
        ["Streams", project.edges.length, null],
      ],
    },
    conditions,
    composition,
    streams: {
      title: "Streams",
      headers: [
        "Stream",
        "Stream ID",
        "From",
        "To",
        ...conditions.headers.slice(1),
        ...composition.headers.slice(1),
      ],
      rows: project.edges.map((edge, i) => [
        edge.name ?? edge.id,
        edge.id,
        edge.source,
        edge.target,
        ...conditions.rows[i].slice(1),
        ...composition.rows[i].slice(1),
      ]),
    },
    equipment: {
      title: "Equipment duties",
      headers: [
        "Equipment",
        "Name",
        "Type",
        `Heat duty (${label("power")})`,
        "Conversion (%)",
      ],
      rows: project.units.map((unit) => {
        const equipment = result.equipment[unit.id];
        return [
          unit.id,
          unit.name,
          unit.kind,
          equipment ? value(equipment.duty, "power") : null,
          equipment?.conversion != null
            ? finite(equipment.conversion * 100)
            : null,
        ];
      }),
    },
    diagnostics: {
      title: "Calculation evidence",
      headers: ["Property", "Value"],
      rows: [
        ["Status", status],
        ["Thermodynamic model", modelInfo(result.provenance.modelId).name],
        ["Model version", result.provenance.modelVersion],
        ["Data version", result.provenance.dataVersion],
        ["Kernel hash", result.provenance.kernelHash],
        ["Parameter hash", result.provenance.parameterHash],
        ["Chemical IDs", ids.join(", ")],
        ["Extrapolation enabled", result.provenance.extrapolate ? "Yes" : "No"],
        ["Iterations", result.iterations],
        ["Recycle stream", result.tearId ?? "Acyclic · one evaluation"],
        ["Scaled recycle residual", finite(result.residual)],
        [
          `Mass balance residual (${label("massFlow")})`,
          value(result.massResidual, "massFlow"),
        ],
        [
          `Energy balance residual (${label("power")})`,
          value(result.energyResidual, "power"),
        ],
        ["Recycle tolerance", 1e-9],
        ["Maximum recycle iterations", 500],
        ["Heat duty convention", "Positive adds heat to the process"],
        ["Mass balance basis", "Products minus fresh feeds"],
        ["Energy balance basis", "Includes formation enthalpy"],
        [
          "Missing values",
          "An em dash or empty cell means unavailable or not applicable",
        ],
      ],
    },
    convergence: {
      title: "Convergence history",
      headers: ["Iteration", "Scaled residual"],
      rows: result.history.map((residual, i) => [i + 1, finite(residual)]),
    },
    warnings: [...new Set(result.warnings)],
  };
}

export function formatReportCell(cell: ReportCell): string {
  if (cell == null) return "—";
  if (typeof cell !== "number") return cell;
  if (cell !== 0 && Math.abs(cell) < 0.0001) return cell.toExponential(3);
  return cell.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** Quote all fields and neutralize spreadsheet formulas in user-provided names. */
export function csvCell(cell: ReportCell): string {
  let text = cell == null ? "" : String(cell);
  if (typeof cell === "string" && /^[\s\uFEFF]*[=+\-@]/.test(text))
    text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

// A rectangular stream dataset stays directly importable by other tools.
export function resultsCsv(report: ResultsReport): string {
  const headers = [
    "Project",
    "Exported at (UTC)",
    "Status",
    "Unit system",
    ...report.streams.headers,
  ];
  const rows = report.streams.rows.map((row) => [
    report.projectName,
    report.generatedAt,
    report.status,
    report.unitSystem,
    ...row,
  ]);
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}

export function reportTables(report: ResultsReport): ReportTable[] {
  return [
    report.summary,
    report.streams,
    report.equipment,
    report.diagnostics,
    report.convergence,
    {
      title: "Model notes",
      headers: ["Note"],
      rows: report.warnings.length
        ? report.warnings.map((warning) => [warning])
        : [["No model warnings reported."]],
    },
  ];
}

export function resultsText(report: ResultsReport): string {
  const textCell = (cell: ReportCell) =>
    (cell == null ? "—" : String(cell))
      .replaceAll("\t", " ")
      .replace(/\r?\n/g, " ");
  return (
    `PROJECT CAD · SIMULATION RESULTS\n${report.projectName}\n\n` +
    reportTables(report)
      .map(
        (table) =>
          `${table.title.toUpperCase()}\n${[table.headers, ...table.rows].map((row) => row.map(textCell).join("\t")).join("\n")}`,
      )
      .join("\n\n") +
    "\n"
  );
}

/** Bound report width for print and image exports without dropping components. */
export function printableTables(report: ResultsReport): ReportTable[] {
  const composition: ReportTable[] = [];
  for (let start = 1; start < report.composition.headers.length; start += 5) {
    composition.push({
      title:
        report.composition.title +
        (report.composition.headers.length > 6
          ? ` · ${start}–${Math.min(start + 4, report.composition.headers.length - 1)}`
          : ""),
      headers: [
        report.composition.headers[0],
        ...report.composition.headers.slice(start, start + 5),
      ],
      rows: report.composition.rows.map((row) => [
        row[0],
        ...row.slice(start, start + 5),
      ]),
    });
  }
  return [
    report.conditions,
    ...composition,
    report.equipment,
    report.diagnostics,
    {
      title: "Model notes",
      headers: ["Note"],
      rows: report.warnings.length
        ? report.warnings.map((warning) => [warning])
        : [["No model warnings reported."]],
    },
  ];
}

export function resultsFilename(report: ResultsReport): string {
  const name =
    report.projectName
      .normalize("NFKC")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/[. ]+$/g, "")
      .slice(0, 80) || "project";
  return `${name}-results-${report.generatedAt.replace(/[:.]/g, "-")}`;
}

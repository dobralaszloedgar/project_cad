import { describe, expect, it } from "vitest";
import { reactorExample } from "../src/domain/examples";
import { simulate } from "../src/domain/solver";
import { presetPreferences } from "../src/domain/unit-preferences";
import { fromSI } from "../src/domain/units";
import {
  buildResultsReport,
  csvCell,
  printableTables,
  resultsCsv,
  resultsText,
} from "../src/lib/results-report";
import { resultsWorkbook } from "../src/lib/results-export";
import { tenComponentPlant } from "./helpers/ten-component-plant";
import ExcelJS from "exceljs";

describe("simulation results exports", () => {
  it("converts exported values and units together, including custom gauge pressure", () => {
    const project = reactorExample();
    const result = simulate(project);
    const preferences = presetPreferences("us");
    preferences.units.pressure = "psig";
    preferences.atmosphere = 80000;
    const report = buildResultsReport(project, result, preferences);
    expect(report.conditions.headers).toContain("Temperature (°F)");
    expect(report.conditions.headers).toContain("Pressure (psig)");
    expect(report.conditions.rows[0][2]).toBe(
      fromSI(result.streams.s1.temperature, "degF"),
    );
    expect(report.conditions.rows[0][3]).toBe(
      fromSI(result.streams.s1.pressure, "psig", 80000),
    );
    expect(report.unitSystem).toBe("Custom");
    expect(
      report.summary.rows.find((row) => row[0] === "Net heat duty")?.[1],
    ).toBe(fromSI(result.heatDuty, "Btu/h"));
  });

  it("retains nonconvergence, missing results, tiny residuals, and calculation evidence", () => {
    const project = reactorExample();
    const result = simulate(project);
    result.converged = false;
    result.massResidual = 1e-14;
    delete result.streams.s1;
    delete result.properties.s1;
    result.warnings = ["Example model limitation", "Example model limitation"];
    const report = buildResultsReport(
      project,
      result,
      presetPreferences("metric"),
    );
    expect(report.status).toBe("Not converged");
    expect(report.conditions.rows[0].slice(1)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(report.composition.rows[0].slice(1)).toEqual([null, null]);
    expect(report.warnings).toEqual(["Example model limitation"]);
    expect(resultsCsv(report)).toContain('"Not converged"');
    expect(resultsText(report)).toContain(result.provenance.kernelHash);
    expect(resultsText(report)).toContain(String(fromSI(1e-14, "kg/h")));
    expect(resultsText(report)).toContain("Example model limitation");
  });

  it("escapes CSV strings without turning user names into spreadsheet formulas", () => {
    expect(csvCell('feed, "hot"\nnext')).toBe('"feed, ""hot""\nnext"');
    for (const value of ["=1+1", "+SUM(A1)", "-1+2", "@SUM(A1)", " \t=1+1"])
      expect(csvCell(value)).toBe(`"'${value}"`);
    expect(csvCell(-45.125)).toBe('"-45.125"');
    const project = reactorExample();
    project.name = "=1+1";
    const report = buildResultsReport(
      project,
      simulate(project),
      presetPreferences("metric"),
    );
    const csv = resultsCsv(report);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"\'=1+1"');
    expect(csv.trim().split("\r\n")).toHaveLength(project.edges.length + 1);
  });

  it("keeps every chemical in wide mixtures when laying out printable reports", () => {
    const project = tenComponentPlant();
    const report = buildResultsReport(
      project,
      simulate(project),
      presetPreferences("metric"),
    );
    const tables = printableTables(report).filter((table) =>
      table.title.startsWith("Composition"),
    );
    expect(tables).toHaveLength(2);
    expect(tables.flatMap((table) => table.headers.slice(1))).toEqual(
      report.composition.headers.slice(1),
    );
    expect(tables.flatMap((table) => table.rows.at(-1)!.slice(1))).toEqual(
      Array(10).fill(0.1),
    );
  });

  it("writes a real Excel workbook with numeric cells, complete streams and frozen headers", async () => {
    const project = reactorExample();
    project.edges[0].name = "=1+1";
    const result = simulate(project);
    const report = buildResultsReport(
      project,
      result,
      presetPreferences("metric"),
    );
    const blob = await resultsWorkbook(report);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    const sheet = workbook.getWorksheet("Streams")!;
    expect(sheet.rowCount).toBe(project.edges.length + 1);
    expect(sheet.getCell("A2").value).toBe("=1+1");
    expect(sheet.getCell("E2").value).toBe(report.streams.rows[0][4]);
    expect(typeof sheet.getCell("E2").value).toBe("number");
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Summary",
      "Streams",
      "Equipment duties",
      "Calculation evidence",
      "Convergence history",
      "Model notes",
    ]);
  });
});

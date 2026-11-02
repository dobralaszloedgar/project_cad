import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import {
  formatReportCell,
  printableTables,
  reportTables,
  resultsCsv,
  resultsFilename,
  resultsText,
  type ResultsReport,
  type ReportTable,
} from "./results-report";

export type ResultsExportFormat = "xlsx" | "pdf" | "png" | "csv" | "txt";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Give browsers time to consume the object URL before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function resultsWorkbook(report: ResultsReport): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Project CAD";
  workbook.title = `${report.projectName} · Simulation results`;
  workbook.created = new Date(report.generatedAt);
  for (const table of reportTables(report)) {
    const sheet = workbook.addWorksheet(table.title, {
      views: [{ state: "frozen", ySplit: 1 }],
      pageSetup: {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: "1:1",
      },
    });
    sheet.addRow(table.headers);
    sheet.addRows(table.rows);
    sheet.columns.forEach((column, i) => {
      column.width = Math.min(
        60,
        Math.max(
          18,
          ...[table.headers, ...table.rows].map(
            (row) => String(row[i] ?? "").length + 3,
          ),
        ),
      );
    });
    sheet.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { name: "Calibri", size: 11, color: { argb: "FF263730" } };
        cell.alignment = { vertical: "top", wrapText: true };
        if (typeof cell.value === "number") {
          cell.numFmt =
            cell.value !== 0 && Math.abs(cell.value) < 0.0001
              ? "0.000E+00"
              : "#,##0.##########";
        }
        if (rowNumber > 1 && rowNumber % 2 === 0)
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF2F6F4" },
          };
      });
      if (rowNumber === 1) {
        row.height = 30;
        row.eachCell((cell) => {
          cell.font = {
            name: "Calibri",
            size: 11,
            bold: true,
            color: { argb: "FFFFFFFF" },
          };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF286E5C" },
          };
          cell.alignment = { vertical: "middle", wrapText: true };
        });
      }
    });
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: table.headers.length },
    };
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function resultsPdfDefinition(
  report: ResultsReport,
): TDocumentDefinitions {
  const pdfText = (value: string) =>
    value.replaceAll("·", "/").replaceAll("→", "->").replaceAll("—", "-");
  const content: Content[] = [
    {
      text: "PROJECT CAD / SIMULATION REPORT",
      fontSize: 9,
      color: "#286e5c",
      bold: true,
      characterSpacing: 1.2,
      margin: [0, 0, 0, 12],
    },
    {
      text: report.projectName,
      fontSize: 25,
      bold: true,
      margin: [0, 0, 0, 8],
    },
    {
      text: `${report.status}  /  ${report.unitSystem} units  /  Exported ${report.generatedAt}`,
      color: "#66736c",
      fontSize: 9,
      margin: [0, 0, 0, 16],
    },
  ];
  content.push({
    table: {
      widths: ["*", "*", "*"],
      body: [
        report.summary.rows.slice(5, 8).map((row) => ({
          fillColor: "#edf4f0",
          stack: [
            {
              text: String(row[0]),
              color: "#52665c",
              fontSize: 9,
              margin: [0, 0, 0, 8],
            },
            {
              text: formatReportCell(row[1]),
              fontSize: 23,
              bold: true,
              margin: [0, 0, 0, 5],
            },
            { text: pdfText(String(row[2])), fontSize: 8, color: "#66736c" },
          ],
        })),
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 14,
      paddingRight: () => 14,
      paddingTop: () => 12,
      paddingBottom: () => 12,
    },
    margin: [0, 0, 0, 12],
  });
  content.push({
    text: `${report.summary.rows[4][1]}  /  ${report.summary.rows[9][1]} equipment  /  ${report.summary.rows[10][1]} streams\nEnergy balance residual: ${formatReportCell(report.summary.rows[8][1])} ${report.summary.rows[8][2]}`,
    fontSize: 9,
    color: "#66736c",
    lineHeight: 1.4,
    margin: [0, 0, 0, 14],
  });
  const sections = printableTables(report);
  for (const [index, table] of sections.entries()) {
    const evidence = table === report.diagnostics;
    const tableContent: Content = {
      fontSize: evidence ? 8 : 9,
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: table.headers.map(() => "*"),
        body: [
          table.headers.map((header) => ({
            text: pdfText(header),
            bold: true,
            color: "#ffffff",
            fillColor: "#286e5c",
          })),
          ...table.rows.map((row, rowIndex) =>
            row.map((cell) => ({
              text: pdfText(formatReportCell(cell)),
              fillColor: rowIndex % 2 ? "#f2f6f4" : "#ffffff",
            })),
          ),
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => (evidence ? 4 : 6),
        paddingBottom: () => (evidence ? 4 : 6),
      },
      margin: [0, 0, 0, index === sections.length - 1 ? 0 : 16],
    };
    const heading: Content = {
      text: pdfText(table.title),
      style: "section",
      headlineLevel: 1,
      ...(evidence ? { pageBreak: "before" as const } : {}),
    };
    if (
      table.rows.length <= 8 &&
      table.headers.every((header) => header.length < 90) &&
      table.rows.every((row) =>
        row.every((cell) => String(cell ?? "").length < 90),
      )
    ) {
      content.push({ unbreakable: true, stack: [heading, tableContent] });
    } else content.push(heading, tableContent);
  }
  return {
    info: {
      title: `${report.projectName} · Simulation results`,
      author: "Project CAD",
      subject: report.status,
    },
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [36, 32, 36, 38],
    defaultStyle: { font: "Roboto", fontSize: 9, color: "#263730" },
    styles: { section: { fontSize: 13, bold: true, margin: [0, 6, 0, 9] } },
    content,
    footer: (page, count) => ({
      text: `Project CAD  /  ${report.status}     |     ${page} / ${count}`,
      alignment: "right",
      fontSize: 8,
      color: "#66736c",
      margin: [36, 12, 36, 0],
    }),
    pageBreakBefore: (node, container) =>
      node.headlineLevel === 1 &&
      container.getFollowingNodesOnPage().length === 0,
  };
}

async function resultsPdf(report: ResultsReport): Promise<Blob> {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  pdfMake.addVirtualFileSystem(fonts);
  return pdfMake.createPdf(resultsPdfDefinition(report)).getBlob();
}

/** Render a complete report, independent of scrolling, search and UI theme. */
async function resultsImage(report: ResultsReport): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const candidate = canvas.getContext("2d");
  if (!candidate)
    throw new Error(
      "Image export is unavailable in this browser. Try PDF instead.",
    );
  const context = candidate;
  const width = 1440;
  const margin = 48;
  const contentWidth = width - margin * 2;
  const operations: (() => void)[] = [];
  let y = 44;
  function text(
    value: string,
    x: number,
    top: number,
    fontSize: number,
    color: string,
    bold = false,
  ) {
    operations.push(() => {
      context.fillStyle = color;
      context.font = `${bold ? "600" : "400"} ${fontSize}px Arial, sans-serif`;
      context.textBaseline = "top";
      context.fillText(value, x, top);
    });
  }
  function rect(x: number, top: number, w: number, h: number, color: string) {
    operations.push(() => {
      context.fillStyle = color;
      context.fillRect(x, top, w, h);
    });
  }
  function wrap(
    value: string,
    maxWidth: number,
    size: number,
    bold = false,
  ): string[] {
    context.font = `${bold ? "600" : "400"} ${size}px Arial, sans-serif`;
    const lines: string[] = [];
    let line = "";
    // Character wrapping also handles long hashes and unbroken chemical names.
    for (const character of value) {
      if (
        character === "\n" ||
        (line && context.measureText(line + character).width > maxWidth)
      ) {
        lines.push(line.trimEnd());
        line = character === "\n" ? "" : character;
      } else line += character;
    }
    lines.push(line);
    return lines;
  }
  function paragraph(value: string, size: number, color: string, bold = false) {
    for (const line of wrap(value, contentWidth, size, bold)) {
      text(line, margin, y, size, color, bold);
      y += size * 1.45;
    }
  }
  text("PROJECT CAD / SIMULATION REPORT", margin, y, 14, "#286e5c", true);
  y += 36;
  paragraph(report.projectName, 36, "#263730", true);
  y += 8;
  paragraph(
    `${report.status}  ·  ${report.unitSystem} units  ·  Exported ${report.generatedAt}`,
    16,
    "#66736c",
  );
  paragraph(
    `${report.summary.rows[4][1]}  ·  ${report.summary.rows[9][1]} equipment  ·  ${report.summary.rows[10][1]} streams`,
    15,
    "#66736c",
  );
  y += 28;
  const metrics = report.summary.rows.slice(5, 8);
  const cardWidth = (contentWidth - 32) / 3;
  const cardLines = metrics.map((metric) =>
    wrap(String(metric[0]), cardWidth - 32, 15, true),
  );
  const cardHeight =
    Math.max(...cardLines.map((lines) => lines.length)) * 22 + 98;
  metrics.forEach((metric, i) => {
    const x = margin + i * (cardWidth + 16);
    rect(x, y, cardWidth, cardHeight, i === 0 ? "#e4f0eb" : "#f2f6f4");
    cardLines[i].forEach((line, n) =>
      text(line, x + 16, y + 18 + n * 22, 15, "#52665c", true),
    );
    text(
      formatReportCell(metric[1]),
      x + 16,
      y + cardHeight - 74,
      30,
      "#263730",
      true,
    );
    text(String(metric[2]), x + 16, y + cardHeight - 30, 14, "#66736c");
  });
  y += cardHeight + 30;
  function table(table: ReportTable) {
    paragraph(table.title, 21, "#263730", true);
    y += 12;
    const columnWidth = contentWidth / table.headers.length;
    [table.headers, ...table.rows].forEach((row, rowIndex) => {
      const lines = row.map((cell) =>
        wrap(formatReportCell(cell), columnWidth - 24, 15, rowIndex === 0),
      );
      const rowHeight = Math.max(...lines.map((item) => item.length)) * 21 + 22;
      rect(
        margin,
        y,
        contentWidth,
        rowHeight,
        rowIndex === 0 ? "#286e5c" : rowIndex % 2 ? "#f2f6f4" : "#ffffff",
      );
      lines.forEach((cell, column) =>
        cell.forEach((line, n) =>
          text(
            line,
            margin + column * columnWidth + 12,
            y + 11 + n * 21,
            15,
            rowIndex === 0 ? "#ffffff" : "#263730",
            rowIndex === 0,
          ),
        ),
      );
      y += rowHeight;
    });
    y += 28;
  }
  for (const section of printableTables(report)) table(section);
  paragraph(
    "Project CAD · Complete results report · Missing values are shown as —",
    13,
    "#66736c",
  );
  const height = Math.ceil(y + 40);
  // Stay within browser canvas limits while keeping ordinary reports crisp.
  const scale = Math.min(
    2,
    16000 / height,
    Math.sqrt(24_000_000 / (width * height)),
  );
  if (scale < 0.75)
    throw new Error(
      "This report is too long for a readable PNG. Export to PDF or Excel to include every result.",
    );
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  context.scale(scale, scale);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  operations.forEach((draw) => draw());
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Could not create the image. Try PDF instead.")),
      "image/png",
    ),
  );
}

export async function exportResults(
  report: ResultsReport,
  format: ResultsExportFormat,
): Promise<void> {
  let blob: Blob;
  switch (format) {
    case "xlsx":
      blob = await resultsWorkbook(report);
      break;
    case "pdf":
      blob = await resultsPdf(report);
      break;
    case "png":
      blob = await resultsImage(report);
      break;
    case "csv":
      blob = new Blob([resultsCsv(report)], { type: "text/csv;charset=utf-8" });
      break;
    case "txt":
      blob = new Blob([resultsText(report)], {
        type: "text/plain;charset=utf-8",
      });
      break;
  }
  download(blob, `${resultsFilename(report)}.${format}`);
}

"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  Table2,
} from "lucide-react";
import type { ResultsReport } from "@/lib/results-report";
import type { ResultsExportFormat } from "@/lib/results-export";

const formats = [
  {
    id: "xlsx",
    label: "Excel workbook",
    detail: "All results · formatted worksheets",
    extension: ".xlsx",
    icon: FileSpreadsheet,
  },
  {
    id: "pdf",
    label: "PDF report",
    detail: "All results · ready to share",
    extension: ".pdf",
    icon: FileText,
  },
  {
    id: "png",
    label: "PNG image",
    detail: "All results · high resolution",
    extension: ".png",
    icon: FileImage,
  },
  {
    id: "csv",
    label: "CSV data",
    detail: "All streams · full precision",
    extension: ".csv",
    icon: Table2,
  },
  {
    id: "txt",
    label: "Text report",
    detail: "All results · plain text",
    extension: ".txt",
    icon: FileText,
  },
] as const;

export default function ResultsExportButton({
  report,
}: {
  report: ResultsReport | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  async function save(format: ResultsExportFormat) {
    if (!report || busy) return;
    setOpen(false);
    setBusy(true);
    setError(false);
    setMessage("Preparing export…");
    trigger.current?.focus();
    try {
      const { exportResults } = await import("@/lib/results-export");
      const generatedAt = new Date().toISOString();
      await exportResults(
        {
          ...report,
          generatedAt,
          summary: {
            ...report.summary,
            rows: report.summary.rows.map((row) =>
              row[0] === "Exported at" ? [row[0], generatedAt, row[2]] : row,
            ),
          },
        },
        format,
      );
      setMessage(`${format.toUpperCase()} export ready`);
    } catch (cause) {
      setError(true);
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Could not export results. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="results-export"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="results-export-trigger"
        disabled={!report || busy}
        aria-expanded={open}
        aria-controls={id}
        aria-label={busy ? "Preparing export" : "Export results"}
        title={
          report
            ? "Download simulation results"
            : "Run a simulation to export results"
        }
        onClick={() => setOpen(!open)}
      >
        {busy ? (
          <LoaderCircle size={16} className="results-spinner" />
        ) : (
          <Download size={16} />
        )}
        <span>{busy ? "Exporting…" : "Export results"}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div
          className="results-export-menu"
          id={id}
          role="group"
          aria-label="Export formats"
        >
          <div className="results-export-intro">
            <strong>Download results</strong>
            <span>Uses your selected engineering units</span>
          </div>
          {formats.map(({ id, label, detail, extension, icon: Icon }) => (
            <button type="button" key={id} onClick={() => void save(id)}>
              <Icon size={19} />
              <span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </span>
              <em>{extension}</em>
            </button>
          ))}
          <p>Exports include every stream, regardless of search.</p>
        </div>
      )}
      <div
        className={`results-export-feedback ${error ? "is-error" : ""}`}
        role="status"
        aria-live="polite"
      >
        {message && (
          <>
            {!busy && !error && <Check size={12} />} {message}
          </>
        )}
      </div>
    </div>
  );
}

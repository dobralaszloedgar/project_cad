"use client";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  FlaskConical,
  Plus,
  Search,
  X,
} from "lucide-react";
import type { Project } from "@/domain/schema";
import { sampleCatalog } from "@/domain/thermo/catalog";
import {
  defaultThermo,
  modelInfo,
  type ThermoSettings,
} from "@/domain/thermo/registry";
import {
  catalogChoices,
  resolveCatalogSettings,
  type ChemicalChoice,
  type ComponentChoices,
} from "@/lib/chemical-catalog";
import {
  CHEMICAL_PAGE_SIZE,
  chemicalSortPreference,
  rememberChemicalSort,
  type ChemicalSearchField,
  type ChemicalSearchSort,
} from "@/lib/chemical-search";
import "./thermo-settings.css";

type SearchPage = {
  release: string;
  total: number;
  catalogTotal: number;
  results: ChemicalChoice[];
};

export default function ProjectComponents({
  project,
  onApply,
  onCancel,
}: {
  project: Project;
  onApply: (settings: ThermoSettings) => void;
  onCancel: () => void;
}) {
  const current = project.thermo ?? defaultThermo;
  const [choices, setChoices] = useState<ComponentChoices>(() =>
    current.mixture === "demo"
      ? [sampleCatalog.get("A"), sampleCatalog.get("B")]
      : catalogChoices(current),
  );
  const [release, setRelease] = useState(current.catalog?.release);
  const [query, setQuery] = useState("");
  const [field, setField] = useState<ChemicalSearchField>("all");
  const [sort, setSort] = useState<ChemicalSearchSort>(chemicalSortPreference);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const debounce = useRef(false);
  const [lookup, setLookup] = useState<{
    key: string;
    data?: SearchPage;
    error?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const key = JSON.stringify([
    query.trim(),
    field,
    sort,
    page,
    current.modelId,
    release,
    retry,
  ]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    const delay = debounce.current ? 250 : 0;
    debounce.current = false;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          query: query.trim(),
          field,
          sort,
          page: String(page),
          model: current.modelId,
          ...(release ? { release } : {}),
        });
        const response = await fetch(`/api/chemicals?${params}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Could not connect to Supabase.");
        if (!controller.signal.aborted) setLookup({ key, data });
      } catch (reason) {
        if (!controller.signal.aborted)
          setLookup({
            key,
            error:
              reason instanceof Error
                ? reason.message
                : "Chemical search failed.",
          });
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, field, sort, page, current.modelId, release, retry, key]);
  const loading = lookup?.key !== key;
  const data = !loading ? lookup?.data : undefined;
  const lookupError = !loading ? lookup?.error : undefined;
  const selectedCount = choices.filter(Boolean).length;
  const hasSynthetic = choices.some(
    (choice) => choice && ["A", "B"].includes(choice.id),
  );
  const pages = data
    ? Math.max(1, Math.ceil(data.total / CHEMICAL_PAGE_SIZE))
    : page;
  return (
    <form
      className="project-components"
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving || selectedCount !== 2 || hasSynthetic) return;
        setSaving(true);
        setError("");
        const controller = new AbortController();
        request.current = controller;
        try {
          const settings = await resolveCatalogSettings(
            current,
            choices,
            release ?? data?.release,
            controller.signal,
          );
          if (!controller.signal.aborted) onApply(settings);
        } catch (reason) {
          if (!controller.signal.aborted)
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not save components.",
            );
        } finally {
          if (!controller.signal.aborted) setSaving(false);
        }
      }}
    >
      <div className="components-workbench">
        <section className="chemical-browser" aria-label="Chemical database">
          <header className="component-panel-heading">
            <div>
              <Database size={17} />
              <h3>Chemical database</h3>
            </div>
            <span className="component-badge">
              {data
                ? `${data.catalogTotal.toLocaleString()} chemicals`
                : loading
                  ? "Loading…"
                  : "Unavailable"}
            </span>
          </header>
          <div className="chemical-search-tools">
            <div className="chemical-search">
              <Search size={17} aria-hidden="true" />
              <input
                autoFocus
                type="search"
                aria-label="Search chemical database"
                placeholder="Name, CAS number or formula…"
                maxLength={100}
                value={query}
                onChange={(event) => {
                  debounce.current = true;
                  setQuery(event.target.value);
                  setPage(1);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    debounce.current = false;
                    setRetry((n) => n + 1);
                  }
                }}
              />
              {query && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Clear chemical search"
                  onClick={() => {
                    debounce.current = false;
                    setQuery("");
                    setPage(1);
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <select
              aria-label="Search chemical field"
              value={field}
              onChange={(event) => {
                setField(event.target.value as ChemicalSearchField);
                setPage(1);
              }}
            >
              <option value="all">All identifiers</option>
              <option value="name">Name</option>
              <option value="cas">CAS number</option>
              <option value="formula">Formula</option>
            </select>
            <select
              aria-label="Sort chemicals"
              value={sort}
              onChange={(event) => {
                const value = event.target.value as ChemicalSearchSort;
                setSort(value);
                rememberChemicalSort(value);
                setPage(1);
              }}
            >
              <option value="relevance">Relevance</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>
          <p className="chemical-search-help">
            {sort === "name"
              ? "Chemical names A–Z."
              : query.trim()
                ? "Matches first, then common process chemicals and available property data."
                : "Common process chemicals first, then available property data."}
            {query.trim() &&
            query.normalize("NFKC").replace(/[^a-z0-9]/gi, "").length <= 2
              ? " Short searches match name prefixes or complete identifiers."
              : ""}
          </p>
          <div className="chemical-results" aria-busy={loading}>
            {loading ? (
              <p className="chemical-empty" role="status">
                Searching…
              </p>
            ) : lookupError ? (
              <div className="chemical-empty" role="alert">
                <p>{lookupError}</p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setRetry((n) => n + 1)}
                >
                  Retry search
                </button>
              </div>
            ) : !data?.results.length ? (
              <p className="chemical-empty" role="status">
                No chemicals found.
              </p>
            ) : (
              <table
                className="chemical-table"
                aria-label="Chemical search results"
              >
                <thead>
                  <tr>
                    <th scope="col">Chemical</th>
                    <th scope="col">CAS number</th>
                    <th scope="col">
                      <span className="sr-only">Add to project</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((chemical) => {
                    const added = choices.some((c) => c?.id === chemical.id);
                    return (
                      <tr key={chemical.id}>
                        <td>
                          <div className="chemical-name">
                            <strong>{chemical.name}</strong>
                            <small>{chemical.formula}</small>
                          </div>
                        </td>
                        <td className="chemical-cas">{chemical.id}</td>
                        <td>
                          <button
                            type="button"
                            className={`chemical-add ${added ? "added" : ""}`}
                            aria-label={
                              added
                                ? `${chemical.name} is in project`
                                : `Add ${chemical.name} to project`
                            }
                            title={
                              !added && selectedCount === 2
                                ? "Remove a component to replace it"
                                : undefined
                            }
                            disabled={saving || added || selectedCount === 2}
                            onClick={() => {
                              setRelease(
                                (previous) => previous ?? data.release,
                              );
                              setChoices((previous) =>
                                !previous[0]
                                  ? [chemical, previous[1]]
                                  : [previous[0], chemical],
                              );
                              setError("");
                            }}
                          >
                            {added ? <Check size={14} /> : <Plus size={14} />}
                            <span>{added ? "Added" : "Add"}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="chemical-pagination">
            <span role="status">
              {data
                ? data.total
                  ? `${((page - 1) * CHEMICAL_PAGE_SIZE + 1).toLocaleString()}–${((page - 1) * CHEMICAL_PAGE_SIZE + data.results.length).toLocaleString()} of ${data.total.toLocaleString()} results`
                  : "0 results"
                : ""}
            </span>
            <div>
              <button
                type="button"
                className="icon-button"
                aria-label="Previous chemical page"
                disabled={loading || !data || page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                <ChevronLeft size={15} />
              </button>
              <span>
                Page {page} of {pages}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="Next chemical page"
                disabled={loading || !data || page >= pages}
                onClick={() => setPage((value) => value + 1)}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </section>
        <section
          className="selected-components"
          aria-label="Selected components"
        >
          <header className="component-panel-heading">
            <div>
              <FlaskConical size={17} />
              <h3>Selected components</h3>
            </div>
            <span className="component-badge">{selectedCount} / 2</span>
          </header>
          <p className="component-model">{modelInfo(current.modelId).label}</p>
          <div className="component-slots">
            {([0, 1] as const).map((i) => (
              <div
                key={i}
                className="component-slot"
                aria-label={`Component ${i === 0 ? "A" : "B"}`}
              >
                <span className="component-slot-label">
                  {i === 0 ? "A" : "B"}
                </span>
                {choices[i] ? (
                  <>
                    <div className="selected-chemical">
                      <strong>{choices[i]!.name}</strong>
                      <small>
                        {["A", "B"].includes(choices[i]!.id)
                          ? "Built-in teaching species · properties included"
                          : `${choices[i]!.formula ?? ""} · ${choices[i]!.id}`}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove component ${i === 0 ? "A" : "B"}`}
                      disabled={saving}
                      onClick={() => {
                        setChoices((previous) =>
                          i === 0
                            ? [undefined, previous[1]]
                            : [previous[0], undefined],
                        );
                        setError("");
                      }}
                    >
                      <X size={15} />
                    </button>
                  </>
                ) : (
                  <span className="component-empty-slot">Add a chemical</span>
                )}
              </div>
            ))}
          </div>
          {hasSynthetic && (
            <p className="components-notice">
              Synthetic A/B properties are already specified. To use catalog
              chemicals instead, replace both components.
            </p>
          )}
          {project.units.some((unit) => unit.kind === "PBR") && (
            <p className="components-notice">
              The sample reactor requires synthetic A/B.
            </p>
          )}
        </section>
      </div>
      <footer className="components-footer">
        {error && (
          <p role="alert" className="components-error">
            {error}
          </p>
        )}
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={saving || selectedCount !== 2 || hasSynthetic}
        >
          {saving ? "Saving…" : "Apply components"}
        </button>
      </footer>
    </form>
  );
}

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
import {
  cachedChemicalSearch,
  chemicalSearchKey,
  loadChemicalSearch,
  type ChemicalSearchPage,
} from "@/lib/chemical-search-client";
import ChemicalFormula from "./ChemicalFormula";
import "./thermo-settings.css";

export default function ProjectComponents({
  project,
  onApply,
}: {
  project: Project;
  onApply: (settings: ThermoSettings) => void;
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
    data?: ChemicalSearchPage;
    error?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const searchKey = chemicalSearchKey({
    query,
    field,
    sort,
    page,
    model: current.modelId,
    release,
  });
  const key = JSON.stringify([searchKey, retry]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    let active = true;
    const cacheHit = cachedChemicalSearch(searchKey);
    const delay = cacheHit ? 0 : debounce.current ? 150 : 0;
    debounce.current = false;
    const timer = setTimeout(async () => {
      try {
        const data = await loadChemicalSearch({
          query,
          field,
          sort,
          page,
          model: current.modelId,
          release,
        });
        if (active) setLookup({ key, data });
      } catch (reason) {
        if (active)
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
      active = false;
    };
  }, [
    query,
    field,
    sort,
    page,
    current.modelId,
    release,
    retry,
    searchKey,
    key,
  ]);
  const data =
    lookup?.key === key ? lookup.data : cachedChemicalSearch(searchKey);
  const loading = !data && lookup?.key !== key;
  const lookupError = lookup?.key === key ? lookup.error : undefined;
  const selectedCount = choices.filter(Boolean).length;
  const hasSynthetic = choices.some(
    (choice) => choice && ["A", "B"].includes(choice.id),
  );
  const pages = data
    ? Math.max(1, Math.ceil(data.total / CHEMICAL_PAGE_SIZE))
    : page;

  async function saveComponents(
    nextChoices: ComponentChoices,
    nextRelease = release ?? data?.release,
  ) {
    const selected = nextChoices.filter((choice) => choice !== undefined);
    if (
      request.current ||
      selected.length < 2 ||
      selected.some((choice) => ["A", "B"].includes(choice.id))
    )
      return;
    const controller = new AbortController();
    request.current = controller;
    setSaving(true);
    setError("");
    try {
      const settings = await resolveCatalogSettings(
        current,
        selected,
        nextRelease,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        onApply(settings);
        setChoices(selected);
        setRelease(settings.catalog?.release);
      }
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not save components.",
        );
    } finally {
      if (!controller.signal.aborted) setSaving(false);
      if (request.current === controller) request.current = null;
    }
  }

  function addChemical(chemical: ChemicalChoice) {
    if (
      request.current ||
      saving ||
      choices.some((choice) => choice?.id === chemical.id) ||
      selectedCount >= 40 ||
      !data
    )
      return;
    const empty = choices.findIndex((choice) => !choice);
    const next =
      empty < 0
        ? [...choices, chemical]
        : choices.map((choice, i) => (i === empty ? chemical : choice));
    const nextRelease = release ?? data.release;
    if (
      next.filter(Boolean).length >= 2 &&
      !next.some((choice) => choice && ["A", "B"].includes(choice.id))
    ) {
      void saveComponents(next, nextRelease);
    } else {
      setChoices(next);
      setRelease(nextRelease);
      setError("");
    }
  }

  function removeChemical(index: number) {
    if (request.current || saving) return;
    const next = choices.map((choice, i) => (i === index ? undefined : choice));
    if (
      next.filter(Boolean).length >= 2 &&
      !next.some((choice) => choice && ["A", "B"].includes(choice.id))
    ) {
      void saveComponents(next);
    } else {
      setChoices(next);
      setError("");
    }
  }

  return (
    <div className="project-components" aria-busy={saving}>
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
                      <tr
                        key={chemical.id}
                        onDoubleClick={() => addChemical(chemical)}
                      >
                        <td>
                          <div className="chemical-name">
                            <strong>{chemical.name}</strong>
                            <small>
                              <ChemicalFormula formula={chemical.formula} />
                            </small>
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
                              !added && selectedCount >= 40
                                ? "Maximum 40 components"
                                : undefined
                            }
                            disabled={saving || added || selectedCount >= 40}
                            onClick={() => addChemical(chemical)}
                            onDoubleClick={(event) => event.stopPropagation()}
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
            <span className="component-badge">{selectedCount} / 40</span>
          </header>
          <p className="component-model">{modelInfo(current.modelId).label}</p>
          {(saving || hasSynthetic || selectedCount < 2) && (
            <p className="component-save-status" role="status">
              {saving
                ? "Saving changes…"
                : hasSynthetic
                  ? "Replace both teaching species to save catalog chemicals."
                  : "Choose at least two chemicals to save the mixture."}
            </p>
          )}
          <div className="component-slots">
            {choices.map((_, i) => (
              <div key={i} className="component-slot">
                {choices[i] ? (
                  <>
                    <div className="selected-chemical">
                      <strong>{choices[i]!.name}</strong>
                      <small>
                        {["A", "B"].includes(choices[i]!.id) ? (
                          "Built-in teaching species · properties included"
                        ) : (
                          <>
                            {choices[i]!.formula && (
                              <>
                                <ChemicalFormula
                                  formula={choices[i]!.formula}
                                />
                                {" · "}
                              </>
                            )}
                            {choices[i]!.id}
                          </>
                        )}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove ${choices[i]!.name} from project`}
                      disabled={saving}
                      onClick={() => removeChemical(i)}
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
              Configure reactants and products in each PBR reaction set.
              Existing reactions keep their component identities; review them
              after removing components.
            </p>
          )}
        </section>
      </div>
      {error && (
        <p role="alert" className="components-error">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import type { ModelId } from "@/domain/thermo/registry";
export interface ChemicalChoice {
  id: string;
  name: string;
  formula?: string;
}
export default function ChemicalPicker({
  label,
  model,
  release,
  value,
  onSelect,
  onRelease,
  disabled,
}: {
  label: string;
  model: ModelId;
  release?: string;
  value?: ChemicalChoice;
  onSelect: (choice: ChemicalChoice) => void;
  onRelease: (release: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<{
    results: ChemicalChoice[];
    total: number;
    release: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      setPage(null);
      try {
        const params = new URLSearchParams({
          query: query.trim(),
          model,
          ...(release ? { release } : {}),
        });
        const response = await fetch(`/api/chemicals?${params}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Chemical search failed.");
        if (!controller.signal.aborted) setPage(data);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Chemical search failed.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, model, release]);
  return (
    <fieldset className="chemical-picker" disabled={disabled}>
      <legend>{label}</legend>
      <label>
        Search {label.toLowerCase()}
        <input
          className="input"
          type="search"
          maxLength={100}
          value={query}
          placeholder="Name, formula or CAS number"
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(null);
            setError("");
            setLoading(!!e.target.value.trim());
          }}
        />
      </label>
      {value ? (
        <p className="chemical-selected">
          <strong>{value.name}</strong>{" "}
          <span>
            {value.id}
            {value.formula ? ` · ${value.formula}` : ""}
          </span>
        </p>
      ) : (
        <p className="muted">Choose a chemical for this component.</p>
      )}
      {query.trim() && (
        <div aria-live="polite">
          {loading && <p>Searching catalog…</p>}
          {error && <p role="alert">{error}</p>}
          {page && (
            <>
              <p className="muted">
                {page.total === 0
                  ? "No supported chemicals found for this model."
                  : `${page.total} supported ${page.total === 1 ? "chemical" : "chemicals"}${page.total > 20 ? " · showing first 20" : ""}`}
              </p>
              <ul
                className="chemical-search-results"
                aria-label={`${label} search results`}
              >
                {page.results.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onRelease(page.release);
                        onSelect(c);
                        setQuery("");
                        setPage(null);
                        setLoading(false);
                      }}
                    >
                      <strong>{c.name}</strong>
                      <span>
                        {c.id} · {c.formula}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </fieldset>
  );
}

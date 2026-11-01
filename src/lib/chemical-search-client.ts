import type { ModelId } from "../domain/thermo/registry";
import type { ChemicalChoice } from "./chemical-catalog";
import {
  chemicalSortPreference,
  type ChemicalSearchField,
  type ChemicalSearchSort,
} from "./chemical-search";

export type ChemicalSearchPage = {
  release: string;
  total: number;
  catalogTotal: number;
  results: ChemicalChoice[];
};

export type ChemicalSearchOptions = {
  query: string;
  field: ChemicalSearchField;
  sort: ChemicalSearchSort;
  page: number;
  model: ModelId;
  release?: string;
};

const pages = new Map<string, { data: ChemicalSearchPage; expires: number }>();
const requests = new Map<string, Promise<ChemicalSearchPage>>();

export function chemicalSearchKey(options: ChemicalSearchOptions) {
  return new URLSearchParams({
    query: options.query.trim().toLowerCase(),
    field: options.field,
    sort: options.sort,
    page: String(options.page),
    model: options.model,
    ...(options.release ? { release: options.release } : {}),
  }).toString();
}

export function cachedChemicalSearch(key: string) {
  const cached = pages.get(key);
  return cached && cached.expires > Date.now() ? cached.data : undefined;
}

function cachePage(key: string, data: ChemicalSearchPage, lifetime: number) {
  if (pages.size >= 64) pages.delete(pages.keys().next().value!);
  pages.set(key, { data, expires: Date.now() + lifetime });
}

export function loadChemicalSearch(options: ChemicalSearchOptions) {
  const key = chemicalSearchKey(options);
  const cached = cachedChemicalSearch(key);
  if (cached) return Promise.resolve(cached);
  const pending = requests.get(key);
  if (pending) return pending;

  // A picker can close/reopen while the workspace preloads this same page.
  // Share the lookup; callers ignore obsolete results without canceling it.
  const request = fetch(`/api/chemicals?${key}`, {
    signal: AbortSignal.timeout(20_000),
  })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not load the chemical database.");
      cachePage(key, data, options.release ? 3_600_000 : 60_000);
      // Adding the first chemical pins the release. Reuse the same results.
      cachePage(
        chemicalSearchKey({ ...options, release: data.release }),
        data,
        3_600_000,
      );
      return data as ChemicalSearchPage;
    })
    .catch((error: unknown) => {
      if (error instanceof Error && error.name === "TimeoutError")
        throw new Error("Chemical search timed out. Please retry.");
      throw error;
    })
    .finally(() => requests.delete(key));
  requests.set(key, request);
  return request;
}

export function prefetchChemicalSearch(model: ModelId, release?: string) {
  void loadChemicalSearch({
    query: "",
    field: "all",
    sort: chemicalSortPreference(),
    page: 1,
    model,
    release,
  }).catch(() => {
    // Opening the picker retries and reports any connection failure there.
  });
}

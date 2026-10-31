export const chemicalSearchFields = ["all", "name", "cas", "formula"] as const;
export const chemicalSearchSorts = ["relevance", "name"] as const;
export type ChemicalSearchField = (typeof chemicalSearchFields)[number];
export type ChemicalSearchSort = (typeof chemicalSearchSorts)[number];
export const CHEMICAL_PAGE_SIZE = 20;
const SORT_KEY = "project-cad.chemicalSort";

export function chemicalSortPreference(): ChemicalSearchSort {
  try {
    return localStorage.getItem(SORT_KEY) === "name" ? "name" : "relevance";
  } catch {
    return "relevance";
  }
}

export function rememberChemicalSort(sort: ChemicalSearchSort) {
  try {
    localStorage.setItem(SORT_KEY, sort);
  } catch {
    // Sorting still works when browser storage is unavailable.
  }
}

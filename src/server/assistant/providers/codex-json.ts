// Included in the packaged Node 24 runtime; not yet declared by TypeScript's lib.
const rawJSON = (JSON as typeof JSON & { rawJSON(text: string): object })
  .rawJSON;

/** Keep large JSON numbers numeric without triggering app-server's u128 parser. */
export function codexJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "number" &&
    Number.isInteger(item) &&
    !Number.isSafeInteger(item)
      ? rawJSON(item.toExponential())
      : item,
  );
}

// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

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

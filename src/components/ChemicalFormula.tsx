// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

export default function ChemicalFormula({ formula }: { formula?: string }) {
  return formula
    ?.split(/(\d+)/)
    .map((part, index, parts) =>
      /^\d+$/.test(part) && /[A-Za-z)\]]$/.test(parts[index - 1] ?? "") ? (
        <sub key={index}>{part}</sub>
      ) : (
        part
      ),
    );
}

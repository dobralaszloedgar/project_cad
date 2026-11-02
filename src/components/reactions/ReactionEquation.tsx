// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { Chemical } from "@/domain/thermo/data";
import type { Reaction } from "@/domain/reactions/schema";
import ChemicalFormula from "../ChemicalFormula";

export function ReactionEquation({
  reaction,
  chemicals,
}: {
  reaction: Reaction;
  chemicals: Chemical[];
}) {
  const side = (sign: number) => {
    const rows = reaction.stoichiometry.filter(
      (row) => row.coefficient * sign > 0,
    );
    return rows.length
      ? rows.map((row, index) => {
          const chemical = chemicals.find((c) => c.id === row.componentId);
          return (
            <span key={row.componentId}>
              {index > 0 && " + "}
              {Math.abs(row.coefficient) !== 1 &&
                `${Math.abs(row.coefficient)} `}
              {chemical?.formula ? (
                <ChemicalFormula formula={chemical.formula} />
              ) : (
                (chemical?.name ?? row.componentId)
              )}
            </span>
          );
        })
      : "…";
  };
  return (
    <>
      {side(-1)} {reaction.rateLaw?.reversible ? "⇌" : "→"} {side(1)}
    </>
  );
}

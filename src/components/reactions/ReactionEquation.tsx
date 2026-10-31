import type { Chemical } from "@/domain/thermo/data";
import type { Reaction } from "@/domain/reactions/schema";

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
              {chemical?.formula
                ? chemical.formula
                    .split(/(\d+)/)
                    .map((part, i, parts) =>
                      /^\d+$/.test(part) &&
                      /[A-Za-z)\]]$/.test(parts[i - 1] ?? "") ? (
                        <sub key={i}>{part}</sub>
                      ) : (
                        part
                      ),
                    )
                : (chemical?.name ?? row.componentId)}
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

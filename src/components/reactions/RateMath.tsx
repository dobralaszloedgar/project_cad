import { useMemo } from "react";
import katex from "katex";
import type { Chemical as ChemicalComponent } from "@/domain/thermo/data";
import type { RateLaw } from "@/domain/reactions/rateLawSchema";
import { rateFormula, ratePreview } from "@/domain/reactions/rateLaw";
import {
  escapeMathText,
  rateExpressionLatex,
} from "@/domain/reactions/rateExpression";

export function MathFormula({
  latex,
  label,
  className = "",
}: {
  latex: string;
  label: string;
  className?: string;
}) {
  const markup = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode: true,
        output: "htmlAndMathml",
        throwOnError: true,
        trust: false,
        strict: "ignore",
        maxSize: 20,
        maxExpand: 1000,
      });
    } catch {
      return null;
    }
  }, [latex]);
  return markup ? (
    <div
      className={`typeset-math ${className}`}
      role="math"
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  ) : (
    <p className="engineering-help">
      Complete the expression to see its formatted equation.
    </p>
  );
}
export function chemicalLatex(component?: ChemicalComponent, fallback = "A") {
  const formula = component?.formula;
  return formula && /^[A-Za-z0-9()]+$/.test(formula)
    ? `\\mathrm{${formula.replace(/(\d+)/g, "_{$1}")}}`
    : `\\text{${escapeMathText(component?.name ?? fallback)}}`;
}
export function RateMath({
  law,
  components,
  basisName,
}: {
  law: RateLaw;
  components: ChemicalComponent[];
  basisName: string;
}) {
  let latex: string;
  try {
    const labels = Object.fromEntries(
      law.variables.map((v) => {
        const species = chemicalLatex(
          components.find((c) => c.id === v.componentId),
          v.symbol,
        );
        const prefix = {
          concentration: "C",
          "partial-pressure": "p",
          "mole-fraction": "x",
          "mass-concentration": "\\rho",
          "mass-fraction": "w",
        }[v.basis];
        return [v.symbol, `${prefix}_{${species}}`];
      }),
    );
    latex = `-r_{${chemicalLatex(
      components.find((c) => c.name === basisName),
      basisName,
    )}} = ${rateExpressionLatex(
      rateFormula(law),
      [...law.variables, ...law.parameters].map((v) => v.symbol),
      labels,
    )}`;
  } catch {
    return (
      <p className="engineering-help">
        Complete the expression to see its formatted equation.
      </p>
    );
  }
  return (
    <MathFormula
      latex={latex}
      label={`Net disappearance of ${basisName}: ${ratePreview(law, components)}`}
    />
  );
}

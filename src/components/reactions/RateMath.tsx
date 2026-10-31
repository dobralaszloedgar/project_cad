import { useMemo } from "react";
import katex from "katex";
import type { Chemical as ChemicalComponent } from "@/domain/thermo/data";
import type { RateLaw } from "@/domain/reactions/rateLawSchema";
import { rateFormula, ratePreview } from "@/domain/reactions/rateLaw";
import {
  escapeMathText,
  rateExpressionLatex,
  rateExpressionSymbols,
  rateSymbolLatex,
} from "@/domain/reactions/rateExpression";
import "katex/dist/katex.min.css";

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
  parameterValues,
}: {
  law: RateLaw;
  components: ChemicalComponent[];
  basisName: string;
  parameterValues?: Record<string, number>;
}) {
  let latex: string;
  try {
    const formula = rateFormula(law);
    const symbols = rateExpressionSymbols(formula);
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
    for (const parameter of law.parameters) {
      if (!symbols.has(parameter.symbol)) continue;
      if (parameterValues) {
        const value = parameterValues[parameter.symbol];
        if (!Number.isFinite(value)) throw new Error("Incomplete constant");
        const text = String(Number(value.toPrecision(7)));
        const numeric = rateExpressionLatex(text, []);
        labels[parameter.symbol] =
          value < 0 || /e/i.test(text) ? `\\left(${numeric}\\right)` : numeric;
      } else if (parameter.activationEnergy) {
        labels[parameter.symbol] = `${rateSymbolLatex(parameter.symbol)}(T)`;
      }
    }
    latex = `-r_{${chemicalLatex(
      components.find((c) => c.name === basisName),
      basisName,
    )}} = ${rateExpressionLatex(
      formula,
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

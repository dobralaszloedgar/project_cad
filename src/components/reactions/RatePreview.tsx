"use client";

import { useState } from "react";
import type { Chemical } from "@/domain/thermo/data";
import type { RateLaw } from "@/domain/reactions/rateLawSchema";
import {
  displayUnit,
  rateFormula,
  ratePreview,
  rateParameterValues,
} from "@/domain/reactions/rateLaw";
import { RateMath } from "./RateMath";
import { rateExpressionSymbols } from "@/domain/reactions/rateExpression";

export function RatePreview({
  law,
  components,
  basisName,
  temperature,
}: {
  law: RateLaw;
  components: Chemical[];
  basisName: string;
  temperature: number;
}) {
  const [substitute, setSubstitute] = useState(false);
  let values: Record<string, number> = {};
  try {
    values = rateParameterValues(law, temperature);
  } catch {
    /* Invalid draft. */
  }
  const symbols = rateExpressionSymbols(rateFormula(law));
  const parameters = law.parameters.filter((p) => symbols.has(p.symbol));
  return (
    <section className="rate-preview" aria-label="Live rate law">
      <div className="rate-preview-heading">
        <span className="rate-eyebrow">Live rate expression</span>
        <div
          className="rate-preview-mode"
          role="group"
          aria-label="Equation display"
        >
          <button
            type="button"
            aria-pressed={!substitute}
            onClick={() => setSubstitute(false)}
          >
            Symbolic
          </button>
          <button
            type="button"
            aria-pressed={substitute}
            onClick={() => setSubstitute(true)}
          >
            With constants
          </button>
        </div>
      </div>
      <div
        className="rate-equation"
        data-testid="rate-preview"
        aria-live="polite"
        aria-atomic="true"
        aria-label={ratePreview(law, components)}
      >
        <RateMath
          law={law}
          components={components}
          basisName={basisName}
          parameterValues={substitute ? values : undefined}
        />
      </div>
      <p>
        Net disappearance of {basisName} · {displayUnit(law.rateUnit)}
        {law.rateUnit.includes("kg") && " · per kg catalyst"}
      </p>
      {!!parameters.length && (
        <p className="rate-preview-constants" aria-live="polite">
          <span>
            At{" "}
            {Number.isFinite(temperature)
              ? Number(temperature.toPrecision(7))
              : "—"}{" "}
            K:
          </span>
          {parameters.map((p) => (
            <span key={p.symbol}>
              {p.symbol}
              {p.activationEnergy ? "(T)" : ""} ={" "}
              {Number.isFinite(values[p.symbol])
                ? Number(values[p.symbol].toPrecision(7))
                : "—"}
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

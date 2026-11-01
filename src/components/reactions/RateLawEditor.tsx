"use client";
import { useRef, useState } from "react";
import { Maximize2, Plus, X } from "lucide-react";
import type { Chemical as ChemicalComponent } from "@/domain/thermo/data";
import type { RateLaw, RateVariable } from "@/domain/reactions/rateLawSchema";
import {
  basisOptions,
  displayUnit,
  parameterUnit,
  rateFormula,
  rateLawIssues,
  rateParameterValues,
  rateSymbolIssue,
  renameRateSymbol,
} from "@/domain/reactions/rateLaw";
import { compileRateExpression } from "@/domain/reactions/rateExpression";
import { MathFormula } from "./RateMath";
import { rateSymbolLatex } from "@/domain/reactions/rateExpression";
import { EngineeringHelp } from "./ReactionHelp";
import NumberInput from "../NumberInput";
import { RatePreview } from "./RatePreview";

function SymbolField({
  symbol,
  label,
  law,
  onChange,
}: {
  symbol: string;
  label: string;
  law: RateLaw;
  onChange: (law: RateLaw) => void;
}) {
  const [draft, setDraft] = useState(symbol);
  const issue = rateSymbolIssue(law, symbol, draft.trim());
  const commit = () => {
    if (!issue && draft.trim() !== symbol)
      onChange(renameRateSymbol(law, symbol, draft.trim()));
  };
  return (
    <label className="rate-symbol-field">
      Symbol
      <input
        className="input input-sm"
        aria-label={label}
        value={draft}
        maxLength={40}
        spellCheck={false}
        aria-invalid={!!issue}
        ref={(node) => node?.setCustomValidity(issue ?? "")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
      />
      {issue && (
        <span className="rate-symbol-error" role="alert">
          {issue}
        </span>
      )}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  sample = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  sample?: boolean;
}) {
  return (
    <NumberInput
      className="input input-sm"
      scientific
      required
      // Sample arithmetic is independent of the equipment form's validation.
      form={sample ? "rate-sample-values" : undefined}
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onValueChange={onChange}
    />
  );
}
export function RateLawEditor({
  law,
  components,
  packed,
  basisName,
  onChange,
  reactionName,
  temperature,
}: {
  law: RateLaw;
  components: ChemicalComponent[];
  packed: boolean;
  basisName: string;
  onChange: (law: RateLaw) => void;
  reactionName?: string;
  temperature: number;
}) {
  const patch = (change: Partial<RateLaw>) => onChange({ ...law, ...change });
  const expressionRef = useRef<HTMLTextAreaElement>(null);
  const [expanded, setExpanded] = useState(false);
  const expandButton = useRef<HTMLButtonElement>(null);
  const closeExpanded = () => {
    setExpanded(false);
    requestAnimationFrame(() => expandButton.current?.focus());
  };
  const [samples, setSamples] = useState<Record<string, number>>({
    T: temperature,
    P: 100000,
  });
  const issues = rateLawIssues(
    law,
    components.map((c) => c.id),
    packed,
  );
  const variableName = (symbol: string) => {
    const v = law.variables.find((v) => v.symbol === symbol);
    return v
      ? `${symbol} · ${components.find((c) => c.id === v.componentId)?.name ?? "Select species"} (${displayUnit(v.unit)})`
      : symbol;
  };
  const nextSymbol = (prefix: string) => {
    let n = 1;
    while (
      [...law.variables, ...law.parameters].some(
        (v) => v.symbol === `${prefix}${n}`,
      )
    )
      n++;
    return `${prefix}${n}`;
  };
  const addVariable = () => {
    const symbol = nextSymbol("s");
    patch({
      variables: [
        ...law.variables,
        {
          symbol,
          componentId: components[0]?.id ?? "",
          basis: "concentration",
          unit: "mol/m3",
        },
      ],
    });
  };
  const insert = (text: string) => {
    const field = expressionRef.current;
    const start = field?.selectionStart ?? law.expression.length,
      end = field?.selectionEnd ?? start;
    patch({
      expression:
        law.expression.slice(0, start) + text + law.expression.slice(end),
    });
    requestAnimationFrame(() => {
      field?.focus();
      const cursor = text.includes("(")
        ? start + text.indexOf("(") + 1
        : start + text.length;
      field?.setSelectionRange(cursor, cursor);
    });
  };
  const factors = (direction: "forward" | "reverse") => (
    <div className="rate-factor-group">
      <h4>
        {direction === "forward"
          ? "Forward species factors"
          : "Reverse species factors"}
      </h4>
      <EngineeringHelp text="Multiply these factors. Orders are independent of stoichiometric coefficients; no rows means a zero-order term." />
      {law[direction].map((f, i) => (
        <div className="rate-factor-row" key={i}>
          <label>
            Species
            <select
              className="select select-sm"
              aria-label={`${direction} factor ${i + 1} species`}
              value={f.variable}
              onChange={(e) =>
                patch({
                  [direction]: law[direction].map((r, j) =>
                    j === i ? { ...r, variable: e.target.value } : r,
                  ),
                })
              }
            >
              {law.variables.map((v) => (
                <option key={v.symbol} value={v.symbol}>
                  {variableName(v.symbol)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Order
            <NumberField
              label={`${direction} factor ${i + 1} order`}
              value={f.order}
              onChange={(order) =>
                patch({
                  [direction]: law[direction].map((r, j) =>
                    j === i ? { ...r, order } : r,
                  ),
                })
              }
            />
          </label>
          <button
            type="button"
            className="btn btn-ghost btn-square btn-xs"
            aria-label={`Remove ${direction} factor ${i + 1}`}
            onClick={() =>
              patch({ [direction]: law[direction].filter((_, j) => j !== i) })
            }
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        disabled={!law.variables.length || law[direction].length >= 40}
        onClick={() =>
          patch({
            [direction]: [
              ...law[direction],
              { variable: law.variables[0].symbol, order: 1 },
            ],
          })
        }
      >
        <Plus size={12} />
        Add {direction} factor
      </button>
    </div>
  );
  let sampleResult: string;
  try {
    if (issues.length)
      throw new Error(
        "Resolve the expression issues above to evaluate a sample.",
      );
    const values: Record<string, number> = {
      T: samples.T,
      P: samples.P,
      R: 8.31446261815324,
    };
    if (!(values.T > 0 && values.P > 0))
      throw new Error(
        "Sample temperature and absolute pressure must be positive.",
      );
    for (const v of law.variables) {
      const value = samples[v.symbol] ?? 1;
      if (
        value < 0 ||
        !Number.isFinite(value) ||
        (v.basis.endsWith("fraction") && value > 1)
      )
        throw new Error(
          `${v.symbol}: use a nonnegative value; fractions must be between 0 and 1.`,
        );
      values[v.symbol] = value;
    }
    Object.assign(values, rateParameterValues(law, values.T));
    const result = compileRateExpression(
      rateFormula(law),
      [...law.variables, ...law.parameters].map((v) => v.symbol),
    )(values);
    sampleResult = `${result.toPrecision(6)} ${displayUnit(law.rateUnit)}${result < 0 ? " · net reverse reaction" : ""}`;
  } catch (error) {
    sampleResult = (error as Error).message;
  }
  const content = (
    <div className="rate-law-editor">
      <RatePreview
        law={law}
        components={components}
        basisName={basisName}
        temperature={temperature}
      />
      <div className="rate-editor-columns">
        <div className="rate-main-column">
          <div className="rate-two-columns">
            <label>
              Reaction phase
              <select
                className="select select-sm"
                aria-label="Kinetic phase"
                value={law.phase}
                onChange={(e) =>
                  patch({ phase: e.target.value as RateLaw["phase"] })
                }
              >
                <option value="gas">Gas (single phase)</option>
                <option value="liquid" disabled>
                  Liquid (requires a liquid reactor model)
                </option>
              </select>
            </label>
            <label>
              Rate output units
              <select
                className="select select-sm"
                aria-label="Rate output units"
                value={law.rateUnit}
                onChange={(e) =>
                  patch({ rateUnit: e.target.value as RateLaw["rateUnit"] })
                }
              >
                {(packed
                  ? ["mol/(kg*s)", "kmol/(kg*s)"]
                  : ["mol/(m3*s)", "mol/(L*s)", "kmol/(m3*s)"]
                ).map((u) => (
                  <option value={u} key={u}>
                    {displayUnit(u)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <EngineeringHelp text="Use the units from your published rate law. Changing a basis or unit changes the numerical law; update its constants to match. Partial pressures are absolute, pᵢ = xᵢP." />
          <div className="rate-group">
            <h4>1. Choose species and their basis</h4>
            <EngineeringHelp text="Mix bases in the same law, including inhibitors absent from the reaction. Rename a symbol with Enter or by leaving its field; the equation and both drafts update together." />
            {law.variables.map((v, i) => (
              <div className="rate-species-card" key={v.symbol}>
                <div className="rate-card-title">
                  <SymbolField
                    symbol={v.symbol}
                    label={`Rate species ${i + 1} symbol`}
                    law={law}
                    onChange={(next) => {
                      const symbol = next.variables[i].symbol;
                      setSamples({
                        ...samples,
                        [symbol]: samples[v.symbol] ?? 1,
                      });
                      onChange(next);
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-square btn-xs"
                    aria-label={`Remove rate species ${i + 1}`}
                    onClick={() =>
                      patch({
                        variables: law.variables.filter((_, j) => j !== i),
                        forward: law.forward.filter(
                          (f) => f.variable !== v.symbol,
                        ),
                        reverse: law.reverse.filter(
                          (f) => f.variable !== v.symbol,
                        ),
                        adsorption: law.adsorption.filter(
                          (f) => f.variable !== v.symbol,
                        ),
                      })
                    }
                  >
                    <X size={12} />
                  </button>
                </div>
                <label>
                  Species
                  <select
                    className="select select-sm"
                    aria-label={`Rate species ${i + 1}`}
                    value={v.componentId}
                    onChange={(e) =>
                      patch({
                        variables: law.variables.map((r, j) =>
                          j === i ? { ...r, componentId: e.target.value } : r,
                        ),
                      })
                    }
                  >
                    {!components.some((c) => c.id === v.componentId) && (
                      <option value={v.componentId}>
                        Select a project species
                      </option>
                    )}
                    {components.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="rate-two-columns">
                  <label>
                    Basis
                    <select
                      className="select select-sm"
                      aria-label={`Rate species ${i + 1} basis`}
                      value={v.basis}
                      onChange={(e) => {
                        const basis = basisOptions.find(
                          (b) => b.value === e.target.value,
                        )!;
                        patch({
                          variables: law.variables.map((r, j) =>
                            j === i
                              ? {
                                  ...r,
                                  basis: basis.value,
                                  unit: basis.units[0],
                                }
                              : r,
                          ),
                        });
                      }}
                    >
                      {basisOptions.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Unit
                    <select
                      className="select select-sm"
                      aria-label={`Rate species ${i + 1} unit`}
                      value={v.unit}
                      onChange={(e) =>
                        patch({
                          variables: law.variables.map((r, j) =>
                            j === i
                              ? {
                                  ...r,
                                  unit: e.target.value as RateVariable["unit"],
                                }
                              : r,
                          ),
                        })
                      }
                    >
                      {basisOptions
                        .find((b) => b.value === v.basis)!
                        .units.map((u) => (
                          <option key={u} value={u}>
                            {u === "1" ? "Dimensionless" : displayUnit(u)}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              disabled={!components.length || law.variables.length >= 40}
              onClick={addVariable}
            >
              <Plus size={12} />
              Add rate species
            </button>
          </div>
          <div className="rate-group">
            <h4>2. Build the rate law</h4>
            <label>
              Editing method
              <select
                className="select select-sm"
                aria-label="Rate editing method"
                value={law.mode}
                onChange={(e) =>
                  patch({
                    mode: e.target.value as RateLaw["mode"],
                    ...(e.target.value === "custom"
                      ? { expression: law.expression || rateFormula(law) }
                      : {}),
                  })
                }
              >
                <option value="table">Table builder · no formula typing</option>
                <option value="custom">Custom expression</option>
              </select>
            </label>
            {law.mode === "table" ? (
              <>
                {factors("forward")}
                <label className="rate-toggle">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={law.reversible}
                    onChange={(e) => patch({ reversible: e.target.checked })}
                  />
                  Include reverse reaction
                </label>
                {law.reversible && factors("reverse")}
                <div className="rate-factor-group">
                  <h4>Adsorption / inhibition denominator</h4>
                  <EngineeringHelp text="Build (1 + K₁·aⁿ + K₂·bᵐ)ᵈ for Langmuir–Hinshelwood or inhibition kinetics. Each K·species term is dimensionless." />
                  {law.adsorption.map((a, i) => (
                    <div className="rate-factor-row" key={i}>
                      <label>
                        {a.parameter} × species
                        <select
                          className="select select-sm"
                          aria-label={`Adsorption ${i + 1} species`}
                          value={a.variable}
                          onChange={(e) =>
                            patch({
                              adsorption: law.adsorption.map((r, j) =>
                                j === i
                                  ? { ...r, variable: e.target.value }
                                  : r,
                              ),
                            })
                          }
                        >
                          {law.variables.map((v) => (
                            <option key={v.symbol} value={v.symbol}>
                              {variableName(v.symbol)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Order
                        <NumberField
                          label={`Adsorption ${i + 1} order`}
                          value={a.order}
                          onChange={(order) =>
                            patch({
                              adsorption: law.adsorption.map((r, j) =>
                                j === i ? { ...r, order } : r,
                              ),
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-ghost btn-square btn-xs"
                        aria-label={`Remove adsorption ${i + 1}`}
                        onClick={() =>
                          patch({
                            adsorption: law.adsorption.filter(
                              (_, j) => j !== i,
                            ),
                          })
                        }
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    disabled={
                      !law.variables.length ||
                      law.adsorption.length >= 40 ||
                      law.parameters.length >= 40
                    }
                    onClick={() => {
                      const parameter = nextSymbol("K");
                      patch({
                        adsorption: [
                          ...law.adsorption,
                          {
                            parameter,
                            variable: law.variables[0].symbol,
                            order: 1,
                          },
                        ],
                        parameters: [
                          ...law.parameters,
                          { symbol: parameter, value: 1 },
                        ],
                      });
                    }}
                  >
                    <Plus size={12} />
                    Add adsorption term
                  </button>
                  {!!law.adsorption.length && (
                    <label>
                      Denominator power
                      <NumberField
                        label="Denominator power"
                        min={Number.MIN_VALUE}
                        value={law.denominatorPower}
                        onChange={(denominatorPower) =>
                          patch({ denominatorPower })
                        }
                      />
                    </label>
                  )}
                </div>
              </>
            ) : (
              <>
                <EngineeringHelp text="Use * for multiplication and ^ for powers. Table and custom drafts are retained separately; switching to the table does not translate custom formulas." />
                <label>
                  Rate expression
                  <textarea
                    ref={expressionRef}
                    className="textarea textarea-bordered"
                    aria-label="Custom rate expression"
                    spellCheck={false}
                    maxLength={4000}
                    value={law.expression}
                    onChange={(e) => patch({ expression: e.target.value })}
                  />
                </label>
                <div
                  className="rate-insert"
                  aria-label="Insert into expression"
                >
                  {[
                    ...law.variables.map((v) => v.symbol),
                    ...law.parameters.map((p) => p.symbol),
                    "T",
                    "P",
                    "R",
                    "exp()",
                    "log()",
                    "sqrt()",
                    "abs()",
                    "min(,)",
                    "max(,)",
                    "pow(,)",
                    " * ",
                    " / ",
                    "^()",
                  ].map((s) => (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      key={s}
                      onClick={() => insert(s)}
                    >
                      {s.trim()}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() =>
                    patch({
                      expression: rateFormula({ ...law, mode: "table" }),
                    })
                  }
                >
                  Replace with table expression
                </button>
                <EngineeringHelp text="T in K · P in Pa · R = 8.314462618 J/(mol·K). Functions: exp, log / ln, sqrt, abs, min, max, pow. Custom parameter dimensions must match the selected rate units." />
              </>
            )}
          </div>
        </div>
        <aside className="rate-side-column">
          <div className="rate-group">
            <h4>3. Enter constants</h4>
            {law.parameters
              .filter(
                (p) =>
                  law.mode === "custom" ||
                  p.symbol === "kf" ||
                  (p.symbol === "kr" && law.reversible) ||
                  law.adsorption.some((a) => a.parameter === p.symbol),
              )
              .map((p) => {
                const update = (value: Partial<typeof p>) =>
                  patch({
                    parameters: law.parameters.map((r) =>
                      r.symbol === p.symbol ? { ...r, ...value } : r,
                    ),
                  });
                return (
                  <div className="rate-parameter" key={p.symbol}>
                    {!["kf", "kr"].includes(p.symbol) && (
                      <div className="rate-card-title">
                        <SymbolField
                          symbol={p.symbol}
                          label={`Parameter ${p.symbol} symbol`}
                          law={law}
                          onChange={onChange}
                        />
                        <button
                          type="button"
                          className="btn btn-ghost btn-square btn-xs"
                          aria-label={`Remove parameter ${p.symbol}`}
                          onClick={() =>
                            patch({
                              parameters: law.parameters.filter(
                                (row) => row.symbol !== p.symbol,
                              ),
                              adsorption: law.adsorption.filter(
                                (row) => row.parameter !== p.symbol,
                              ),
                            })
                          }
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                    <label>
                      {p.symbol} · {parameterUnit(law, p.symbol)}
                      <NumberField
                        label={`Parameter ${p.symbol}`}
                        min={
                          law.mode === "table" &&
                          (p.symbol === "kf" ||
                            p.symbol === "kr" ||
                            law.adsorption.some(
                              (a) => a.parameter === p.symbol,
                            ))
                            ? 0
                            : undefined
                        }
                        step={0.01}
                        value={p.value}
                        onChange={(value) => update({ value })}
                      />
                    </label>
                    <label className="rate-toggle">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        aria-label={`${p.symbol} temperature dependence`}
                        checked={p.activationEnergy !== undefined}
                        onChange={(e) =>
                          update({
                            activationEnergy: e.target.checked ? 0 : undefined,
                            referenceTemperature: e.target.checked
                              ? 298.15
                              : undefined,
                          })
                        }
                      />
                      Temperature dependence (Arrhenius)
                    </label>
                    {p.activationEnergy !== undefined && (
                      <>
                        <MathFormula
                          latex={`${rateSymbolLatex(p.symbol)}(T) = ${rateSymbolLatex(p.symbol)}(T_{\\mathrm{ref}}) \\exp\\left[-\\frac{E}{R}\\left(\\frac{1}{T}-\\frac{1}{T_{\\mathrm{ref}}}\\right)\\right]`}
                          label={`${p.symbol} reference-temperature Arrhenius equation`}
                          className="arrhenius-math"
                        />
                        <div className="rate-two-columns">
                          <label>
                            E (J/mol)
                            <NumberField
                              label={`${p.symbol} activation energy`}
                              value={p.activationEnergy}
                              onChange={(activationEnergy) =>
                                update({ activationEnergy })
                              }
                            />
                          </label>
                          <label>
                            Tref (K)
                            <NumberField
                              label={`${p.symbol} reference temperature`}
                              value={p.referenceTemperature ?? 298.15}
                              min={Number.MIN_VALUE}
                              step={1}
                              onChange={(referenceTemperature) =>
                                update({ referenceTemperature })
                              }
                            />
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            {law.mode === "custom" && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                disabled={law.parameters.length >= 40}
                onClick={() =>
                  patch({
                    parameters: [
                      ...law.parameters,
                      { symbol: nextSymbol("k"), value: 1 },
                    ],
                  })
                }
              >
                <Plus size={12} />
                Add parameter
              </button>
            )}
          </div>
          {issues.length > 0 ? (
            <div className="rate-errors" role="alert">
              <strong>Fix before applying</strong>
              <ul>
                {issues.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rate-valid" role="status">
              Expression is valid. Check a sample below.
            </p>
          )}
          <details className="rate-sample" open={expanded ? true : undefined}>
            <summary>Test the rate with sample values</summary>
            <p className="engineering-help">
              Manual test values, independent of the flowsheet. Enter each
              species value in its selected units; this checks arithmetic, not
              phase or dimensional consistency.
            </p>
            {[
              {
                symbol: "T",
                label: "Temperature (K)",
                min: Number.MIN_VALUE,
                max: undefined,
                step: 1,
              },
              {
                symbol: "P",
                label: "Total pressure (Pa)",
                min: Number.MIN_VALUE,
                max: undefined,
                step: 1000,
              },
              ...law.variables.map((v) => ({
                symbol: v.symbol,
                label: variableName(v.symbol),
                min: 0,
                max:
                  v.basis === "mole-fraction" || v.basis === "mass-fraction"
                    ? 1
                    : undefined,
                step:
                  v.basis === "mole-fraction" || v.basis === "mass-fraction"
                    ? 0.01
                    : 0.1,
              })),
            ].map((v) => (
              <label key={v.symbol}>
                {v.label}
                <NumberField
                  label={`Sample ${v.symbol}`}
                  sample
                  min={v.min}
                  max={v.max}
                  step={v.step}
                  value={samples[v.symbol] ?? 1}
                  onChange={(value) =>
                    setSamples({ ...samples, [v.symbol]: value })
                  }
                />
              </label>
            ))}
            <output
              className="rate-sample-result"
              aria-live="polite"
              data-testid="rate-sample-result"
            >
              {sampleResult}
            </output>
          </details>
        </aside>
      </div>
    </div>
  );
  return (
    <>
      <button
        ref={expandButton}
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setExpanded(true)}
      >
        <Maximize2 size={14} />
        Expand rate editor
      </button>
      {expanded ? (
        <dialog
          className="rate-dialog engineering-form"
          aria-label="Reaction rate editor"
          ref={(node) => {
            if (node && !node.open) node.showModal();
          }}
          onCancel={(event) => {
            event.preventDefault();
            event.stopPropagation();
            closeExpanded();
          }}
          onClose={(event) => {
            event.stopPropagation();
            closeExpanded();
          }}
          onKeyDown={(event) => {
            // Enter in a rate field must not submit the outer equipment form.
            if (
              event.key === "Enter" &&
              event.target instanceof HTMLInputElement
            )
              event.preventDefault();
          }}
        >
          <div className="rate-dialog-heading">
            <div>
              <span className="rate-eyebrow">Reaction kinetics</span>
              <h2>{reactionName || "Reaction rate editor"}</h2>
              <p>
                Build the rate law, inspect the equation, and test its values.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={closeExpanded}
            >
              Done editing
            </button>
          </div>
          <div className="rate-dialog-scroll">{content}</div>
          <div className="rate-dialog-footer">
            <span>
              Changes stay in your draft. Apply conditions in the equipment
              editor to save.
            </span>
            <span>
              {issues.length
                ? `${issues.length} item${issues.length === 1 ? "" : "s"} to check`
                : "Expression valid"}
            </span>
          </div>
        </dialog>
      ) : (
        content
      )}
    </>
  );
}

"use client";

import { useId, useRef, useState, type InputHTMLAttributes } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import "./number-input.css";

export type NumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange" | "min" | "max" | "step"
> & {
  value: number | string;
  min?: number;
  max?: number;
  /** Arrow increment. Decimal values remain unrestricted by a step grid. */
  step?: number;
  integer?: boolean;
  /** Preserve incomplete scientific notation in custom reaction laws. */
  scientific?: boolean;
  onValueChange: (value: number, text: string) => void;
};

function parseNumber(text: string) {
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text.trim())
    ? Number(text)
    : NaN;
}

function textValue(value: number | string) {
  return typeof value === "string"
    ? value
    : Number.isFinite(value)
      ? String(value)
      : "";
}

export default function NumberInput({
  value,
  min,
  max,
  step = 1,
  integer = false,
  scientific = false,
  onValueChange,
  className = "input",
  disabled,
  readOnly,
  onKeyDown,
  ...props
}: NumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fallbackId = useId();
  const inputId = props.id ?? fallbackId;
  const [draft, setDraft] = useState({ value, text: textValue(value) });
  if (!Object.is(draft.value, value))
    setDraft({ value, text: textValue(value) });

  const current = parseNumber(draft.text);
  const lower = min ?? -Number.MAX_VALUE;
  const upper = max ?? Number.MAX_VALUE;
  const clamp = (next: number) => Math.min(upper, Math.max(lower, next));
  function stepped(direction: -1 | 1) {
    if (!Number.isFinite(current)) return clamp(0);
    if (current < lower || current > upper) return clamp(current);
    // Keep an increment representable even for very large kinetic constants.
    const increment = Math.max(step, Math.abs(current) * 1e-14);
    const next = integer
      ? direction > 0
        ? Math.floor(current) + 1
        : Math.ceil(current) - 1
      : Number((current + direction * increment).toPrecision(15));
    return clamp(next);
  }
  function change(next: number, text: string) {
    setDraft({ value: typeof value === "string" ? text : next, text });
    onValueChange(next, text);
  }
  const increase = stepped(1);
  const decrease = stepped(-1);
  const locked = disabled || readOnly;
  const cannotIncrease = locked || current >= upper || increase === current;
  const cannotDecrease = locked || current <= lower || decrease === current;
  const label = props["aria-label"] ?? props.name ?? props.id ?? "value";
  const invalid =
    !Number.isFinite(current) ||
    current < lower ||
    current > upper ||
    (integer && !Number.isInteger(current));
  const validityMessage = !Number.isFinite(current)
    ? "Enter a finite number."
    : current < lower
      ? `Enter a value of at least ${lower}.`
      : current > upper
        ? `Enter a value of at most ${upper}.`
        : integer && !Number.isInteger(current)
          ? "Enter a whole number."
          : "";

  return (
    <span className="number-input">
      <input
        {...props}
        id={inputId}
        ref={(input) => {
          inputRef.current = input;
          if (scientific) input?.setCustomValidity(validityMessage);
        }}
        className={`${className} number-input-field`}
        type={scientific ? "text" : "number"}
        role={scientific ? "spinbutton" : undefined}
        inputMode={scientific ? "decimal" : props.inputMode}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number.isFinite(current) ? current : undefined}
        aria-invalid={props["aria-invalid"] ?? invalid}
        min={min}
        max={max}
        step={integer ? 1 : "any"}
        disabled={disabled}
        readOnly={readOnly}
        value={draft.text}
        onChange={(event) =>
          change(parseNumber(event.target.value), event.target.value)
        }
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented || locked) return;
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const up = event.key === "ArrowUp";
            if (up ? cannotIncrease : cannotDecrease) return;
            const next = up ? increase : decrease;
            change(next, String(next));
          }
        }}
      />
      <span className="number-input-arrows">
        {([1, -1] as const).map((direction) => (
          <button
            key={direction}
            type="button"
            tabIndex={-1}
            aria-label={direction === 1 ? "Increase" : "Decrease"}
            aria-controls={inputId}
            title={`${direction === 1 ? "Increase" : "Decrease"} ${label}`}
            disabled={direction === 1 ? cannotIncrease : cannotDecrease}
            onPointerDown={(event) => {
              event.preventDefault();
              inputRef.current?.focus();
            }}
            onClick={() => {
              const next = direction === 1 ? increase : decrease;
              change(next, String(next));
            }}
          >
            {direction === 1 ? (
              <ChevronUp size={12} />
            ) : (
              <ChevronDown size={12} />
            )}
          </button>
        ))}
      </span>
    </span>
  );
}

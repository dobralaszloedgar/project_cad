"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LoaderCircle, Thermometer } from "lucide-react";
import {
  modelInfo,
  models,
  type ModelId,
  type ThermoSettings,
} from "@/domain/thermo/registry";
import { catalogChoices, resolveCatalogSettings } from "@/lib/chemical-catalog";
import Dialog from "./Dialog";
import "./thermo-settings.css";

export default function ThermodynamicSelector({
  settings,
  open,
  onOpenChange,
  onApply,
  onError,
}: {
  settings: ThermoSettings;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (settings: ThermoSettings) => void;
  onError: (message: string) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    onOpenChange(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  return (
    <>
      <button
        ref={trigger}
        className="model-button"
        aria-label="Project thermodynamics"
        title="Thermodynamic model"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => onOpenChange(true)}
      >
        <Thermometer size={16} />
        <span>{modelInfo(settings.modelId).label}</span>
        <ChevronDown className="model-chevron" size={13} />
      </button>
      {open && (
        <Dialog
          title="Thermodynamics"
          className="thermo-dialog"
          onClose={close}
        >
          <ThermodynamicModelForm
            settings={settings}
            onCancel={close}
            onApply={(next) => {
              onApply(next);
              onOpenChange(false);
            }}
            onError={onError}
          />
        </Dialog>
      )}
    </>
  );
}

function ThermodynamicModelForm({
  settings,
  onCancel,
  onApply,
  onError,
}: {
  settings: ThermoSettings;
  onCancel: () => void;
  onApply: (settings: ThermoSettings) => void;
  onError: (message: string) => void;
}) {
  const [selected, setSelected] = useState<ModelId>(settings.modelId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const options = useRef<HTMLFieldSetElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      options.current
        ?.querySelector<HTMLInputElement>("input:checked")
        ?.focus(),
    );
    return () => {
      cancelAnimationFrame(frame);
      request.current?.abort();
    };
  }, []);
  return (
    <form
      className="thermo-model-form"
      aria-busy={saving}
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving) return;
        if (selected === settings.modelId) {
          onCancel();
          return;
        }
        const controller = new AbortController();
        request.current = controller;
        setSaving(true);
        setError("");
        try {
          const next = { ...settings, modelId: selected };
          const choices = catalogChoices(settings);
          const resolved = choices.every(Boolean)
            ? await resolveCatalogSettings(
                next,
                choices,
                undefined,
                controller.signal,
              )
            : { ...next, mixture: "catalog" as const, catalog: undefined };
          if (controller.signal.aborted) return;
          onApply(resolved);
          if (!choices.every(Boolean))
            onError("Choose project components for this model.");
        } catch (reason) {
          if (!controller.signal.aborted)
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not change the model.",
            );
        } finally {
          if (!controller.signal.aborted) setSaving(false);
        }
      }}
    >
      <p className="dialog-intro">
        Choose the model used for this project’s calculations.
      </p>
      <fieldset
        ref={options}
        className="thermo-model-options"
        aria-label="Thermodynamic model"
        disabled={saving}
      >
        {models.map((model) => (
          <label className="thermo-model-option" key={model.id}>
            <input
              type="radio"
              name="thermodynamic-model"
              value={model.id}
              checked={selected === model.id}
              aria-labelledby={`thermo-${model.id}-name`}
              aria-describedby={`thermo-${model.id}-description`}
              onChange={() => {
                setSelected(model.id);
                setError("");
              }}
            />
            <span>
              <strong id={`thermo-${model.id}-name`}>{model.name}</strong>
              <span
                id={`thermo-${model.id}-description`}
                className="thermo-model-description"
              >
                {model.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p className="thermo-model-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving && <LoaderCircle size={15} className="thermo-spinner" />}
          {saving ? "Applying…" : "Apply model"}
        </button>
      </div>
    </form>
  );
}

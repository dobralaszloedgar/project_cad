"use client";
import { useEffect, useRef, useState } from "react";
import { Info, LoaderCircle, Thermometer } from "lucide-react";
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
        title="Thermodynamics"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => onOpenChange(true)}
      >
        <Thermometer size={16} />
        <span>{modelInfo(settings.modelId).label}</span>
      </button>
      {open && (
        <Dialog
          title="Thermodynamics"
          className="thermo-dialog"
          onClose={close}
        >
          <ThermodynamicModelForm
            settings={settings}
            onApply={onApply}
            onError={onError}
          />
        </Dialog>
      )}
    </>
  );
}

function ThermodynamicModelForm({
  settings,
  onApply,
  onError,
}: {
  settings: ThermoSettings;
  onApply: (settings: ThermoSettings) => void;
  onError: (message: string) => void;
}) {
  const [availability, setAvailability] = useState<
    Partial<Record<ModelId, { settings?: ThermoSettings; error?: string }>>
  >(() => ({ [settings.modelId]: { settings } }));
  const options = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    const frame = requestAnimationFrame(() =>
      options.current
        ?.querySelector<HTMLInputElement>("input:checked")
        ?.focus(),
    );
    const choices = catalogChoices(settings);
    for (const model of models) {
      if (model.id === settings.modelId) continue;
      const next = { ...settings, modelId: model.id };
      // Resolve before selection so applying a model is synchronous, including
      // when the user immediately dismisses the dialog afterward.
      const resolved = choices.every(Boolean)
        ? resolveCatalogSettings(next, choices, undefined, controller.signal)
        : Promise.resolve({
            ...next,
            mixture: "catalog" as const,
            catalog: undefined,
          });
      void resolved.then(
        (nextSettings) => {
          if (!controller.signal.aborted)
            setAvailability((current) => ({
              ...current,
              [model.id]: { settings: nextSettings },
            }));
        },
        (reason) => {
          if (!controller.signal.aborted)
            setAvailability((current) => ({
              ...current,
              [model.id]: {
                error:
                  reason instanceof Error
                    ? reason.message
                    : "Could not load data for this model.",
              },
            }));
        },
      );
    }
    return () => {
      cancelAnimationFrame(frame);
      controller.abort();
    };
  }, [settings]);
  return (
    <div className="thermo-model-form">
      <fieldset
        ref={options}
        className="thermo-model-options"
        aria-label="Thermodynamic model"
      >
        {models.map((model) => {
          const available = availability[model.id];
          const detailId = `thermo-${model.id}-availability`;
          return (
            <label
              className="thermo-model-option"
              key={model.id}
              title={available?.error}
              tabIndex={available?.error ? 0 : undefined}
              aria-label={available?.error ? model.name : undefined}
              aria-describedby={available?.error ? detailId : undefined}
            >
              <input
                type="radio"
                name="thermodynamic-model"
                value={model.id}
                checked={settings.modelId === model.id}
                disabled={!available?.settings}
                aria-labelledby={`thermo-${model.id}-name`}
                aria-describedby={`thermo-${model.id}-description${available?.error ? ` ${detailId}` : ""}`}
                onChange={() => {
                  if (!available?.settings) return;
                  onApply(available.settings);
                  if (!catalogChoices(available.settings).every(Boolean))
                    onError("Choose project components for this model.");
                }}
              />
              <span className="thermo-model-content">
                <span className="thermo-model-heading">
                  <strong id={`thermo-${model.id}-name`}>{model.name}</strong>
                  {!available && (
                    <span className="thermo-model-status" role="status">
                      <LoaderCircle
                        size={13}
                        className="thermo-spinner"
                        aria-hidden="true"
                      />
                      Checking data…
                    </span>
                  )}
                  {available?.error && (
                    <span className="thermo-model-status">
                      <Info size={13} aria-hidden="true" />
                      Data unavailable
                    </span>
                  )}
                </span>
                <span
                  id={`thermo-${model.id}-description`}
                  className="thermo-model-description"
                >
                  {model.description}
                </span>
                {available?.error && (
                  <span id={detailId} className="sr-only">
                    {available.error}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}

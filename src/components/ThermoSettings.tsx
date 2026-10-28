"use client";
import { useState } from "react";
import type { Project } from "@/domain/schema";
import {
  defaultThermo,
  models,
  type ThermoSettings,
} from "@/domain/thermo/registry";
import { sampleMixtures } from "@/domain/thermo/catalog";
export default function ThermoSettingsPanel({
  project,
  onApply,
}: {
  project: Project;
  onApply: (settings: ThermoSettings) => void;
}) {
  const [draft, setDraft] = useState(project.thermo ?? defaultThermo);
  const model = models.find((m) => m.id === draft.modelId)!;
  return (
    <form
      className="thermo-settings"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(draft);
      }}
    >
      <h3>Thermodynamic model</h3>
      <label>
        Property model
        <select
          className="select"
          value={draft.modelId}
          onChange={(e) =>
            setDraft({
              ...draft,
              modelId: e.target.value as ThermoSettings["modelId"],
            })
          }
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <p>{model.description}</p>
      <label>
        Sample mixture (A / B)
        <select
          className="select"
          value={draft.mixture}
          onChange={(e) =>
            setDraft({
              ...draft,
              mixture: e.target.value as ThermoSettings["mixture"],
            })
          }
        >
          {Object.entries(sampleMixtures).map(([id, mixture]) => (
            <option key={id} value={id}>
              {mixture.name}
            </option>
          ))}
        </select>
      </label>
      <p>{model.limitations}</p>
      {draft.modelId !== "ideal-gas" && (
        <label className="thermo-extrapolate">
          <input
            type="checkbox"
            checked={draft.extrapolate}
            onChange={(e) =>
              setDraft({ ...draft, extrapolate: e.target.checked })
            }
          />
          Warn and extrapolate vapor pressures outside source ranges
        </label>
      )}
      {draft.modelId !== "ideal-gas" && draft.mixture === "demo" && (
        <p role="status">
          Select a real sample mixture. Synthetic A/B has no vapor-pressure or
          group data.
        </p>
      )}
      {project.units.some((u) => u.kind === "PBR") &&
        (draft.mixture !== "demo" || draft.modelId !== "ideal-gas") && (
          <p>
            The sample reactor supports synthetic A/B with ideal gas only. Load
            the Raoult’s law separation template to try a liquid model.
          </p>
        )}
      <button
        className="btn btn-primary"
        disabled={draft.modelId !== "ideal-gas" && draft.mixture === "demo"}
      >
        Apply physical model
      </button>
      <p className="muted">
        Six sample chemicals. Changes are saved with this project and its
        revision history.
      </p>
    </form>
  );
}

"use client";
import { useState } from "react";
import type { Project } from "@/domain/schema";
import {
  defaultThermo,
  models,
  type ThermoSettings,
} from "@/domain/thermo/registry";
import { sampleMixtures } from "@/domain/thermo/catalog";
import { catalogSnapshotSchema, validateSnapshot } from "@/domain/thermo/data";
import { propertyRange } from "@/domain/thermo/availability";
import ChemicalPicker, { type ChemicalChoice } from "./ChemicalPicker";
export default function ThermoSettingsPanel({
  project,
  onApply,
}: {
  project: Project;
  onApply: (settings: ThermoSettings) => void;
}) {
  const [draft, setDraft] = useState(project.thermo ?? defaultThermo);
  const [choices, setChoices] = useState<
    [ChemicalChoice | undefined, ChemicalChoice | undefined]
  >([draft.catalog?.chemicals[0], draft.catalog?.chemicals[1]]);
  const [release, setRelease] = useState(draft.catalog?.release);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const catalogMode = draft.mixture === "catalog";
  const ranges = draft.catalog?.chemicals.map((c) =>
    propertyRange(c, draft.modelId),
  );
  const model = models.find((m) => m.id === draft.modelId)!;
  return (
    <form
      className="thermo-settings"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        if (!catalogMode) {
          onApply({ ...draft, catalog: undefined });
          return;
        }
        if (!choices[0] || !choices[1] || !release) {
          setError("Choose both chemicals first.");
          return;
        }
        setLoading(true);
        try {
          let snapshot = draft.catalog;
          if (
            !snapshot ||
            (draft.modelId === "modified-unifac-2.0" && !snapshot.parameters)
          ) {
            const response = await fetch("/api/chemicals/selection", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                release,
                ids: choices.map((c) => c!.id),
                model: draft.modelId,
              }),
            });
            const data = await response.json();
            if (!response.ok)
              throw new Error(data.error ?? "Could not load chemical data.");
            snapshot = catalogSnapshotSchema.parse(data);
          }
          validateSnapshot(snapshot);
          if (snapshot.chemicals.some((c) => !propertyRange(c, draft.modelId)))
            throw new Error(
              "The selected chemicals do not support this model. Choose chemicals from its search results.",
            );
          const applied = { ...draft, catalog: snapshot };
          onApply(applied);
          setDraft(applied);
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Could not load chemical data.",
          );
        } finally {
          setLoading(false);
        }
      }}
    >
      <h3>Thermodynamic model</h3>
      <label>
        Property model
        <select
          className="select"
          disabled={loading}
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
        Chemical source
        <select
          className="select"
          disabled={loading}
          value={catalogMode ? "catalog" : "sample"}
          onChange={(e) => {
            setError("");
            setDraft({
              ...draft,
              mixture: e.target.value === "catalog" ? "catalog" : "aromatics",
            });
          }}
        >
          <option value="sample">Bundled sample mixtures</option>
          <option value="catalog">Chemical database</option>
        </select>
      </label>
      {catalogMode ? (
        <>
          {([0, 1] as const).map((i) => (
            <ChemicalPicker
              key={i}
              label={`Component ${i === 0 ? "A" : "B"}`}
              model={draft.modelId}
              release={release}
              value={choices[i]}
              disabled={loading}
              onRelease={setRelease}
              onSelect={(choice) => {
                setChoices((previous) =>
                  i === 0 ? [choice, previous[1]] : [previous[0], choice],
                );
                setDraft((previous) => ({ ...previous, catalog: undefined }));
                setError("");
              }}
            />
          ))}
          {ranges?.every((r) => r !== null) && (
            <p className="muted">
              Shared data range:{" "}
              {Math.max(...ranges.map((r) => r![0])).toFixed(1)}–
              {Math.min(...ranges.map((r) => r![1])).toFixed(1)} K.
            </p>
          )}
        </>
      ) : (
        <label>
          Sample mixture (A / B)
          <select
            className="select"
            disabled={loading}
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
      )}
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
        disabled={
          loading ||
          (draft.modelId !== "ideal-gas" && draft.mixture === "demo") ||
          (catalogMode &&
            (!choices[0] || !choices[1] || choices[0].id === choices[1].id))
        }
      >
        {loading ? "Loading chemical data…" : "Apply physical model"}
      </button>
      {error && <p role="alert">{error}</p>}
      <p className="muted">
        {catalogMode
          ? "Selected chemical records and model parameters are saved with this project for offline calculations."
          : "Six bundled sample chemicals. Changes are saved with this project and its revision history."}
      </p>
    </form>
  );
}

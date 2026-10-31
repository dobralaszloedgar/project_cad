"use client";

import { useState } from "react";
import { Copy, Plus, Trash2, ArrowRight } from "lucide-react";
import type { Chemical } from "@/domain/thermo/data";
import {
  reactionSchema,
  type PackedBedConfig,
  type Reaction,
} from "@/domain/reactions/schema";
import { defaultRateLaw } from "@/domain/reactions/rateLaw";
import {
  packedBedIssues,
  reactionEquation,
  reactionIssues,
  rateConstantUnit,
} from "@/domain/reactions/validation";
import { RateLawEditor } from "./RateLawEditor";
import "./reactions.css";

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  unit,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  unit?: string;
}) {
  return (
    <label className="equipment-field">
      <span>{label}</span>
      <span className="equipment-quantity">
        <input
          className="input"
          aria-label={label}
          type="number"
          step="any"
          required
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(e.target.valueAsNumber)}
        />
        {unit && <span className="equipment-unit">{unit}</span>}
      </span>
    </label>
  );
}

function SpeciesTable({
  reaction,
  chemicals,
  side,
  onChange,
}: {
  reaction: Reaction;
  chemicals: Chemical[];
  side: "reactants" | "products";
  onChange: (reaction: Reaction) => void;
}) {
  const sign = side === "reactants" ? -1 : 1;
  const rows = reaction.stoichiometry
    .map((row, index) => ({ ...row, index }))
    .filter((row) => row.coefficient * sign > 0);
  const available = chemicals.filter(
    (c) => !reaction.stoichiometry.some((s) => s.componentId === c.id),
  );
  const patch = (
    index: number,
    update: Partial<Reaction["stoichiometry"][number]>,
  ) =>
    onChange({
      ...reaction,
      stoichiometry: reaction.stoichiometry.map((row, i) =>
        i === index ? { ...row, ...update } : row,
      ),
    });
  return (
    <section className="reaction-species" aria-label={side}>
      <h4>{side === "reactants" ? "Reactants" : "Products"}</h4>
      <div className="reaction-species-labels">
        <span>Component</span>
        <span>Coefficient</span>
        <span />
      </div>
      {rows.map((row, i) => (
        <div className="reaction-species-row" key={row.index}>
          <select
            className="select"
            aria-label={`${side} component ${i + 1}`}
            value={row.componentId}
            onChange={(e) => {
              const next = e.target.value;
              onChange({
                ...reaction,
                basisComponentId:
                  reaction.basisComponentId === row.componentId
                    ? next
                    : reaction.basisComponentId,
                stoichiometry: reaction.stoichiometry.map((s, j) =>
                  j === row.index ? { ...s, componentId: next } : s,
                ),
              });
            }}
          >
            {!chemicals.some((c) => c.id === row.componentId) && (
              <option value={row.componentId}>
                Missing: {row.componentId}
              </option>
            )}
            {chemicals.map((c) => (
              <option
                key={c.id}
                value={c.id}
                disabled={
                  c.id !== row.componentId &&
                  reaction.stoichiometry.some((s) => s.componentId === c.id)
                }
              >
                {c.name}
                {c.formula ? ` · ${c.formula}` : ""}
              </option>
            ))}
          </select>
          <input
            className="input"
            aria-label={`${side} coefficient ${i + 1}`}
            type="number"
            required
            min="0.000001"
            max="1000"
            step="any"
            value={Math.abs(row.coefficient)}
            onChange={(e) =>
              Number.isFinite(e.target.valueAsNumber) &&
              e.target.valueAsNumber > 0 &&
              patch(row.index, { coefficient: sign * e.target.valueAsNumber })
            }
          />
          <button
            className="btn btn-xs"
            type="button"
            aria-label={`Remove ${side} component ${i + 1}`}
            onClick={() =>
              onChange({
                ...reaction,
                stoichiometry: reaction.stoichiometry.filter(
                  (_, j) => j !== row.index,
                ),
              })
            }
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      {!rows.length && (
        <p className="equipment-help">
          Add a {side === "reactants" ? "reactant" : "product"} from the project
          components.
        </p>
      )}
      <button
        className="btn btn-sm"
        type="button"
        disabled={!available.length}
        onClick={() =>
          onChange({
            ...reaction,
            basisComponentId:
              side === "reactants" && !rows.length
                ? available[0].id
                : reaction.basisComponentId,
            stoichiometry: [
              ...reaction.stoichiometry,
              { componentId: available[0].id, coefficient: sign },
            ],
          })
        }
      >
        <Plus size={13} />
        Add {side === "reactants" ? "reactant" : "product"}
      </button>
    </section>
  );
}

export function PackedBedSetup({
  value,
  chemicals,
  onChange,
}: {
  value: PackedBedConfig;
  chemicals: Chemical[];
  onChange: (value: PackedBedConfig) => void;
}) {
  const [selectedId, setSelectedId] = useState(value.reactions[0]?.id);
  const selected =
    value.reactions.find((r) => r.id === selectedId) ?? value.reactions[0];
  const [rateDrafts, setRateDrafts] = useState<
    Record<string, NonNullable<Reaction["rateLaw"]>>
  >({});
  const patch = (change: Partial<PackedBedConfig>) =>
    onChange({ ...value, ...change });
  const updateReaction = (reaction: Reaction) =>
    patch({
      reactions: value.reactions.map((r) =>
        r.id === reaction.id ? reaction : r,
      ),
    });
  const edit = (change: Partial<Reaction>) =>
    updateReaction({ ...selected, ...change });
  const issues = packedBedIssues(value, chemicals);
  const add = (reaction: Reaction) => {
    patch({ reactions: [...value.reactions, reaction] });
    setSelectedId(reaction.id);
  };
  return (
    <>
      <section className="equipment-section">
        <h3>Bed specification</h3>
        <div className="equipment-field-grid">
          <label>
            Calculate
            <select
              className="select"
              aria-label="Packed-bed calculation"
              value={value.sizingMode}
              onChange={(e) =>
                patch({
                  sizingMode: e.target.value as PackedBedConfig["sizingMode"],
                })
              }
            >
              <option value="catalyst-mass">
                Conversion from catalyst mass
              </option>
              <option value="target-conversion">
                Catalyst mass for target conversion
              </option>
            </select>
          </label>
          <label>
            Conversion basis
            <select
              className="select"
              aria-label="Conversion reporting component"
              value={value.conversionComponentId}
              onChange={(e) => patch({ conversionComponentId: e.target.value })}
            >
              {chemicals.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {value.sizingMode === "catalyst-mass" ? (
            <NumberField
              label="Catalyst mass (kg)"
              unit="kg"
              value={value.catalystMass}
              max={1e9}
              onChange={(catalystMass) => patch({ catalystMass })}
            />
          ) : (
            <NumberField
              label="Target conversion (%)"
              unit="%"
              value={value.targetConversion * 100}
              min={0.000001}
              max={99.9999}
              onChange={(n) => patch({ targetConversion: n / 100 })}
            />
          )}
          <NumberField
            label="Pressure drop (Pa)"
            unit="Pa"
            value={value.pressureDrop}
            max={2e6}
            onChange={(pressureDrop) => patch({ pressureDrop })}
          />
          <label>
            Concentration model
            <select
              className="select"
              aria-label="Reactor flow model"
              value={value.flowModel}
              onChange={(e) =>
                patch({
                  flowModel: e.target.value as PackedBedConfig["flowModel"],
                })
              }
            >
              <option value="ideal-gas">Ideal-gas flow · FRT/P</option>
              <option value="constant-flow">
                Specified constant volume flow
              </option>
            </select>
          </label>
          {value.flowModel === "constant-flow" && (
            <NumberField
              label="Volumetric flow (m³/s)"
              unit="m³/s"
              value={value.volumetricFlow}
              min={1e-12}
              max={1e6}
              onChange={(volumetricFlow) => patch({ volumetricFlow })}
            />
          )}
        </div>
        <p className="equipment-help">
          Isothermal gas reaction. Pressure drops linearly across the bed.{" "}
          {value.flowModel === "ideal-gas"
            ? "Volume flow follows local composition, temperature and pressure."
            : "Concentrations use the specified volume flow; gas expansion is neglected."}
        </p>
      </section>
      <section className="equipment-section reaction-set">
        <div className="reaction-set-heading">
          <h3>Reaction set</h3>
          <span>
            {value.reactions.filter((r) => r.enabled).length} /{" "}
            {value.reactions.length} enabled
          </span>
        </div>
        <p className="equipment-help">
          Main, competing and consecutive reactions share the same mixture and
          are solved together.
        </p>
        <div className="reaction-cards" aria-label="Reactions in this reactor">
          {value.reactions.map((reaction, index) => (
            <div
              key={reaction.id}
              className={`reaction-card${selected?.id === reaction.id ? " is-selected" : ""}${reaction.enabled ? "" : " is-disabled"}`}
            >
              <button
                type="button"
                className="reaction-card-select"
                aria-label={`Edit reaction ${index + 1}: ${reaction.name}`}
                aria-pressed={selected?.id === reaction.id}
                onClick={() => setSelectedId(reaction.id)}
              >
                <strong>{reaction.name}</strong>
                <span>{reactionEquation(reaction, chemicals)}</span>
                <small>
                  {!reaction.enabled
                    ? "Disabled"
                    : reactionIssues(reaction, chemicals).length
                      ? "Needs attention"
                      : "Ready"}{" "}
                  ·{" "}
                  {reaction.rateLaw
                    ? "General rate law"
                    : `Order ${reaction.order}`}
                </small>
              </button>
              <label className="reaction-enable">
                <input
                  type="checkbox"
                  aria-label={`Enable reaction ${index + 1}`}
                  checked={reaction.enabled}
                  onChange={(e) =>
                    updateReaction({ ...reaction, enabled: e.target.checked })
                  }
                />
                Enabled
              </label>
            </div>
          ))}
        </div>
        <div className="reaction-actions">
          <button
            className="btn btn-sm"
            type="button"
            disabled={value.reactions.length >= 20 || !chemicals.length}
            onClick={() =>
              add(
                reactionSchema.parse({
                  id: crypto.randomUUID(),
                  name: `Reaction ${value.reactions.length + 1}`,
                  basisComponentId: chemicals[0].id,
                  stoichiometry: [],
                }),
              )
            }
          >
            <Plus size={14} />
            Add reaction
          </button>
          <button
            className="btn btn-sm"
            type="button"
            disabled={!selected || value.reactions.length >= 20}
            onClick={() =>
              add({
                ...structuredClone(selected),
                id: crypto.randomUUID(),
                name: `${selected.name.slice(0, 93)} (copy)`,
              })
            }
          >
            <Copy size={14} />
            Duplicate reaction
          </button>
          <button
            className="btn btn-sm"
            type="button"
            aria-label="Remove selected reaction"
            disabled={!selected}
            onClick={() =>
              patch({
                reactions: value.reactions.filter((r) => r.id !== selected.id),
              })
            }
          >
            <Trash2 size={14} />
          </button>
        </div>
        {selected && (
          <div className="reaction-definition" key={selected.id}>
            <label>
              Reaction name
              <input
                className="input"
                aria-label="Reaction name"
                required
                maxLength={100}
                value={selected.name}
                onChange={(e) => edit({ name: e.target.value })}
              />
            </label>
            <div className="reaction-equation" aria-label="Reaction equation">
              <ArrowRight size={16} />
              <span>{reactionEquation(selected, chemicals)}</span>
            </div>
            <div className="reaction-sides">
              <SpeciesTable
                reaction={selected}
                chemicals={chemicals}
                side="reactants"
                onChange={updateReaction}
              />
              <SpeciesTable
                reaction={selected}
                chemicals={chemicals}
                side="products"
                onChange={updateReaction}
              />
            </div>
            <p className="equipment-help">
              Enter positive coefficients on each side. Components absent from
              the reaction remain inert. Add chemicals in Project components.
            </p>
            <div className="equipment-field-grid">
              <label>
                Rate basis species
                <select
                  className="select"
                  aria-label="Rate basis species"
                  value={selected.basisComponentId}
                  onChange={(e) => edit({ basisComponentId: e.target.value })}
                >
                  <option value="" disabled>
                    Select a reactant
                  </option>
                  {selected.stoichiometry
                    .filter((s) => s.coefficient < 0)
                    .map((s) => (
                      <option key={s.componentId} value={s.componentId}>
                        {chemicals.find((c) => c.id === s.componentId)?.name ??
                          s.componentId}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Rate law
                <select
                  className="select"
                  aria-label="Rate law model"
                  value={selected.rateLaw ? "general" : "power-law"}
                  onChange={(e) => {
                    if (selected.rateLaw)
                      setRateDrafts({
                        ...rateDrafts,
                        [selected.id]: selected.rateLaw,
                      });
                    const law = defaultRateLaw(
                      selected.basisComponentId,
                      true,
                      selected.rateConstant,
                      selected.order,
                    );
                    law.parameters[0] = {
                      ...law.parameters[0],
                      activationEnergy: selected.activationEnergy,
                      referenceTemperature: selected.referenceTemperature,
                    };
                    edit({
                      rateLaw:
                        e.target.value === "general"
                          ? (rateDrafts[selected.id] ?? law)
                          : undefined,
                    });
                  }}
                >
                  <option value="power-law">
                    Simple power law · one species
                  </option>
                  <option value="general">
                    General law · table or expression
                  </option>
                </select>
              </label>
            </div>
            {selected.rateLaw ? (
              <RateLawEditor
                law={selected.rateLaw}
                components={chemicals}
                packed
                basisName={
                  chemicals.find((c) => c.id === selected.basisComponentId)
                    ?.name ?? selected.basisComponentId
                }
                reactionName={selected.name}
                onChange={(rateLaw) => edit({ rateLaw })}
              />
            ) : (
              <>
                <p className="reaction-rate-preview">
                  −r = k(T) C<sup>{selected.order}</sup> · net disappearance of
                  the rate basis, mol/(kg·s)
                </p>
                <div className="equipment-field-grid">
                  <NumberField
                    label="Reaction order"
                    value={selected.order}
                    max={20}
                    onChange={(order) => edit({ order })}
                  />
                  <NumberField
                    label="Rate constant"
                    unit={rateConstantUnit(selected.order)}
                    value={selected.rateConstant}
                    max={1e20}
                    onChange={(rateConstant) => edit({ rateConstant })}
                  />
                  <NumberField
                    label="Activation energy (J/mol)"
                    unit="J/mol"
                    value={selected.activationEnergy}
                    min={-1e6}
                    max={1e6}
                    onChange={(activationEnergy) => edit({ activationEnergy })}
                  />
                  <NumberField
                    label="Reference temperature (K)"
                    unit="K"
                    value={selected.referenceTemperature}
                    min={250}
                    max={800}
                    onChange={(referenceTemperature) =>
                      edit({ referenceTemperature })
                    }
                  />
                </div>
                <p className="equipment-help">
                  Changing reaction order changes the units of k. Use a general
                  law for multiple species, reverse rates or inhibition. Zero
                  activation energy makes k independent of temperature.
                </p>
              </>
            )}
          </div>
        )}
        {!!issues.length && (
          <div className="reaction-issues" role="alert">
            <strong>Complete the reaction setup</strong>
            <ul>
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}

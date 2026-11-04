// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import type { Unit } from "@/domain/schema";
import type { ComponentSplitConfig } from "@/domain/equipment/component-split-schema";
import { selectedChemicals } from "@/domain/thermo/catalog";
import { models, type ThermoSettings } from "@/domain/thermo/registry";
import EngineeringInput from "./EngineeringInput";
import NumberInput from "./NumberInput";

export function ComponentSplitSetup({
  params,
  settings,
  onChange,
}: {
  params: Unit["params"];
  settings: ThermoSettings;
  onChange: (params: Unit["params"]) => void;
}) {
  const chemicals = selectedChemicals(settings);
  const split = params.componentSplit;
  const change = (patch: Partial<ComponentSplitConfig>) =>
    onChange({ ...params, componentSplit: { ...split!, ...patch } });
  return (
    <section className="equipment-section">
      <h3>Split specification</h3>
      <label className="equipment-field">
        Split basis
        <select
          className="select"
          aria-label="Split basis"
          value={split ? "component" : "flow"}
          onChange={(event) =>
            onChange({
              ...params,
              ...(event.target.value === "component"
                ? { branchCount: 2, splitFractions: undefined }
                : {}),
              componentSplit:
                event.target.value === "flow"
                  ? undefined
                  : {
                      recoveries: Object.fromEntries(
                        chemicals.map(({ id }) => [id, 0.5]),
                      ),
                      outlets: [0, 1].map(() => ({
                        temperature: params.temperature,
                        pressure: params.pressure,
                        modelId: settings.modelId,
                      })) as ComponentSplitConfig["outlets"],
                    },
            })
          }
        >
          <option value="flow">Same composition at every outlet</option>
          <option value="component">Specified component recovery</option>
        </select>
      </label>
      {split && (
        <>
          <p className="equipment-help">
            Recoveries are specified, not calculated from equilibrium. The
            balance goes to outlet 2. Duty includes the specified cooling and
            phase change.
          </p>
          <div className="equipment-field-grid">
            {chemicals.map(({ id, name }) => (
              <label
                className="equipment-field"
                key={id}
                data-setup-field={`componentSplit.recoveries.${id}`}
              >
                {name} to outlet 1
                <NumberInput
                  aria-label={`${name} recovery to outlet 1`}
                  value={split.recoveries[id] ?? NaN}
                  min={0}
                  max={1}
                  step={0.01}
                  required
                  onValueChange={(value) =>
                    change({ recoveries: { ...split.recoveries, [id]: value } })
                  }
                />
              </label>
            ))}
          </div>
          {split.outlets.map((outlet, index) => (
            <fieldset className="equipment-section" key={index}>
              <legend>Outlet {index + 1} conditions</legend>
              <div className="equipment-field-grid">
                <label className="equipment-field">
                  Temperature
                  <EngineeringInput
                    dimension="temperature"
                    selectUnit
                    aria-label={`Outlet ${index + 1} temperature`}
                    value={outlet.temperature}
                    min={250}
                    max={800}
                    required
                    onValueChange={(temperature) =>
                      change({
                        outlets: split.outlets.map((current, i) =>
                          i === index ? { ...current, temperature } : current,
                        ) as ComponentSplitConfig["outlets"],
                      })
                    }
                  />
                </label>
                <label className="equipment-field">
                  Pressure
                  <EngineeringInput
                    dimension="pressure"
                    selectUnit
                    aria-label={`Outlet ${index + 1} pressure`}
                    value={outlet.pressure}
                    min={10000}
                    max={2000000}
                    required
                    onValueChange={(pressure) =>
                      change({
                        outlets: split.outlets.map((current, i) =>
                          i === index ? { ...current, pressure } : current,
                        ) as ComponentSplitConfig["outlets"],
                      })
                    }
                  />
                </label>
                <label className="equipment-field">
                  Property model
                  <select
                    className="select"
                    aria-label={`Outlet ${index + 1} property model`}
                    value={outlet.modelId}
                    onChange={(event) =>
                      change({
                        outlets: split.outlets.map((current, i) =>
                          i === index
                            ? {
                                ...current,
                                modelId: event.target
                                  .value as ThermoSettings["modelId"],
                              }
                            : current,
                        ) as ComponentSplitConfig["outlets"],
                      })
                    }
                  >
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>
          ))}
        </>
      )}
    </section>
  );
}

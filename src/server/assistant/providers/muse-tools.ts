// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { z } from "zod";
import { tools, type ToolName } from "../../../assistant/protocol";
import type { projectCapabilities } from "../../../assistant/capabilities";
import {
  catalogSnapshotSchema,
  contentHash,
  validateSnapshot,
  type CatalogSnapshot,
} from "../../../domain/thermo/data";
import { propertyRange } from "../../../domain/thermo/availability";
import type { ModelId } from "../../../domain/thermo/registry";
import type { ProviderInput } from "./types";
import { museGuide } from "./muse-guide";

export const museCapabilitiesRequest = z
  .object({
    actionTypes: z.array(z.string().min(1).max(80)).min(1).max(20).optional(),
  })
  .strict();

type JsonSchema = {
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  oneOf?: JsonSchema[];
  const?: string;
  [key: string]: unknown;
};

export function museCapabilities(
  value: ReturnType<typeof projectCapabilities>,
  actionTypes?: string[],
) {
  const actionSchema = structuredClone(value.actionSchema) as JsonSchema;
  const items = actionSchema.properties?.actions?.items;
  if (!items?.oneOf)
    throw new Error(
      "The website did not return an action schema. Update the app and retry.",
    );
  const actionNames = items.oneOf.map(
    (action) => action.properties?.type.const,
  );
  for (const type of actionTypes ?? [])
    if (!actionNames.includes(type))
      throw new Error(
        `Unknown action type ${type}. Available actions: ${actionNames.join(", ")}.`,
      );
  items.oneOf = items.oneOf
    .filter(
      (action) =>
        !actionTypes || actionTypes.includes(action.properties!.type.const!),
    )
    .map((action) => {
      if (action.properties?.type.const !== "set_thermo_model") return action;
      // Muse supplies an opaque reference instead of regenerating hashed data.
      const properties = { ...action.properties };
      delete properties.catalog;
      properties.catalogRef = {
        type: "string",
        description:
          "Required for mixture catalog: copy catalogRef from get_chemical_selection in this turn. Do not copy chemical records.",
      };
      return { ...action, properties };
    });
  return {
    guide: value.guide,
    actionNames,
    actionSchema,
    ports: value.ports,
    models: value.models,
    sampleMixtures: value.sampleMixtures,
    units: value.units,
    results: value.results,
    mode: value.mode,
    wireFormat:
      "Encode the plan as a JSON string. Catalog actions use catalogRef. Engineering limits are in the current guide.",
  };
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Per-turn adapter. References never outlive the paired project tool bridge. */
export class MuseProjectTools {
  private selections = new Map<
    string,
    { snapshot: CatalogSnapshot; model: ModelId }
  >();

  constructor(private input: Pick<ProviderInput, "call">) {}

  async call(name: ToolName, raw: unknown): Promise<unknown> {
    if (name === "get_capabilities") {
      const { actionTypes } = museCapabilitiesRequest.parse(raw);
      const value = await this.input.call(name, {});
      return museCapabilities(
        value as ReturnType<typeof projectCapabilities>,
        actionTypes,
      );
    }
    if (name === "get_guide") {
      const value = await this.input.call(name, tools[name].schema.parse(raw));
      return { content: museGuide(value) };
    }
    if (name === "get_chemical_selection") {
      const args = tools[name].schema.parse(raw);
      const snapshot = catalogSnapshotSchema.parse(
        await this.input.call(name, args),
      );
      validateSnapshot(snapshot);
      if (
        snapshot.release !== args.release ||
        snapshot.chemicals.length !== args.ids.length ||
        snapshot.chemicals.some((chemical, i) => chemical.id !== args.ids[i])
      )
        throw new Error(
          "The catalog returned a different component selection. Request the selection again.",
        );
      const catalogRef = `catalog-${contentHash({ model: args.model, snapshot })}`;
      if (!this.selections.has(catalogRef) && this.selections.size >= 64)
        throw new Error(
          "Too many distinct catalog selections in this turn. Reuse a selection or start a new turn.",
        );
      this.selections.set(catalogRef, { snapshot, model: args.model });
      return {
        catalogRef,
        release: snapshot.release,
        model: args.model,
        components: snapshot.chemicals.map((c) => ({
          id: c.id,
          name: c.name,
          formula: c.formula,
          molecularWeightKgPerMol: c.molecularWeight,
          hasFormationEnthalpy: c.formationEnthalpy !== undefined,
          temperatureRangeK: propertyRange(c, args.model),
        })),
        instruction:
          "Use catalogRef in set_thermo_model with mixture catalog and this model. The exact verified records are retained by the adapter for this turn; do not reconstruct them.",
      };
    }
    const decoded = this.decode(raw);
    return this.input.call(name, tools[name].schema.parse(decoded));
  }

  private decode(raw: unknown): unknown {
    if (!object(raw)) return raw;
    const plan = typeof raw.plan === "string" ? JSON.parse(raw.plan) : raw.plan;
    if (!object(plan) || !Array.isArray(plan.actions))
      return { ...raw, ...(plan === undefined ? {} : { plan }) };
    return {
      ...raw,
      plan: {
        ...plan,
        actions: plan.actions.map((action: unknown) => {
          if (!object(action) || action.type !== "set_thermo_model")
            return action;
          if (action.catalogRef !== undefined) {
            if (action.catalog !== undefined)
              throw new Error(
                "Use catalogRef alone; do not also supply a catalog record.",
              );
            const selection =
              typeof action.catalogRef === "string" &&
              this.selections.get(action.catalogRef);
            if (!selection)
              throw new Error(
                "Unknown or expired catalogRef. Call get_chemical_selection in this turn and use its returned reference.",
              );
            if (
              action.mixture !== "catalog" ||
              action.modelId !== selection.model
            )
              throw new Error(
                "catalogRef requires mixture catalog and the same model used in get_chemical_selection.",
              );
            const expanded: Record<string, unknown> = {
              ...action,
              catalog: structuredClone(selection.snapshot),
            };
            delete expanded.catalogRef;
            return expanded;
          }
          // Older plans remain readable, but corrupt data must never reach apply.
          if (action.catalog !== undefined)
            validateSnapshot(catalogSnapshotSchema.parse(action.catalog));
          else if (action.mixture === "catalog")
            throw new Error(
              "Catalog mixtures require catalogRef from get_chemical_selection.",
            );
          return action;
        }),
      },
    };
  }
}

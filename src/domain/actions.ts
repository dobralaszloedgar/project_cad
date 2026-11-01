import { z } from "zod";
import { defaultThermo, thermoSchema } from "./thermo/registry";
import { availableStreamName } from "./stream-names";
import { distillationSchema } from "./equipment/distillation-schema";
import { distillationPatchSchema } from "./equipment/distillation-patch-schema";
import {
  unitSchema,
  edgeSchema,
  paramsSchema,
  projectSchema,
  validateGraph,
  type Project,
} from "./schema";
// Updates must not apply creation defaults to fields the model did not specify.
const updateParamsSchema = z
  .object({
    temperature: paramsSchema.shape.temperature.removeDefault().optional(),
    pressure: paramsSchema.shape.pressure.removeDefault().optional(),
    flow: paramsSchema.shape.flow.removeDefault().optional(),
    fractionA: paramsSchema.shape.fractionA.removeDefault().optional(),
    composition: paramsSchema.shape.composition,
    packedBed: paramsSchema.shape.packedBed.nullable(),
    distillation: distillationPatchSchema.nullable().optional(),
    residenceTime: paramsSchema.shape.residenceTime.removeDefault().optional(),
    reactorMode: paramsSchema.shape.reactorMode.removeDefault().optional(),
    catalystMass: paramsSchema.shape.catalystMass.removeDefault().optional(),
    catalystRateConstant: paramsSchema.shape.catalystRateConstant
      .removeDefault()
      .optional(),
    thermalMode: paramsSchema.shape.thermalMode.removeDefault().optional(),
    heatDuty: paramsSchema.shape.heatDuty.removeDefault().optional(),
    recycleFraction: paramsSchema.shape.recycleFraction
      .removeDefault()
      .optional(),
    relativeVolatility: paramsSchema.shape.relativeVolatility
      .removeDefault()
      .optional(),
    distillateFraction: paramsSchema.shape.distillateFraction
      .removeDefault()
      .optional(),
    trayCount: paramsSchema.shape.trayCount
      .removeDefault()
      .optional()
      .describe(
        "Column trays in both views; also the number of equilibrium trays in MESH mode (excludes condenser/reboiler). Layout only for FUG and single flash.",
      ),
  })
  .strict();
export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add"), unit: unitSchema }).strict(),
  z.object({ type: z.literal("connect"), edge: edgeSchema }).strict(),
  z
    .object({
      type: z.literal("update"),
      id: z.string().max(64),
      name: unitSchema.shape.name.optional(),
      position: unitSchema.shape.position.optional(),
      params: updateParamsSchema,
    })
    .strict(),
  z.object({ type: z.literal("remove"), id: z.string().max(64) }).strict(),
  z.object({ type: z.literal("disconnect"), id: edgeSchema.shape.id }).strict(),
  z
    .object({
      type: z.literal("update_stream"),
      id: edgeSchema.shape.id,
      changes: z
        .object({
          name: edgeSchema.shape.name,
          colorIndex: edgeSchema.shape.colorIndex,
          source: edgeSchema.shape.source.optional(),
          target: edgeSchema.shape.target.optional(),
          sourcePort: edgeSchema.shape.sourcePort.optional(),
          targetPort: edgeSchema.shape.targetPort.optional(),
          color: edgeSchema.shape.color.removeDefault().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("rename_project"),
      name: projectSchema.shape.name,
    })
    .strict(),
  z
    .object({ type: z.literal("set_thermo_model"), ...thermoSchema.shape })
    .strict(),
]);
export const planSchema = z
  .object({
    summary: z.string().min(1).max(2000),
    actions: z.array(actionSchema).max(100),
  })
  .strict();
export type Plan = z.infer<typeof planSchema>;
export function applyActions(raw: Project, rawPlan: Plan): Project {
  const project = structuredClone(projectSchema.parse(raw)),
    plan = planSchema.parse(rawPlan);
  for (const a of plan.actions) {
    switch (a.type) {
      case "rename_project":
        project.name = a.name;
        break;
      case "set_thermo_model":
        project.thermo = {
          ...defaultThermo,
          modelId: a.modelId,
          mixture: a.mixture,
          extrapolate: a.extrapolate,
          ...(a.catalog ? { catalog: a.catalog } : {}),
        };
        break;
      case "add":
        if (project.units.some((n) => n.id === a.unit.id))
          throw new Error(`Duplicate equipment ${a.unit.id}.`);
        project.units.push(a.unit);
        break;
      case "connect":
        project.edges.push({
          ...a.edge,
          name: a.edge.name ?? availableStreamName(project.edges),
        });
        break;
      case "update": {
        const n = project.units.find((n) => n.id === a.id);
        if (!n) throw new Error(`Unknown equipment ${a.id}.`);
        if (a.name !== undefined) n.name = a.name;
        if (a.position !== undefined) n.position = a.position;
        const { distillation, packedBed, ...params } = a.params;
        n.params = { ...n.params, ...params };
        if (n.missingInputs?.length) {
          n.missingInputs = n.missingInputs.filter((field) =>
            field === "composition"
              ? params.composition === undefined &&
                params.fractionA === undefined
              : params[field] === undefined,
          );
          if (!n.missingInputs.length) delete n.missingInputs;
        }
        if (packedBed !== undefined)
          n.params.packedBed = packedBed ?? undefined;
        if (distillation === null) delete n.params.distillation;
        else if (distillation !== undefined) {
          const { hydraulics, ...settings } = distillation;
          const previous = n.params.distillation;
          // Validate defaults and the liquid seal on the merged configuration.
          n.params.distillation = distillationSchema.parse({
            ...previous,
            ...settings,
            ...(hydraulics !== undefined
              ? {
                  hydraulics:
                    hydraulics === null
                      ? undefined
                      : { ...previous?.hydraulics, ...hydraulics },
                }
              : {}),
          });
        }
        break;
      }
      case "disconnect":
        if (!project.edges.some((e) => e.id === a.id))
          throw new Error(`Unknown stream ${a.id}.`);
        project.edges = project.edges.filter((e) => e.id !== a.id);
        break;
      case "update_stream": {
        const edge = project.edges.find((e) => e.id === a.id);
        if (!edge) throw new Error(`Unknown stream ${a.id}.`);
        Object.assign(edge, a.changes);
        break;
      }
      case "remove":
        if (!project.units.some((n) => n.id === a.id))
          throw new Error(`Unknown equipment ${a.id}.`);
        project.units = project.units.filter((n) => n.id !== a.id);
        project.edges = project.edges.filter(
          (e) => e.source !== a.id && e.target !== a.id,
        );
        break;
    }
  }
  const parsed = projectSchema.parse(project);
  const errors = validateGraph(parsed);
  if (errors.length) throw new Error(errors.join(" "));
  return parsed;
}

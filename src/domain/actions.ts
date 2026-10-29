import { z } from "zod";
import { defaultThermo, thermoSchema } from "./thermo/registry";
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
  })
  .strict();
export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add"), unit: unitSchema }).strict(),
  z.object({ type: z.literal("connect"), edge: edgeSchema }).strict(),
  z
    .object({
      type: z.literal("update"),
      id: z.string().max(64),
      params: updateParamsSchema,
    })
    .strict(),
  z.object({ type: z.literal("remove"), id: z.string().max(64) }).strict(),
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
      case "set_thermo_model":
        project.thermo = {
          ...defaultThermo,
          modelId: a.modelId,
          mixture: a.mixture,
          extrapolate: a.extrapolate,
        };
        break;
      case "add":
        if (project.units.some((n) => n.id === a.unit.id))
          throw new Error(`Duplicate equipment ${a.unit.id}.`);
        project.units.push(a.unit);
        break;
      case "connect":
        project.edges.push(a.edge);
        break;
      case "update": {
        const n = project.units.find((n) => n.id === a.id);
        if (!n) throw new Error(`Unknown equipment ${a.id}.`);
        n.params = { ...n.params, ...a.params };
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

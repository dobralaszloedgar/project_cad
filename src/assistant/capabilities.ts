import { z } from "zod";
import { planSchema } from "../domain/actions";
import { kinds, ports, projectSchema, unitSchema } from "../domain/schema";
import { models } from "../domain/thermo/registry";
import { sampleMixtures } from "../domain/thermo/catalog";
import { AI_GUIDE_VERSION, engineeringGuidance } from "./guide";
import { tools, type AssistantMode } from "./protocol";

export const previewRequestSchema = z
  .object({
    project: projectSchema,
    plan: planSchema,
    baseRevision: z.string().length(64).optional(),
  })
  .strict();

export function projectCapabilities(mode: AssistantMode | "stateless") {
  return {
    guide: {
      version: AI_GUIDE_VERSION,
      url: "/api/ai/guide",
      tool: "get_guide",
    },
    projectSchema: z.toJSONSchema(projectSchema, { io: "input" }),
    actionSchema: z.toJSONSchema(planSchema, { io: "input" }),
    equipmentSchema: z.toJSONSchema(unitSchema, { io: "input" }),
    ports: Object.fromEntries(kinds.map((kind) => [kind, ports(kind)])),
    models,
    sampleMixtures,
    tools: Object.fromEntries(
      Object.entries(tools).map(([name, tool]) => [
        name,
        {
          description: tool.description,
          inputSchema: z.toJSONSchema(tool.schema, { io: "input" }),
          available:
            mode !== "stateless" &&
            (mode !== "read-only" || name !== "propose_actions"),
        },
      ]),
    ),
    api: {
      guide: { method: "GET", path: "/api/ai/guide" },
      capabilities: { method: "GET", path: "/api/capabilities" },
      preview: {
        method: "POST",
        path: "/api/actions/preview",
        inputSchema: z.toJSONSchema(previewRequestSchema, { io: "input" }),
      },
      simulate: { method: "POST", path: "/api/simulate", body: "Project" },
      chemicalModels: { method: "GET", path: "/api/chemicals/models" },
      chemicalSearch: { method: "GET", path: "/api/chemicals" },
      chemicalSelection: { method: "POST", path: "/api/chemicals/selection" },
    },
    units: {
      temperature: "K",
      pressure: "Pa",
      flow: "mol/s",
      heatDuty: "W",
      residenceTime: "s",
      catalystMass: "kg",
      hydraulics: {
        diameter: "m",
        traySpacing: "m",
        holeDiameter: "m",
        weirHeight: "m",
        downcomerClearance: "m",
        downcomerFraction: "1",
        holeAreaFraction: "1",
        dischargeCoefficient: "1",
        liquidDensity: "kg/m3",
        surfaceTension: "N/m",
        pressureDropPa: "Pa (diagnostic only)",
        vaporDensity: "kg/m3",
        vaporVelocity: "m/s",
        holeVelocity: "m/s",
        liquidVolumeFlow: "m3/s",
        floodVelocity: "m/s",
        weepVelocity: "m/s",
        clearLiquidHeight: "m",
        frothHeight: "m",
        downcomerBackup: "m",
        floodFraction: "1 (0.8 = 80%)",
        weepRatio: "1 (actual / critical hole velocity)",
      },
    },
    results: {
      httpRoot: "Result",
      toolRoot: "result",
      column: "equipment[unitId].distillation",
      hydraulics: "equipment[unitId].distillation.hydraulics",
      hydraulicStatus: ["rated", "partial", "unavailable"],
      hydraulicState: [
        "normal",
        "near-flooding",
        "weeping",
        "flooding",
        "flooding-and-weeping",
        "unrated",
      ],
      hydraulicFeedback: false,
      unavailableMetric: null,
    },
    limits: engineeringGuidance,
    mode,
  };
}

// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { z } from "zod";
import { thermoSchema } from "./thermo/registry";
import { nameStreams } from "./stream-names";
import { compositionSchema, packedBedSchema } from "./reactions/schema";
import { distillationSchema } from "./equipment/distillation-schema";
import { componentSplitSchema } from "./equipment/component-split-schema";
import {
  junctionBranchCount,
  mixerInlets,
  separateMixerInlets,
  splitterOutlets,
} from "./material-ports";
export const MAX_PROJECT_REQUEST_BYTES = 4 * 1024 * 1024;
export const kinds = [
  "Feed",
  "Product",
  "Mixer",
  "Splitter",
  "PBR",
  "Heater",
  "Cooler",
  "Distillation",
] as const;
export type Kind = (typeof kinds)[number];
const id = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,64}$/)
  .refine(
    (v) => !["__proto__", "constructor", "prototype"].includes(v),
    "Reserved identifier",
  );
const temp = z.number().min(250).max(800);
export const paramsSchema = z
  .object({
    temperature: temp.default(450),
    pressure: z.number().min(10000).max(2000000).default(101325),
    flow: z.number().min(0.001).max(1000).default(10),
    fractionA: z.number().min(0).max(1).default(1),
    composition: compositionSchema.optional(),
    packedBed: packedBedSchema.optional(),
    distillation: distillationSchema.optional(),
    componentSplit: componentSplitSchema.optional(),
    residenceTime: z.number().min(0).max(1000).default(10),
    reactorMode: z
      .enum(["residence-time", "catalyst-weight"])
      .default("residence-time"),
    catalystMass: z.number().min(0).max(10000).default(10),
    catalystRateConstant: z.number().positive().max(10).default(0.01),
    thermalMode: z.enum(["temperature", "duty"]).default("temperature"),
    heatDuty: z.number().min(-1e8).max(1e8).default(0),
    recycleFraction: z.number().min(0).max(0.95).default(0.5),
    branchCount: z.number().int().min(2).max(4).optional(),
    splitFractions: z
      .array(z.number().min(0).max(1))
      .min(2)
      .max(4)
      .refine(
        (fractions) =>
          Math.abs(fractions.reduce((sum, value) => sum + value, 0) - 1) < 1e-8,
        "Outlet fractions must sum to 1.",
      )
      .optional(),
    relativeVolatility: z.number().min(1.01).max(20).default(3),
    distillateFraction: z.number().min(0.01).max(0.99).default(0.5),
    trayCount: z.number().int().min(2).max(80).default(8),
  })
  .strict();
export const unitSchema = z
  .object({
    id,
    kind: z.enum(kinds),
    name: z.string().min(1).max(60),
    position: z
      .object({
        x: z.number().min(-10000).max(10000),
        y: z.number().min(-10000).max(10000),
      })
      .strict(),
    params: paramsSchema,
    // Interactive feeds can be saved before their operating inputs are supplied.
    // Existing projects and templates keep their already specified values.
    missingInputs: z
      .array(z.enum(["flow", "temperature", "pressure", "composition"]))
      .max(4)
      .optional(),
  })
  .strict();
export const edgeSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(60).optional(),
    colorIndex: z.number().int().min(0).max(7).optional(),
    source: id,
    target: id,
    sourcePort: z.enum(splitterOutlets),
    targetPort: z.enum(mixerInlets),
    color: z.enum(["teal", "blue", "amber"]).default("teal"),
  })
  .strict();
export const projectSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1).max(80),
    units: z.array(unitSchema).max(40),
    edges: z.array(edgeSchema).max(80).transform(nameStreams),
    thermo: thermoSchema.optional(),
  })
  .strict()
  .transform(separateMixerInlets);
export type Unit = z.infer<typeof unitSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Connection = z.infer<typeof edgeSchema>;
export const ports = (kind: Kind) => ({
  inputs: kind === "Feed" ? [] : kind === "Mixer" ? [...mixerInlets] : ["in"],
  outputs:
    kind === "Product"
      ? []
      : kind === "Splitter"
        ? [...splitterOutlets]
        : kind === "Distillation"
          ? ["out", "out2"]
          : ["out"],
});
export function visiblePorts(unit: Unit, connected: readonly string[] = []) {
  const available = ports(unit.kind);
  const count = junctionBranchCount(unit, connected);
  return {
    inputs:
      unit.kind === "Mixer"
        ? available.inputs.slice(0, count)
        : available.inputs,
    outputs:
      unit.kind === "Splitter"
        ? available.outputs.slice(0, count)
        : available.outputs,
  };
}
export function requiredOutputs(unit: Unit) {
  return ports(unit.kind).outputs.filter(
    (_, index) =>
      unit.kind !== "Splitter" ||
      index < 2 ||
      (unit.params.splitFractions?.[index] ?? 0) > 0,
  );
}
export function newUnit(kind: Kind, id: string, x: number, y: number): Unit {
  return unitSchema.parse({
    id,
    kind,
    name: kind === "PBR" ? "Packed-bed reactor" : kind,
    position: { x, y },
    params: {
      temperature: kind === "Feed" ? 300 : kind === "Cooler" ? 300 : 450,
      ...(kind === "PBR" ? { reactorMode: "catalyst-weight" } : {}),
    },
  });
}
export interface GraphDiagnostic {
  kind: "missing" | "error";
  message: string;
  unitId?: string;
  port?: string;
}

/** Keep equipment identity alongside validation text, including duplicate names. */
export function graphDiagnostics(
  project: Project,
  complete = false,
): GraphDiagnostic[] {
  const errors: GraphDiagnostic[] = [];
  const report = (
    message: string,
    unitId?: string,
    kind: GraphDiagnostic["kind"] = "error",
    port?: string,
  ) => errors.push({ message, unitId, kind, port });
  const units = new Map(project.units.map((n) => [n.id, n]));
  if (units.size !== project.units.length)
    report("Equipment IDs must be unique.");
  if (new Set(project.edges.map((e) => e.id)).size !== project.edges.length)
    report("Stream IDs must be unique.");
  const used = new Set<string>();
  for (const unit of project.units)
    if (
      unit.kind === "Mixer" &&
      project.edges.filter((edge) => edge.target === unit.id).length > 4
    )
      report(`${unit.name}: connect at most four inlet streams.`, unit.id);
  for (const e of project.edges) {
    const source = units.get(e.source),
      target = units.get(e.target);
    if (!source || !target) {
      report(
        `Stream ${e.id} references missing equipment.`,
        source?.id ?? target?.id,
      );
      continue;
    }
    if (e.source === e.target)
      report("Self-connections are not supported.", source.id);
    if (
      !ports(source.kind).outputs.includes(e.sourcePort) ||
      !ports(target.kind).inputs.includes(e.targetPort)
    )
      report(`Stream ${e.id} has incompatible material ports.`, target.id);
    for (const [key, acceptsMultiple] of [
      [`${e.source}:source:${e.sourcePort}`, false],
      [`${e.target}:target:${e.targetPort}`, target.kind === "Mixer"],
    ] as const) {
      if (used.has(key) && !acceptsMultiple)
        report(
          "Each port accepts one stream; use a mixer or splitter.",
          key.split(":")[0],
        );
      used.add(key);
    }
  }
  if (complete) {
    if (
      !project.units.some((n) => n.kind === "Feed") ||
      !project.units.some((n) => n.kind === "Product")
    )
      report("Add at least one Feed and Product.", undefined, "missing");
    const reachable = (starts: string[], reverse: boolean) => {
      const seen = new Set(starts);
      let changed = true;
      while (changed) {
        changed = false;
        for (const e of project.edges) {
          const from = reverse ? e.target : e.source,
            to = reverse ? e.source : e.target;
          if (seen.has(from) && !seen.has(to)) {
            seen.add(to);
            changed = true;
          }
        }
      }
      return seen;
    };
    const fromFeeds = reachable(
        project.units.filter((n) => n.kind === "Feed").map((n) => n.id),
        false,
      ),
      toProducts = reachable(
        project.units.filter((n) => n.kind === "Product").map((n) => n.id),
        true,
      );
    for (const n of project.units) {
      if (!fromFeeds.has(n.id) || !toProducts.has(n.id))
        report(
          `${n.name}: equipment must be on a path from Feed to Product.`,
          n.id,
          "missing",
        );
      for (const p of requiredOutputs(n))
        if (!used.has(`${n.id}:source:${p}`))
          report(`${n.name}: connect ${p}.`, n.id, "missing", p);
      if (n.kind === "Mixer") {
        if (!ports(n.kind).inputs.some((p) => used.has(`${n.id}:target:${p}`)))
          report(`${n.name}: connect an inlet.`, n.id, "missing", "in");
        continue;
      }
      for (const p of ports(n.kind).inputs.filter((p) => p !== "in2"))
        if (!used.has(`${n.id}:target:${p}`))
          report(`${n.name}: connect ${p}.`, n.id, "missing", p);
    }
  }
  return errors;
}
export function validateGraph(project: Project, complete = false): string[] {
  return [
    ...new Set(
      graphDiagnostics(project, complete).map((issue) => issue.message),
    ),
  ];
}

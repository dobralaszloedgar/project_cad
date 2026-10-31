import { z } from "zod";
import { thermoSchema } from "./thermo/registry";
import { nameStreams } from "./stream-names";
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
    residenceTime: z.number().min(0).max(1000).default(10),
    reactorMode: z
      .enum(["residence-time", "catalyst-weight"])
      .default("residence-time"),
    catalystMass: z.number().min(0).max(10000).default(10),
    catalystRateConstant: z.number().positive().max(10).default(0.01),
    thermalMode: z.enum(["temperature", "duty"]).default("temperature"),
    heatDuty: z.number().min(-1e8).max(1e8).default(0),
    recycleFraction: z.number().min(0).max(0.95).default(0.5),
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
  })
  .strict();
export const edgeSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(60).optional(),
    colorIndex: z.number().int().min(0).max(7).optional(),
    source: id,
    target: id,
    sourcePort: z.enum(["out", "out2"]),
    targetPort: z.enum(["in", "in2"]),
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
  .strict();
export type Unit = z.infer<typeof unitSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Connection = z.infer<typeof edgeSchema>;
export const ports = (kind: Kind) => ({
  inputs: kind === "Feed" ? [] : kind === "Mixer" ? ["in", "in2"] : ["in"],
  outputs:
    kind === "Product"
      ? []
      : kind === "Splitter" || kind === "Distillation"
        ? ["out", "out2"]
        : ["out"],
});
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
export function validateGraph(project: Project, complete = false): string[] {
  const errors: string[] = [];
  const units = new Map(project.units.map((n) => [n.id, n]));
  if (units.size !== project.units.length)
    errors.push("Equipment IDs must be unique.");
  if (new Set(project.edges.map((e) => e.id)).size !== project.edges.length)
    errors.push("Stream IDs must be unique.");
  const used = new Set<string>();
  for (const e of project.edges) {
    const source = units.get(e.source),
      target = units.get(e.target);
    if (!source || !target) {
      errors.push(`Stream ${e.id} references missing equipment.`);
      continue;
    }
    if (e.source === e.target)
      errors.push("Self-connections are not supported.");
    if (
      !ports(source.kind).outputs.includes(e.sourcePort) ||
      !ports(target.kind).inputs.includes(e.targetPort)
    )
      errors.push(`Stream ${e.id} has incompatible material ports.`);
    for (const [key, acceptsMultiple] of [
      [`${e.source}:source:${e.sourcePort}`, false],
      [`${e.target}:target:${e.targetPort}`, target.kind === "Mixer"],
    ] as const) {
      if (used.has(key) && !acceptsMultiple)
        errors.push("Each port accepts one stream; use a mixer or splitter.");
      used.add(key);
    }
  }
  if (complete) {
    if (
      !project.units.some((n) => n.kind === "Feed") ||
      !project.units.some((n) => n.kind === "Product")
    )
      errors.push("Add at least one Feed and Product.");
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
        errors.push(
          `${n.name}: equipment must be on a path from Feed to Product.`,
        );
      for (const p of ports(n.kind).outputs)
        if (!used.has(`${n.id}:source:${p}`))
          errors.push(`${n.name}: connect ${p}.`);
      if (n.kind === "Mixer") {
        if (!ports(n.kind).inputs.some((p) => used.has(`${n.id}:target:${p}`)))
          errors.push(`${n.name}: connect an inlet.`);
        continue;
      }
      for (const p of ports(n.kind).inputs.filter((p) => p !== "in2"))
        if (!used.has(`${n.id}:target:${p}`))
          errors.push(`${n.name}: connect ${p}.`);
    }
  }
  return [...new Set(errors)];
}

import { newUnit, projectSchema, type Project } from "./schema";
import { availableStreamName } from "./stream-names";

// Preserve both feeds in older saved projects by making their mixing explicit.
export function migrateReactorInlets(project: Project): Project {
  const next = structuredClone(project);
  const ids = new Set([...next.units, ...next.edges].map((item) => item.id));
  function unique(prefix: string) {
    let suffix = 1;
    while (ids.has(`${prefix}-${suffix}`)) suffix++;
    const id = `${prefix}-${suffix}`;
    ids.add(id);
    return id;
  }
  for (const reactor of project.units.filter((unit) => unit.kind === "PBR")) {
    const feeds = next.edges.filter((edge) => edge.target === reactor.id);
    if (!feeds.some((edge) => edge.targetPort === "in2")) continue;
    if (feeds.length === 1) {
      feeds[0].targetPort = "in";
      continue;
    }
    if (next.units.length >= 40 || next.edges.length >= 80)
      throw new Error(
        "This older project needs space for an upstream mixer. Remove one unused unit and stream before importing.",
      );
    const mixer = newUnit(
      "Mixer",
      unique("reactor-mixer"),
      Math.max(-10000, reactor.position.x - 185),
      reactor.position.y,
    );
    next.units.push(mixer);
    for (const feed of feeds) feed.target = mixer.id;
    next.edges.push({
      id: unique("mixed-feed"),
      name: availableStreamName(next.edges),
      source: mixer.id,
      sourcePort: "out",
      target: reactor.id,
      targetPort: "in",
      color: "teal",
    });
  }
  return projectSchema.parse(next);
}

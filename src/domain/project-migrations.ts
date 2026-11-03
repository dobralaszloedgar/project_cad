// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { newUnit, projectSchema, type Project } from "./schema";
import { availableStreamName } from "./stream-names";
import { mixerInlets } from "./material-ports";

// Preserve feeds in older saved projects by making their mixing explicit.
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
    if (feeds.length < 2 && !feeds.some((edge) => edge.targetPort === "in2"))
      continue;
    if (feeds.length === 1) {
      feeds[0].targetPort = "in";
      continue;
    }
    const mixerCount = Math.ceil((feeds.length - 1) / (mixerInlets.length - 1));
    if (
      next.units.length + mixerCount > 40 ||
      next.edges.length + mixerCount > 80
    )
      throw new Error(
        `This older project needs space for ${mixerCount} upstream mixer(s) and stream(s). Remove unused equipment and streams before importing.`,
      );
    let pending = feeds;
    for (let index = 0; index < mixerCount; index++) {
      const mixer = newUnit(
        "Mixer",
        unique("reactor-mixer"),
        Math.max(-10000, reactor.position.x - 185 * (mixerCount - index)),
        reactor.position.y,
      );
      next.units.push(mixer);
      pending.slice(0, mixerInlets.length).forEach((feed, port) => {
        feed.target = mixer.id;
        feed.targetPort = mixerInlets[port];
      });
      const mixed: Project["edges"][number] = {
        id: unique("mixed-feed"),
        name: availableStreamName(next.edges),
        source: mixer.id,
        sourcePort: "out",
        target: reactor.id,
        targetPort: "in",
        color: "teal",
      };
      next.edges.push(mixed);
      pending = [mixed, ...pending.slice(mixerInlets.length)];
    }
  }
  return projectSchema.parse(next);
}

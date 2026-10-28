import { z } from "zod";
import { projectSchema, type Project } from "../domain/schema";
export const revisionSchema = z
  .object({
    id: z.string().max(80),
    label: z.string().max(120),
    time: z.string().max(50),
    project: projectSchema,
  })
  .strict();
export type Revision = z.infer<typeof revisionSchema>;
export const workspaceSchema = z
  .object({
    version: z.literal(1),
    project: projectSchema,
    revisions: z.array(revisionSchema).max(250),
  })
  .strict();
export type Workspace = z.infer<typeof workspaceSchema>;
export function checkpoint(project: Project, label: string): Revision {
  return {
    id: crypto.randomUUID(),
    label,
    time: new Date().toISOString(),
    project: structuredClone(project),
  };
}
export function restore(workspace: Workspace, revision: Revision): Workspace {
  return {
    version: 1,
    project: structuredClone(revision.project),
    revisions: [
      ...workspace.revisions,
      checkpoint(workspace.project, "Before restore"),
      checkpoint(revision.project, `Restored: ${revision.label}`),
    ],
  };
}
export function diff(before: Project, after: Project) {
  const added = after.units.filter(
    (n) => !before.units.some((b) => b.id === n.id),
  );
  const removed = before.units.filter(
    (n) => !after.units.some((b) => b.id === n.id),
  );
  const changed = after.units.filter((n) => {
    const b = before.units.find((b) => b.id === n.id);
    return b && JSON.stringify(b) !== JSON.stringify(n);
  });
  const streamsAdded = after.edges.filter(
    (e) => !before.edges.some((b) => JSON.stringify(b) === JSON.stringify(e)),
  ).length;
  const streamsRemoved = before.edges.filter(
    (e) => !after.edges.some((b) => JSON.stringify(b) === JSON.stringify(e)),
  ).length;
  return { added, removed, changed, streamsAdded, streamsRemoved };
}

import { z } from "zod";
import { projectSchema, validateGraph } from "../domain/schema";
import { workspaceSchema, type Workspace } from "./revisions";

export const MAX_PROJECT_FILE_BYTES = 32_000_000;
export const PROJECT_FILE_NAME = "project.json";
export const PROJECT_FILE_EXTENSION = ".pcad";

export function projectDisplayName(project: {
  fileName?: string;
  workspace: Workspace;
}): string {
  return project.fileName?.toLowerCase().endsWith(PROJECT_FILE_EXTENSION)
    ? project.fileName.slice(0, -PROJECT_FILE_EXTENSION.length)
    : project.workspace.project.name;
}

export function projectLocation(project: {
  folderName?: string;
  fileName?: string;
  relativePath?: string;
  rootName?: string;
}): string {
  return project.rootName && project.relativePath
    ? `${project.rootName}/${project.relativePath}`
    : project.folderName
      ? `${project.folderName}/${project.fileName ?? PROJECT_FILE_NAME}`
      : "Browser storage";
}

const fileSchema = z
  .object({
    format: z.literal("project-cad"),
    formatVersion: z.literal(1),
    projectId: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    workspace: workspaceSchema,
  })
  .strict();

export type ProjectFile = z.infer<typeof fileSchema>;

export function validateWorkspace(value: unknown): Workspace {
  const workspace = workspaceSchema.parse(value);
  for (const project of [
    workspace.project,
    ...workspace.revisions.map((revision) => revision.project),
  ]) {
    const errors = validateGraph(project);
    if (errors.length) throw new Error(errors.join(" "));
  }
  return workspace;
}

function readJson(text: string): unknown {
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_FILE_BYTES)
    throw new Error("Project file exceeds 32 MB.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("This project file is not valid JSON.");
  }
}

export function parseProjectFile(text: string): ProjectFile {
  const raw = readJson(text);
  if (
    raw &&
    typeof raw === "object" &&
    "format" in raw &&
    raw.format === "project-cad" &&
    "formatVersion" in raw &&
    raw.formatVersion !== 1
  )
    throw new Error(
      "Unsupported project file version. This app supports version 1.",
    );
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error("This is not a valid Project CAD project file.");
  return {
    ...parsed.data,
    workspace: validateWorkspace(parsed.data.workspace),
  };
}

export function serializeProjectFile(value: ProjectFile): string {
  const parsed = fileSchema.parse(value);
  const text = `${JSON.stringify(
    { ...parsed, workspace: validateWorkspace(parsed.workspace) },
    null,
    2,
  )}\n`;
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_FILE_BYTES)
    throw new Error(
      "Project file exceeds 32 MB. Export a copy before continuing.",
    );
  return text;
}

export function parseWorkspaceImport(text: string): Workspace {
  const raw = readJson(text);
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Expected a Project CAD JSON document.");
  if ("format" in raw) return parseProjectFile(text).workspace;
  return validateWorkspace(
    "project" in raw
      ? raw
      : { version: 1, project: projectSchema.parse(raw), revisions: [] },
  );
}

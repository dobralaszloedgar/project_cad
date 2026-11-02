import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";

const pathSchema = z.string().min(1).max(4096);
export const projectFileTools = {
  list_project_files: {
    description:
      "List files in the CAD projects folder. Paths are relative to that folder. Links are not followed.",
    schema: z.object({ path: pathSchema.default(".") }).strict(),
  },
  read_project_file: {
    description:
      "Read a UTF-8 text file inside the CAD projects folder (up to 1 MB).",
    schema: z.object({ path: pathSchema }).strict(),
  },
  write_project_file: {
    description:
      "Write a UTF-8 text file inside the CAD projects folder, creating parent folders. For the connected open CAD project, use propose_actions so the app saves and records history.",
    schema: z
      .object({ path: pathSchema, content: z.string().max(1_000_000) })
      .strict(),
  },
  delete_project_file: {
    description:
      "Delete one file inside the CAD projects folder. Cannot delete directories or follow links.",
    schema: z.object({ path: pathSchema }).strict(),
  },
} as const;
export type ProjectFileTool = keyof typeof projectFileTools;

/** Sandbox has no native file or shell tools. All device access goes here. */
export class ProjectFiles {
  readonly root: string;
  constructor(directory: string) {
    if (!isAbsolute(directory))
      throw new Error("Choose an absolute CAD projects folder path.");
    mkdirSync(directory, { recursive: true });
    this.root = realpathSync(directory);
  }
  private path(value: string, createParents = false) {
    // Reject device paths and Windows alternate data streams on every platform.
    if (isAbsolute(value) || /[:\0]/.test(value))
      throw new Error("Use a relative path inside the CAD projects folder.");
    const file = resolve(this.root, value.replaceAll("\\", "/"));
    const local = relative(this.root, file);
    if (local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local))
      throw new Error("Access is limited to the CAD projects folder.");
    if (
      realpathSync(this.root) !== this.root ||
      lstatSync(this.root).isSymbolicLink()
    )
      throw new Error(
        "The CAD projects folder changed. Reconnect the assistant.",
      );
    if (
      value
        .split(/[\\/]/)
        .some(
          (part) =>
            part !== "." &&
            part !== ".." &&
            (/[. ]$|[<>"|?*]/.test(part) ||
              /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)),
        )
    )
      throw new Error(
        "Use a regular project file path without device names or trailing dots/spaces.",
      );
    let current = this.root;
    const parts = local ? local.split(sep) : [];
    for (let index = 0; index < parts.length; index++) {
      current = join(current, parts[index]);
      try {
        const info = lstatSync(current);
        if (info.isSymbolicLink() || (info.isFile() && info.nlink > 1))
          throw new Error(
            "Sandbox access cannot follow symbolic links, junctions, or hard links.",
          );
        if (!info.isFile() && !info.isDirectory())
          throw new Error("Not a regular project file.");
        if (index < parts.length - 1 && !info.isDirectory())
          throw new Error("Not a project directory.");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        if (index < parts.length - 1) {
          if (!createParents) throw error;
          mkdirSync(current);
        }
      }
    }
    return file;
  }
  call(name: ProjectFileTool, raw: unknown) {
    const args = projectFileTools[name].schema.parse(raw);
    const file = this.path(args.path, name === "write_project_file");
    if (name === "list_project_files") {
      const entries = readdirSync(file, { withFileTypes: true });
      return {
        path: args.path,
        truncated: entries.length > 1000,
        entries: entries.slice(0, 1000).map((entry) => ({
          name: entry.name,
          type: entry.isSymbolicLink()
            ? "link (blocked)"
            : entry.isDirectory()
              ? "directory"
              : "file",
        })),
      };
    }
    if (name === "read_project_file") {
      const info = lstatSync(file);
      if (!info.isFile() || info.size > 1_000_000)
        throw new Error("Choose a regular text file up to 1 MB.");
      return { path: args.path, content: readFileSync(file, "utf8") };
    }
    if (file === this.root)
      throw new Error("Choose a file inside the CAD projects folder.");
    if (name === "delete_project_file") {
      if (!lstatSync(file).isFile())
        throw new Error("Only individual files can be deleted.");
      unlinkSync(file);
      return { path: args.path, deleted: true };
    }
    const { content } = projectFileTools.write_project_file.schema.parse(args);
    if (Buffer.byteLength(content) > 1_000_000)
      throw new Error("File exceeds 1 MB.");
    const temporary = join(dirname(file), `.project-cad-${randomUUID()}.tmp`);
    try {
      writeFileSync(temporary, content, { flag: "wx", mode: 0o600 });
      this.path(args.path);
      renameSync(temporary, file);
    } finally {
      try {
        unlinkSync(temporary);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return { path: args.path, written: true };
  }
}

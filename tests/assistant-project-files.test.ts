// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { afterEach, expect, it } from "vitest";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectFiles } from "../src/server/assistant/project-files";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "cad-sandbox-"));
  roots.push(root);
  const outside = join(root, "outside");
  mkdirSync(outside);
  writeFileSync(join(outside, "private.txt"), "private");
  const files = new ProjectFiles(join(root, "projects"));
  return { files, outside };
}
it("lists, reads, writes and deletes project files without approvals", () => {
  const { files } = fixture();
  files.call("write_project_file", { path: "plant/notes.txt", content: "cad" });
  expect(
    files.call("read_project_file", { path: "plant/notes.txt" }),
  ).toMatchObject({ content: "cad" });
  expect(files.call("list_project_files", { path: "plant" })).toMatchObject({
    entries: [{ name: "notes.txt", type: "file" }],
  });
  files.call("write_project_file", {
    path: "plant/notes.txt",
    content: "updated",
  });
  expect(readFileSync(join(files.root, "plant/notes.txt"), "utf8")).toBe(
    "updated",
  );
  files.call("delete_project_file", { path: "plant/notes.txt" });
  expect(files.call("list_project_files", { path: "plant" })).toMatchObject({
    entries: [],
  });
});
it("blocks traversal, absolute paths, alternate streams, junctions and hard links", () => {
  const { files, outside } = fixture();
  symlinkSync(
    outside,
    join(files.root, "escape"),
    process.platform === "win32" ? "junction" : "dir",
  );
  linkSync(join(outside, "private.txt"), join(files.root, "linked.txt"));
  for (const path of [
    "../outside/private.txt",
    "..\\outside\\private.txt",
    join(outside, "private.txt"),
    "escape/private.txt",
    "linked.txt",
    "notes.txt:secret",
    ".. /outside/private.txt",
    "NUL",
    "plant/CON.txt",
  ]) {
    expect(() => files.call("read_project_file", { path })).toThrow();
    expect(() =>
      files.call("write_project_file", { path, content: "changed" }),
    ).toThrow();
    expect(() => files.call("delete_project_file", { path })).toThrow();
  }
  expect(readFileSync(join(outside, "private.txt"), "utf8")).toBe("private");
  expect(() => files.call("delete_project_file", { path: "." })).toThrow();
});

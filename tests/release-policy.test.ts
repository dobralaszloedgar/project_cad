import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertReferenceContent,
  checkDirectoryReferences,
  inspectReferenceContent,
  loadReferencePolicy,
  validateReferencePolicy,
} from "../scripts/assistant/reference-policy.mjs";

const policy = validateReferencePolicy({
  version: 1,
  rules: [{ id: "P01", terms: ["RetiredExample"] }],
});

describe("release reference policy", () => {
  it("detects mixed-case text and both UTF-16 byte orders", () => {
    for (const data of [
      Buffer.from("RETIREDexample"),
      Buffer.from("RetiredExample", "utf16le"),
      Buffer.from("RetiredExample", "utf16le").swap16(),
    ])
      expect(inspectReferenceContent(data, "app.bin", policy)).toHaveLength(1);
  });
  it("detects escaped references in source and metadata", () => {
    for (const value of [
      "Retired\\u0045xample",
      "Retired%45xample",
      "Retired&#69;xample",
    ])
      expect(
        inspectReferenceContent(Buffer.from(value), "manifest.json", policy),
      ).toHaveLength(1);
  });
  it("reports identifiers without echoing restricted text or filenames", () => {
    expect(() =>
      assertReferenceContent(
        Buffer.from("RetiredExample"),
        "config.json",
        policy,
      ),
    ).toThrow("config.json (P01)");
    try {
      assertReferenceContent(Buffer.from("safe"), "RetiredExample.txt", policy);
    } catch (error) {
      expect(String(error)).toContain("restricted filename");
      expect(String(error)).not.toContain("RetiredExample");
      return;
    }
    throw new Error("The filename check did not reject its fixture.");
  });
  it("checks decoded WebAssembly byte arrays before allowing a release", () => {
    const bytes = Buffer.from("\0asm\x01\0\0\0RetiredExample/build/source.rs");
    expect(() =>
      assertReferenceContent(
        Buffer.from(JSON.stringify([...bytes])),
        "src/domain/thermo/kernel.wasm.json",
        policy,
      ),
    ).toThrow("P01");
    expect(() =>
      assertReferenceContent(
        Buffer.from(JSON.stringify([...Buffer.from("\0asm\x01\0\0\0")])),
        "kernel.wasm.json",
        policy,
      ),
    ).not.toThrow();
    for (const content of ["{", "{}", "[256]", "[-1]", '["82"]', "[1.5]"])
      expect(() =>
        assertReferenceContent(
          Buffer.from(content),
          "kernel.wasm.json",
          policy,
        ),
      ).toThrow("Invalid WebAssembly byte-array file");
  });
  it("allows an exact enclosing string only at its approved path", () => {
    const scoped = validateReferencePolicy({
      version: 1,
      rules: [
        {
          id: "P02",
          terms: ["plain"],
          exceptions: [
            { pathPattern: "^runtime/node$", enclosingText: "EXPLAIN" },
          ],
        },
      ],
    });
    expect(
      inspectReferenceContent(Buffer.from("EXPLAIN"), "runtime/node", scoped),
    ).toEqual([]);
    expect(
      inspectReferenceContent(Buffer.from("EXPLAIN"), "app.js", scoped),
    ).toHaveLength(1);
    expect(
      inspectReferenceContent(
        Buffer.from("plain EXPLAIN"),
        "runtime/node",
        scoped,
      ),
    ).toHaveLength(1);
  });
  it("fails closed when policy configuration is missing or malformed", async () => {
    await expect(
      loadReferencePolicy({
        NODE_ENV: "test",
        RELEASE_REFERENCE_POLICY_FILE: "/no-such-release-policy.json",
      }),
    ).rejects.toThrow("Release policy is required");
    await expect(
      loadReferencePolicy({ NODE_ENV: "test", RELEASE_REFERENCE_POLICY: "{" }),
    ).rejects.toThrow("valid JSON");
    expect(() => validateReferencePolicy({ version: 1, rules: [] })).toThrow();
  });
  it("checks nested packaged files", async () => {
    const root = await mkdtemp(join(tmpdir(), "project-cad-policy-test-"));
    try {
      await mkdir(join(root, "app"));
      await writeFile(
        join(root, "app", "settings.json"),
        '{"name":"Project CAD Assistant"}',
      );
      expect(await checkDirectoryReferences(root, policy)).toEqual({
        files: 1,
      });
      await writeFile(
        join(root, "app", "settings.json"),
        '{"name":"RetiredExample"}',
      );
      await expect(checkDirectoryReferences(root, policy)).rejects.toThrow(
        "P01",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

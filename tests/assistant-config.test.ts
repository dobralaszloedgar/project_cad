import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applicationOrigin,
  loadAssistantSettings,
  providerExecutable,
} from "../src/server/assistant/config";

const directories: string[] = [];
function temporary() {
  const root = mkdtempSync(join(tmpdir(), "project-cad-settings-"));
  directories.push(root);
  return root;
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("local companion configuration", () => {
  it("accepts deployed HTTPS and loopback origins while rejecting credentials and insecure remote hosts", () => {
    expect(applicationOrigin("https://process.example/project?id=one")).toBe(
      "https://process.example",
    );
    expect(applicationOrigin("http://127.0.0.1:3000/plant")).toBe(
      "http://127.0.0.1:3000",
    );
    expect(applicationOrigin("http://[::1]:3000")).toBe("http://[::1]:3000");
    for (const value of [
      "http://process.example",
      "https://user:secret@process.example",
      "file:///tmp/project",
      "javascript:alert(1)",
    ])
      expect(() => applicationOrigin(value)).toThrow();
  });
  it("loads saved settings and refuses malformed settings without exposing a secret", () => {
    const root = temporary();
    expect(loadAssistantSettings(root).startAtLogin).toBe(true);
    writeFileSync(
      join(root, "settings.json"),
      JSON.stringify({
        websiteUrl: "https://process.example",
        startAtLogin: false,
        museApiKey: "test-only-key",
      }),
    );
    expect(loadAssistantSettings(root)).toMatchObject({
      startAtLogin: false,
      museApiKey: "test-only-key",
    });
    writeFileSync(
      join(root, "settings.json"),
      '{"museApiKey":"secret-truncated',
    );
    expect(() => loadAssistantSettings(root)).toThrow(
      "Could not read assistant settings",
    );
  });
  it("prefers a private managed executable and honors explicit overrides without treating directories as commands", () => {
    const root = temporary(),
      managed = join(root, "providers", "codex", "codex");
    mkdirSync(join(root, "providers", "codex"), { recursive: true });
    writeFileSync(managed, "#!/bin/sh\nexit 0\n");
    chmodSync(managed, 0o755);
    vi.stubEnv("PROJECT_CAD_ASSISTANT_DATA", root);
    vi.stubEnv("PROJECT_CAD_CODEX_BIN", "");
    expect(providerExecutable("codex")).toBe(managed);
    vi.stubEnv("PROJECT_CAD_CODEX_BIN", root);
    expect(providerExecutable("codex")).toBeUndefined();
    const override = join(root, "custom-codex");
    writeFileSync(override, "#!/bin/sh\nexit 0\n");
    chmodSync(override, 0o755);
    vi.stubEnv("PROJECT_CAD_CODEX_BIN", override);
    expect(providerExecutable("codex")).toBe(override);
  });
});

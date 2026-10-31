import { describe, expect, it, vi } from "vitest";
import { githubPublisher } from "../scripts/assistant/github-publisher.mjs";

describe("release publisher identity", () => {
  it("uses only the configured owner's saved credential, ignoring active environment credentials", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "owner-test-token\n" })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ login: "release-owner" }),
      })
      .mockResolvedValueOnce({ stdout: "published\n" });
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      PATH: "/usr/bin",
      GH_TOKEN: "unrelated-test-token",
      GITHUB_TOKEN: "another-test-token",
      GH_HOST: "other.example",
    };
    const gh = await githubPublisher("release-owner", execute, environment);
    expect(execute.mock.calls[0][1]).toEqual([
      "auth",
      "token",
      "--hostname",
      "github.com",
      "--user",
      "release-owner",
    ]);
    expect(execute.mock.calls[0][2].env).not.toHaveProperty("GH_TOKEN");
    expect(execute.mock.calls[0][2].env).not.toHaveProperty("GITHUB_TOKEN");
    expect(await gh(["release", "list", "--repo", "release-owner/app"])).toBe(
      "published",
    );
    for (const call of execute.mock.calls.slice(1)) {
      expect(call[2].env.GH_TOKEN).toBe("owner-test-token");
      expect(call[2].env.GH_HOST).toBe("github.com");
      expect(call[2].env).not.toHaveProperty("GITHUB_TOKEN");
    }
    expect(environment.GH_TOKEN).toBe("unrelated-test-token");
  });
  it("stops before any API request when the owner is not signed in", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("No saved account"));
    await expect(
      githubPublisher("release-owner", execute, { NODE_ENV: "test" }),
    ).rejects.toThrow("Sign in to the GitHub CLI as release-owner");
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("rejects credentials for a different identity before returning publishing access", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "wrong-test-token" })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ login: "different-account" }),
      });
    await expect(
      githubPublisher("release-owner", execute, { NODE_ENV: "test" }),
    ).rejects.toThrow("Publishing stopped");
    expect(execute).toHaveBeenCalledTimes(2);
  });
});

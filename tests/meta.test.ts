import { afterEach, describe, it, expect, vi } from "vitest";
import {
  generatePlan,
  metaStatus,
  META_MODEL,
  META_URL,
} from "../src/server/meta";
import { reactorExample } from "../src/domain/examples";
import { engineeringGuidance } from "../src/assistant/guide";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const configure = () => {
  vi.stubEnv("META_AI_ENABLED", "true");
  vi.stubEnv("MODEL_API_KEY", "test-fixture-not-a-real-key");
  vi.stubEnv("META_MODEL", META_MODEL);
};
const upstream = (plan: unknown, model = META_MODEL) =>
  new Response(
    JSON.stringify({
      model,
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(plan) }],
        },
      ],
    }),
    { status: 200 },
  );
describe("Meta gateway contract (mock transport, no live inference)", () => {
  it("never calls a model without explicit configuration", async () => {
    vi.stubEnv("META_AI_ENABLED", "false");
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    await expect(generatePlan("Build", reactorExample())).rejects.toThrow(
      /not configured/,
    );
    expect(network).not.toHaveBeenCalled();
  });
  it("rejects non-allowlisted model settings", () => {
    configure();
    vi.stubEnv("META_MODEL", "unverified-model");
    expect(metaStatus().enabled).toBe(false);
  });
  it("sends actual numerical evidence only to the pinned Meta endpoint", async () => {
    configure();
    const plan = {
      summary: "Raise reactor setpoint.",
      actions: [{ type: "update", id: "R-101", params: { temperature: 500 } }],
    };
    const network = vi.fn().mockResolvedValue(upstream(plan));
    vi.stubGlobal("fetch", network);
    const r = await generatePlan("Raise temperature", reactorExample());
    expect(r.plan).toEqual(plan);
    expect(network.mock.calls[0][0]).toBe(META_URL);
    const body = JSON.parse(network.mock.calls[0][1].body);
    expect(body.model).toBe(META_MODEL);
    expect(body.store).toBe(false);
    expect(body.instructions).toContain(engineeringGuidance);
    const evidence = JSON.parse(body.input).deterministicEvidence;
    expect(evidence.converged).toBe(true);
    expect(evidence.conversion).toBeCloseTo(0.7746003264, 8);
  });
  it("rejects unsupported actions and wrong model identities", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        upstream({
          summary: "Unsafe",
          actions: [{ type: "execute", code: "anything" }],
        }),
      ),
    );
    await expect(generatePlan("Build", reactorExample())).rejects.toThrow();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          upstream({ summary: "Wrong model", actions: [] }, "other-model"),
        ),
    );
    await expect(generatePlan("Build", reactorExample())).rejects.toThrow(
      /identity/,
    );
  });
  it("does not leak upstream response content on errors", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("sensitive upstream body", { status: 401 }),
        ),
    );
    await expect(generatePlan("Build", reactorExample())).rejects.toThrow(
      "Meta API request failed (401)",
    );
  });
});

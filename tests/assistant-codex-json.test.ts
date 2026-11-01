import { expect, it } from "vitest";
import { z } from "zod";
import { tools, toolNames } from "../src/assistant/protocol";
import { codexJson } from "../src/server/assistant/providers/codex-json";

it("keeps large schema bounds numeric without emitting oversized integer tokens", () => {
  const request = {
    id: 1,
    method: "thread/start",
    params: {
      dynamicTools: toolNames.map((name) => ({
        name,
        inputSchema: z.toJSONSchema(tools[name].schema),
      })),
    },
  };
  expect(JSON.stringify(request)).toContain("100000000000000000000");
  const encoded = codexJson(request);
  expect(encoded).toContain("1e+20");
  expect(encoded).not.toMatch(/:\s*-?\d{17,}(?=[,}])/);
  expect(JSON.parse(encoded)).toEqual(request);
});

it("preserves text, ordinary numbers and nested tool responses", () => {
  const value = {
    id: 12,
    maximum: 1e20,
    minimum: -1e20,
    values: [Number.MAX_SAFE_INTEGER, Number.MAX_VALUE, 0.00001, null],
    text: '100000000000000000000 and "maximum":100000000000000000000',
  };
  expect(JSON.parse(codexJson(value))).toEqual(value);
  expect(codexJson({ id: 12, value: 0.5 })).toBe('{"id":12,"value":0.5}');
});

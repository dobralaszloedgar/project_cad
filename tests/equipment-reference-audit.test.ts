import { describe, expect, it } from "vitest";
import { newUnit } from "../src/domain/schema";
import { enthalpy, flow, operate } from "../src/domain/solver";

describe("separation material-balance endpoints", () => {
  it.each([0, 1])(
    "preserves an exactly absent species at feed fraction A = %s",
    (fractionA) => {
      const inlet = {
        a: 10 * fractionA,
        b: 10 * (1 - fractionA),
        temperature: 350,
        pressure: 101325,
      };
      // With a pure feed, y=x=z at any positive relative volatility.
      // The fixed cut divides total flow without introducing another species.
      for (const relativeVolatility of [1.01, 3, 20]) {
        for (const distillateFraction of [0.01, 0.5, 0.99]) {
          const column = newUnit("Distillation", "D1", 0, 0);
          column.params.relativeVolatility = relativeVolatility;
          column.params.distillateFraction = distillateFraction;
          const { outputs, result } = operate(column, [inlet]);

          for (const outlet of outputs) {
            expect(fractionA ? outlet.b : outlet.a).toBe(0);
            expect(outlet.temperature).toBe(inlet.temperature);
            expect(outlet.pressure).toBe(inlet.pressure);
          }
          expect(flow(outputs[0])).toBeCloseTo(10 * distillateFraction, 12);
          expect(flow(outputs[1])).toBeCloseTo(
            10 * (1 - distillateFraction),
            12,
          );
          expect(outputs[0].a + outputs[1].a).toBeCloseTo(inlet.a, 12);
          expect(outputs[0].b + outputs[1].b).toBeCloseTo(inlet.b, 12);
          expect(
            enthalpy(outputs[0]) + enthalpy(outputs[1]) - enthalpy(inlet),
          ).toBeCloseTo(result.duty, 8);
        }
      }
    },
  );
});

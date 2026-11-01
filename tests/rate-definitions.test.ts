import { describe, expect, it } from "vitest";
import {
  compileRateLaw,
  defaultRateLaw,
  rateFormula,
  rateLawIssues,
  rateParameterValues,
  reactionRateLaw,
  renameRateSymbol,
} from "../src/domain/reactions/rateLaw";
import {
  rateExpressionLatex,
  rateExpressionSymbols,
} from "../src/domain/reactions/rateExpression";
import {
  defaultPackedBed,
  reactionSchema,
} from "../src/domain/reactions/schema";
import { solvePackedBed } from "../src/domain/reactions/packed-bed";
import { sampleChemicals } from "../src/domain/thermo/catalog";

const chemicals = sampleChemicals.slice(0, 2);
const state = {
  flows: { A: 5, B: 2 },
  volumetricFlow: 1,
  temperature: 500,
  pressure: 101325,
};

describe("editable reaction definitions", () => {
  it("evaluates only the constants used by the active expression", () => {
    const law = defaultRateLaw("A", true, 0.2);
    law.parameters[1] = {
      symbol: "kr",
      value: 1,
      activationEnergy: 1e8,
      referenceTemperature: 450,
    };
    expect(compileRateLaw(law, chemicals, true)(state)).toBe(1);
  });
  it("uses the same temperature-adjusted law in previews and bed integration", () => {
    const config = defaultPackedBed(["A", "B"]);
    config.flowModel = "constant-flow";
    config.volumetricFlow = 1;
    config.catalystMass = 0.1;
    const reaction = reactionSchema.parse({
      id: "reaction-1",
      name: "Temperature-dependent conversion",
      basisComponentId: "A",
      stoichiometry: [
        { componentId: "A", coefficient: -1 },
        { componentId: "B", coefficient: 1 },
      ],
      rateConstant: 0.1,
      activationEnergy: 40000,
    });
    config.reactions = [reaction];
    const law = reactionRateLaw(reaction);
    const k = 0.1 * Math.exp((-40000 / 8.31446261815324) * (1 / 500 - 1 / 450));
    expect(rateParameterValues(law, 500).kf).toBeCloseTo(k, 12);
    expect(compileRateLaw(law, chemicals, true)(state)).toBeCloseTo(k * 5, 12);
    expect(
      solvePackedBed(config, chemicals, { A: 5, B: 0 }, 500, 101325).flows.A,
    ).toBeCloseTo(5 * Math.exp(-k * 0.1), 8);
  });

  it("renames species and adsorption constants in both table and custom drafts without changing the rate", () => {
    const law = defaultRateLaw("A", true, 0.2);
    law.variables.push({ ...law.variables[0], symbol: "b", componentId: "B" });
    law.reversible = true;
    law.reverse = [{ variable: "b", order: 2 }];
    law.parameters[1].value = 0.05;
    law.parameters.push({ symbol: "K1", value: 0.3 });
    law.adsorption = [{ parameter: "K1", variable: "a", order: 1 }];
    law.denominatorPower = 2;
    law.expression = "(kf*a-kr*b^2)/(1+K1*a)^2";
    const renamed = renameRateSymbol(
      renameRateSymbol(law, "a", "methanol"),
      "K1",
      "Kads",
    );
    const expected = (0.2 * 5 - 0.05 * 2 ** 2) / (1 + 0.3 * 5) ** 2;
    expect(renamed.expression).toBe("(kf*methanol-kr*b^2)/(1+Kads*methanol)^2");
    expect(compileRateLaw(renamed, chemicals, true)(state)).toBeCloseTo(
      expected,
      12,
    );
    expect(
      compileRateLaw({ ...renamed, mode: "custom" }, chemicals, true)(state),
    ).toBeCloseTo(expected, 12);
    expect(
      rateExpressionLatex(
        rateFormula(renamed),
        [...renamed.variables, ...renamed.parameters].map((p) => p.symbol),
      ),
    ).toContain("\\frac{");
    expect(law.variables[0].symbol).toBe("a");
    expect(law.adsorption[0].parameter).toBe("K1");
  });

  it("preserves scientific notation and similar identifiers when renaming", () => {
    expect([...rateExpressionSymbols("kf*a+1e-3+2.e4")]).toEqual(["kf", "a"]);
    const law = defaultRateLaw("A", true);
    law.variables[0].symbol = "e";
    law.forward[0].variable = "e";
    law.expression = "kf*e + 1e-3 + e1 + exp(-e)";
    expect(renameRateSymbol(law, "e", "substrate").expression).toBe(
      "kf*substrate + 1e-3 + e1 + exp(-substrate)",
    );
  });

  it("rejects collisions and reserved symbols before modifying a definition", () => {
    const law = defaultRateLaw("A", true);
    for (const name of ["T", "P", "R", "exp", "kf", "bad name", "1a"])
      expect(() => renameRateSymbol(law, "a", name)).toThrow();
    expect(() => renameRateSymbol(law, "kf", "customK")).toThrow(
      /table builder/,
    );
    expect(rateLawIssues(law, ["A", "B"], true)).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { reactorExample, distillationExample } from "../src/domain/examples";
import {
  operate,
  simulate,
  rate,
  MODEL,
  enthalpy,
  volume,
} from "../src/domain/solver";
import {
  newUnit,
  projectSchema,
  validateGraph,
  type Project,
} from "../src/domain/schema";
describe("deterministic engineering slice", () => {
  it("matches the analytic recycle solution and conserves mass and energy", () => {
    const r = simulate(reactorExample());
    const x = 1 - Math.exp(-1);
    expect(r.converged).toBe(true);
    expect(r.conversion).toBeCloseTo(x / (1 - 0.5 * (1 - x)), 8);
    expect(Math.abs(r.massResidual)).toBeLessThan(1e-8);
    expect(Math.abs(r.energyResidual)).toBeLessThan(1e-3);
  });
  it("reports actual non-convergence", () => {
    const r = simulate(reactorExample(), { maxIterations: 1 });
    expect(r.converged).toBe(false);
    expect(r.residual).toBeGreaterThan(0);
  });
  it("temperature raises Arrhenius conversion", () => {
    const p = reactorExample();
    const a = simulate(p);
    p.units.find((n) => n.kind === "PBR")!.params.temperature = 500;
    expect(simulate(p).conversion).toBeGreaterThan(a.conversion);
    expect(rate(450)).toBeCloseTo(0.1);
  });
  it("conserves both species in ideal separation and satisfies equilibrium", () => {
    const r = simulate(distillationExample());
    const top = r.streams.distillate,
      bottom = r.streams.bottoms;
    const y = top.a / (top.a + top.b),
      x = bottom.a / (bottom.a + bottom.b);
    expect(y).toBeCloseTo((3 * x) / (1 + 2 * x), 10);
    expect(top.a + bottom.a).toBeCloseTo(5, 10);
    expect(top.b + bottom.b).toBeCloseTo(5, 10);
    expect(Math.abs(r.energyResidual)).toBeLessThan(1e-8);
  });
  it("mixes multiple physical feeds by enthalpy", () => {
    const n = newUnit("Mixer", "m", 0, 0);
    const r = operate(n, [
      { a: 2, b: 0, temperature: 300, pressure: 2e5 },
      { a: 0, b: 1, temperature: 600, pressure: 1e5 },
    ]);
    expect(r.outputs[0]).toEqual({
      a: 2,
      b: 1,
      temperature: 400,
      pressure: 1e5,
    });
  });
  it("conserves four feeds sharing mixer inlet branches and survives serialization", () => {
    const feeds = [300, 400, 500, 600].map((temperature, index) => {
      const feed = newUnit("Feed", `F-${index}`, 0, index * 180);
      feed.params.temperature = temperature;
      feed.params.flow = index + 1;
      feed.params.fractionA = index % 2;
      feed.params.pressure = 200000 - index * 10000;
      return feed;
    });
    const project: Project = {
      version: 1,
      name: "Four-feed mixer",
      units: [
        ...feeds,
        newUnit("Mixer", "M", 300, 200),
        newUnit("Product", "P", 600, 200),
      ],
      edges: [
        ...feeds.map((feed, index) => ({
          id: `feed-${index}`,
          source: feed.id,
          target: "M",
          sourcePort: "out" as const,
          targetPort: index % 2 ? ("in2" as const) : ("in" as const),
          color: "teal" as const,
        })),
        {
          id: "product",
          source: "M",
          target: "P",
          sourcePort: "out",
          targetPort: "in",
          color: "teal",
        },
      ],
    };
    const restored = projectSchema.parse(JSON.parse(JSON.stringify(project)));
    expect(validateGraph(restored, true)).toEqual([]);
    const result = simulate(restored);
    expect(result.converged).toBe(true);
    expect(result.streams.product).toEqual({
      a: 6,
      b: 4,
      temperature: 500,
      pressure: 170000,
    });
    expect(Math.abs(result.massResidual)).toBeLessThan(1e-10);
    expect(Math.abs(result.energyResidual)).toBeLessThan(1e-8);

    // Either inlet branch can be the only remaining branch after deletion.
    restored.edges.slice(0, 4).forEach((edge) => (edge.targetPort = "in2"));
    expect(validateGraph(restored, true)).toEqual([]);
    expect(simulate(restored).streams.product).toEqual(result.streams.product);

    restored.edges.push({ ...restored.edges[0], id: "duplicate-source" });
    expect(validateGraph(restored)).toContain(
      "Each port accepts one stream; use a mixer or splitter.",
    );
  });
  it("allows additional mixer feeds alongside an existing recycle", () => {
    const project = reactorExample();
    const feed = newUnit("Feed", "extra-feed", 0, 300);
    feed.params.flow = 3;
    project.units.push(feed);
    project.edges.push({
      id: "extra-stream",
      source: feed.id,
      sourcePort: "out",
      target: "M-101",
      targetPort: "in",
      color: "teal",
    });
    const result = simulate(project);
    expect(result.converged).toBe(true);
    expect(result.tearId).toBeDefined();
    expect(Math.abs(result.massResidual)).toBeLessThan(1e-8);
    expect(Math.abs(result.energyResidual)).toBeLessThan(1e-3);
  });
  it("accounts for isothermal reaction heat and ideal gas units", () => {
    const r = operate(newUnit("PBR", "r", 0, 0), [
      { a: 1, b: 0, temperature: 450, pressure: 101325 },
    ]);
    expect(r.result.duty).toBeCloseTo(
      r.result.extent * MODEL.reactionEnthalpy,
      8,
    );
    expect(volume({ a: 1, b: 0, temperature: 300, pressure: 1e5 })).toBeCloseTo(
      0.024943387854,
    );
  });
  it("heater/cooler duty has correct sign", () => {
    const inlet = { a: 2, b: 3, temperature: 400, pressure: 101325 };
    for (const kind of ["Heater", "Cooler"] as const) {
      const n = newUnit(kind, kind, 0, 0);
      const r = operate(n, [inlet]);
      expect(r.result.duty).toBeCloseTo(
        enthalpy(r.outputs[0]) - enthalpy(inlet),
      );
      expect(Math.sign(r.result.duty)).toBe(kind === "Heater" ? 1 : -1);
    }
  });
  it("rejects invalid parameters, occupied ports and dangling streams", () => {
    const p = reactorExample();
    p.units[0].params.flow = -1;
    expect(() => projectSchema.parse(p)).toThrow();
    p.units[0].params.flow = 10;
    p.edges.push({ ...p.edges[0], id: "duplicate" });
    expect(validateGraph(p).length).toBeGreaterThan(0);
    p.edges[0].target = "absent";
    expect(() => simulate(p)).toThrow(/missing/);
  });
  it("rejects disconnected and unsupported cyclic graphs", () => {
    const p = reactorExample();
    p.edges.pop();
    expect(() => simulate(p)).toThrow(/connect/);
    const q = reactorExample();
    q.edges.find((e) => e.id === "recycle")!.target = "H-101";
    expect(() => simulate(q)).toThrow();
  });
});

describe("bounded model edge cases", () => {
  it("conserves balances across temperature and recycle ranges", () => {
    for (const temperature of [300, 450, 600])
      for (const recycleFraction of [0, 0.5, 0.95]) {
        const p = reactorExample();
        p.units.find((n) => n.kind === "Heater")!.params.temperature =
          temperature;
        p.units.find((n) => n.kind === "PBR")!.params.temperature = temperature;
        p.units.find((n) => n.kind === "Splitter")!.params.recycleFraction =
          recycleFraction;
        const r = simulate(p);
        expect(r.converged).toBe(true);
        expect(Math.abs(r.massResidual)).toBeLessThan(1e-7);
        expect(Math.abs(r.energyResidual)).toBeLessThan(0.1);
        expect(r.conversion).toBeGreaterThanOrEqual(0);
        expect(r.conversion).toBeLessThanOrEqual(1);
      }
  });
  it("handles pure-component separation without negative flows", () => {
    for (const fractionA of [0, 1]) {
      const p = distillationExample();
      p.units[0].params.fractionA = fractionA;
      const r = simulate(p);
      for (const s of Object.values(r.streams)) {
        expect(s.a).toBeGreaterThanOrEqual(0);
        expect(s.b).toBeGreaterThanOrEqual(0);
      }
      expect(Math.abs(r.massResidual)).toBeLessThan(1e-10);
    }
  });
  it("supports two feeds through distinct mixer ports", () => {
    const p = reactorExample();
    p.edges = p.edges.filter((e) => e.id !== "recycle");
    p.units = p.units.filter((n) => n.kind !== "Splitter");
    p.edges = p.edges.filter(
      (e) => e.source !== "S-101" && e.target !== "S-101",
    );
    const feed = newUnit("Feed", "F-102", 0, 300);
    feed.params.flow = 5;
    feed.params.fractionA = 0;
    p.units.push(feed);
    p.edges.push(
      {
        id: "feed2",
        source: "F-102",
        target: "M-101",
        sourcePort: "out",
        targetPort: "in2",
        color: "blue",
      },
      {
        id: "product",
        source: "R-101",
        target: "P-101",
        sourcePort: "out",
        targetPort: "in",
        color: "teal",
      },
    );
    const r = simulate(p);
    expect(r.converged).toBe(true);
    expect(r.streams.product.a + r.streams.product.b).toBeCloseTo(15, 10);
    expect(Math.abs(r.energyResidual)).toBeLessThan(1e-8);
  });
  it("rejects reserved identifiers and nonfinite imported data", () => {
    const p = reactorExample();
    p.units[0].id = "__proto__";
    expect(() => projectSchema.parse(p)).toThrow();
    p.units[0].id = "feed";
    p.units[0].params.temperature = Infinity;
    expect(() => projectSchema.parse(p)).toThrow();
  });
});

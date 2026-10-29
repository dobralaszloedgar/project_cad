import { describe, expect, it } from "vitest";
import { applyActions } from "../src/domain/actions";
import {
  newUnit,
  paramsSchema,
  projectSchema,
  validateGraph,
  type Project,
} from "../src/domain/schema";

function reactorFeeds(secondFeed = false): Project {
  return projectSchema.parse({
    version: 1,
    name: "Reactor feed validation",
    units: [
      newUnit("Feed", "F1", 0, 0),
      ...(secondFeed ? [newUnit("Feed", "F2", 0, 180)] : []),
      newUnit("PBR", "R1", 200, 0),
      newUnit("Product", "P1", 400, 0),
    ],
    edges: [
      {
        id: "feed",
        source: "F1",
        sourcePort: "out",
        target: "R1",
        targetPort: "in",
      },
      ...(secondFeed
        ? [
            {
              id: "feed2",
              source: "F2",
              sourcePort: "out",
              target: "R1",
              targetPort: "in2",
            },
          ]
        : []),
      {
        id: "product",
        source: "R1",
        sourcePort: "out",
        target: "P1",
        targetPort: "in",
      },
    ],
  });
}

describe("equipment setup contracts", () => {
  it("preserves the meaning of saved projects created before mode selectors", () => {
    const project = reactorFeeds();
    const legacy = JSON.parse(JSON.stringify(project));
    const reactor = legacy.units.find(
      (unit: { id: string }) => unit.id === "R1",
    );
    delete reactor.params.reactorMode;
    delete reactor.params.catalystMass;
    delete reactor.params.catalystRateConstant;
    delete reactor.params.thermalMode;
    delete reactor.params.heatDuty;
    reactor.params.residenceTime = 24;

    const parsed = projectSchema
      .parse(legacy)
      .units.find((unit) => unit.id === "R1")!;
    expect(parsed.params.reactorMode).toBe("residence-time");
    expect(parsed.params.residenceTime).toBe(24);
    expect(parsed.params.thermalMode).toBe("temperature");
    expect(newUnit("PBR", "new", 0, 0).params.reactorMode).toBe(
      "catalyst-weight",
    );
  });

  it("applies typed mode changes without resetting other operating conditions", () => {
    const project = reactorFeeds();
    const changed = applyActions(project, {
      summary: "Set catalyst mass",
      actions: [
        {
          type: "update",
          id: "R1",
          params: {
            reactorMode: "catalyst-weight",
            catalystMass: 23,
            catalystRateConstant: 0.02,
          },
        },
      ],
    });
    const next = applyActions(changed, {
      summary: "Adjust temperature",
      actions: [{ type: "update", id: "R1", params: { temperature: 500 } }],
    });
    const reactor = next.units.find((unit) => unit.id === "R1")!;
    expect(reactor.params).toMatchObject({
      temperature: 500,
      reactorMode: "catalyst-weight",
      catalystMass: 23,
      catalystRateConstant: 0.02,
    });
    expect(
      project.units.find((unit) => unit.id === "R1")!.params.catalystMass,
    ).toBe(10);

    const heater = newUnit("Heater", "H1", 0, 0);
    const thermal = applyActions(
      { version: 1, name: "Thermal", units: [heater], edges: [] },
      {
        summary: "Specify duty",
        actions: [
          {
            type: "update",
            id: "H1",
            params: { thermalMode: "duty", heatDuty: 15000 },
          },
        ],
      },
    );
    expect(thermal.units[0].params.heatDuty).toBe(15000);
    expect(thermal.units[0].params.temperature).toBe(heater.params.temperature);
  });

  it("accepts one reactor feed and rejects side streams and occupied inlets", () => {
    expect(validateGraph(reactorFeeds(), true)).toEqual([]);
    const project = reactorFeeds(true);
    expect(validateGraph(project, true).join(" ")).toMatch(/incompatible/);
    project.edges.find((edge) => edge.id === "feed2")!.targetPort = "in";
    expect(validateGraph(project, true).join(" ")).toMatch(/one stream/);
  });

  it("requires the primary reactor inlet and rejects a second heater inlet", () => {
    const project = reactorFeeds();
    project.edges[0].targetPort = "in2";
    expect(validateGraph(project, true).join(" ")).toMatch(/connect in/);
    project.units.find((unit) => unit.id === "R1")!.kind = "Heater";
    expect(validateGraph(project).join(" ")).toMatch(/incompatible/);
  });

  it("rejects out-of-range catalyst data and unknown calculation modes", () => {
    for (const params of [
      { catalystMass: -1 },
      { catalystMass: 10001 },
      { catalystRateConstant: 0 },
      { catalystRateConstant: Infinity },
      { heatDuty: 1e9 },
      { thermalMode: "both" },
      { reactorMode: "industrial" },
    ])
      expect(paramsSchema.safeParse(params).success).toBe(false);
    expect(paramsSchema.parse({ catalystMass: 0 }).catalystMass).toBe(0);
  });
});

import { newUnit, projectSchema } from "../../src/domain/schema";
import {
  packedBedSchema,
  reactionSchema,
} from "../../src/domain/reactions/schema";
import { settingsFor } from "./catalog";

// A user-defined, illustrative kinetic law for a balanced net stoichiometry.
// The property records are reference data; these kinetics are not a chemical fit.
export function reactionProject() {
  const thermo = settingsFor(["67-56-1", "64-17-5", "7732-18-5", "7727-37-9"]);
  const feed = newUnit("Feed", "F-101", 0, 100);
  feed.params.temperature = 450;
  feed.params.flow = 10;
  feed.params.composition = {
    "67-56-1": 0.6,
    "64-17-5": 0,
    "7732-18-5": 0,
    "7727-37-9": 0.4,
  };
  const reactor = newUnit("PBR", "R-101", 220, 100);
  reactor.params.packedBed = packedBedSchema.parse({
    conversionComponentId: "67-56-1",
    flowModel: "constant-flow",
    volumetricFlow: 1,
    catalystMass: 10,
    reactions: [
      reactionSchema.parse({
        id: "r1",
        name: "Illustrative coupling",
        basisComponentId: "67-56-1",
        rateConstant: 0.1,
        stoichiometry: [
          { componentId: "67-56-1", coefficient: -2 },
          { componentId: "64-17-5", coefficient: 1 },
          { componentId: "7732-18-5", coefficient: 1 },
        ],
      }),
    ],
  });
  return projectSchema.parse({
    version: 1,
    name: "Multicomponent reaction",
    thermo,
    units: [feed, reactor, newUnit("Product", "P-101", 440, 100)],
    edges: [
      {
        id: "feed",
        source: feed.id,
        target: reactor.id,
        sourcePort: "out",
        targetPort: "in",
      },
      {
        id: "product",
        source: reactor.id,
        target: "P-101",
        sourcePort: "out",
        targetPort: "in",
      },
    ],
  });
}

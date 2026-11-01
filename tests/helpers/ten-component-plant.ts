import { newUnit, type Project } from "../../src/domain/schema";
import { referenceChemicals, settingsFor } from "./catalog";

/** Ten pure streams and one equal-mole mixture use the same component list. */
export function tenComponentPlant(): Project {
  const chemicals = referenceChemicals.slice(0, 10);
  const feeds = chemicals.map(({ id, name }, index) => {
    const feed = newUnit("Feed", `F-${index + 1}`, 0, index * 180);
    feed.name = name;
    feed.params.composition = { [id]: 1 };
    return feed;
  });
  const mixed = newUnit("Feed", "F-mixed", 0, 1800);
  mixed.name = "Equal mixture";
  mixed.params.composition = Object.fromEntries(
    chemicals.map(({ id }) => [id, 0.1]),
  );
  feeds.push(mixed);
  return {
    version: 1,
    name: "Ten chemical colors",
    thermo: settingsFor(chemicals.map(({ id }) => id)),
    units: [
      ...feeds,
      ...feeds.map(({ id }, index) =>
        newUnit("Product", id.replace("F-", "P-"), 400, index * 180),
      ),
    ],
    edges: feeds.map(({ id }) => ({
      id: id === "F-mixed" ? "mixed" : `feed-${id}`,
      source: id,
      target: id.replace("F-", "P-"),
      sourcePort: "out",
      targetPort: "in",
      color: "teal",
    })),
  };
}

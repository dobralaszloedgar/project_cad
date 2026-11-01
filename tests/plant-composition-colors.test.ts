import { describe, expect, it } from "vitest";
import {
  Color,
  Mesh,
  SRGBColorSpace,
  type MeshPhysicalMaterial,
  type Object3D,
} from "three";
import {
  distillationExample,
  heatingExample,
  mixingExample,
  reactorExample,
  solutionExample,
  thermalCycleExample,
} from "../src/domain/examples";
import { newUnit, type Project } from "../src/domain/schema";
import { simulate } from "../src/domain/solver";
import {
  blendColors,
  componentPalette,
  compositionColor,
  projectCompositionColors,
  UNKNOWN_COMPOSITION_COLOR,
} from "../src/components/equipment-3d/composition-colors";
import {
  createProcessContents,
  createSystemFlow,
} from "../src/components/equipment-3d/process-contents";
import { buildProjectPlant } from "../src/components/equipment-3d/project-plant";
import { disposeEquipmentModel } from "../src/components/equipment-3d/models";
import { OperationClock } from "../src/components/equipment-3d/operation";
import { settingsFor } from "./helpers/catalog";
import { tenComponentPlant } from "./helpers/ten-component-plant";
import {
  FLUID_PALETTES,
  fluidPaletteColors,
} from "../src/components/equipment-3d/fluid-palettes";

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const distance = (a: string, b: string) =>
  Math.hypot(...rgb(a).map((value, i) => value - rgb(b)[i]));
const materialColor = (object: Object3D | undefined) => {
  expect(object).toBeInstanceOf(Mesh);
  return `#${((object as Mesh).material as MeshPhysicalMaterial).color.getHexString()}`;
};

describe("composition colors in the 3D plant", () => {
  it("blends by mole ratios, including purple for equal red and blue", () => {
    const colors = [
      { id: "A", name: "A", color: "#ff0000" },
      { id: "B", name: "B", color: "#0000ff" },
    ];
    expect(compositionColor({ A: 1, B: 1 }, colors)).toBe("#800080");
    expect(compositionColor({ A: 3, B: 1 }, colors)).toBe("#bf0040");
    expect(compositionColor({ A: 300, B: 100 }, colors)).toBe("#bf0040");
    expect(compositionColor({ A: 1 }, colors)).toBe("#ff0000");
    expect(compositionColor({ B: 1 }, colors)).toBe("#0000ff");
    expect(
      blendColors([
        { color: "#ff0000", amount: 1 },
        { color: "#00ff00", amount: 2 },
        { color: "#0000ff", amount: 1 },
      ]),
    ).toBe("#408040");
  });

  it("makes separation colors approach the component colors only as purity increases", () => {
    const project = distillationExample();
    const first = projectCompositionColors(project);
    const [componentA, componentB] = first.components.map((c) => c.color);
    const feed = first.streams.s1;
    expect(feed).toBe(compositionColor({ A: 1, B: 1 }, first.components));
    expect(distance(first.streams.distillate, componentA)).toBeLessThan(
      distance(feed, componentA),
    );
    expect(distance(first.streams.bottoms, componentB)).toBeLessThan(
      distance(feed, componentB),
    );
    project.units[1].params.relativeVolatility = 20;
    const purer = projectCompositionColors(project);
    expect(purer.streams.s1).toBe(feed);
    expect(distance(purer.streams.distillate, componentA)).toBeLessThan(
      distance(first.streams.distillate, componentA),
    );
    expect(distance(purer.streams.bottoms, componentB)).toBeLessThan(
      distance(first.streams.bottoms, componentB),
    );
    expect(purer.streams.distillate).not.toBe(componentA);
    expect(purer.streams.bottoms).not.toBe(componentB);
    expect(projectCompositionColors(project, simulate(project))).toEqual(purer);
  });

  it("uses the actual thermodynamic flash compositions for real chemicals", () => {
    const project = solutionExample();
    const result = simulate(project);
    const colors = projectCompositionColors(project, result);
    expect(colors.components.map((c) => c.name)).toEqual([
      "Benzene",
      "Toluene",
    ]);
    for (const [id, stream] of Object.entries(result.streams)) {
      const fraction = stream.a / (stream.a + stream.b);
      const actual = rgb(colors.streams[id]);
      const first = rgb(colors.components[0].color),
        second = rgb(colors.components[1].color);
      actual.forEach((channel, i) =>
        expect(channel).toBeCloseTo(
          Math.round(first[i] * fraction + second[i] * (1 - fraction)),
          0,
        ),
      );
    }
  });

  it("mixes unequal feed flows and preserves composition through splitting and heating", () => {
    const project = mixingExample();
    const colors = projectCompositionColors(project);
    const { streams, equipment } = colors;
    expect(distance(streams.mixed, streams["feed-a"])).toBeLessThan(
      distance(streams.mixed, streams["feed-b"]),
    );
    expect(streams.mixed).toBe(streams.primary);
    expect(streams.mixed).toBe(streams.secondary);
    expect(equipment["M-501"]).toEqual({
      color: streams.mixed,
      ports: {
        in: streams["feed-a"],
        in2: streams["feed-b"],
        out: streams.mixed,
      },
    });
    project.edges.find((edge) => edge.id === "feed-b")!.targetPort = "in";
    expect(projectCompositionColors(project).equipment["M-501"].ports.in).toBe(
      streams.mixed,
    );
    const thermal = projectCompositionColors(thermalCycleExample());
    expect(new Set(Object.values(thermal.streams)).size).toBe(1);
    const reactor = projectCompositionColors(reactorExample());
    expect(reactor.streams.s3).not.toBe(reactor.streams.s4);
    expect(reactor.streams.s4).toBe(reactor.streams.recycle);
  });

  it("updates composition without rerouting, changing component assignments, or mutating the project", () => {
    const project = distillationExample();
    const saved = structuredClone(project);
    const layout = buildProjectPlant(project);
    const first = projectCompositionColors(project);
    expect(project).toEqual(saved);
    project.units[0].position.x += 20;
    expect(projectCompositionColors(project)).toBe(first);
    project.units[0].params.fractionA = 0.9;
    const updated = projectCompositionColors(project);
    expect(updated.components).toEqual(first.components);
    expect(updated.streams.s1).not.toBe(first.streams.s1);
    expect(updated.streams.distillate).not.toBe(first.streams.distillate);
    expect(buildProjectPlant(project)).toBe(layout);
    project.edges[0].colorIndex = 2;
    expect(projectCompositionColors(project)).toBe(updated);
  });

  it("uses keyed multicomponent flows and keeps identities stable when catalog order changes", () => {
    const ids = ["71-43-2", "108-88-3", "110-54-3"];
    const project: Project = {
      version: 1,
      name: "Three components",
      thermo: settingsFor(ids),
      units: [newUnit("Feed", "F", 0, 0), newUnit("Product", "P", 250, 0)],
      edges: [
        {
          id: "s",
          source: "F",
          target: "P",
          sourcePort: "out",
          targetPort: "in",
          color: "teal",
        },
      ],
    };
    project.units[0].params.composition = {
      "71-43-2": 0.2,
      "108-88-3": 0.3,
      "110-54-3": 0.5,
    };
    const first = projectCompositionColors(project);
    expect(new Set(first.components.map((c) => c.color)).size).toBe(3);
    expect(first.streams.s).toBe(
      compositionColor(project.units[0].params.composition, first.components),
    );
    project.thermo = settingsFor([...ids].reverse());
    const reordered = projectCompositionColors(project);
    expect(reordered.streams).toEqual(first.streams);
    for (const component of first.components)
      expect(reordered.components.find((c) => c.id === component.id)).toEqual(
        component,
      );
    project.units[0].params.composition = { "110-54-3": 1 };
    expect(projectCompositionColors(project).streams.s).toBe(
      first.components.find((c) => c.id === "110-54-3")!.color,
    );
  });

  it("shows unknown, invalid and zero-flow compositions as neutral instead of pure", () => {
    const project = distillationExample();
    const palette = componentPalette(project);
    const invalid: (Record<string, number> | undefined)[] = [
      undefined,
      {},
      { A: 0, B: 0 },
      { A: NaN },
      { A: Infinity },
      { A: -1, B: 2 },
      { removed: 1 },
    ];
    for (const values of invalid)
      expect(compositionColor(values, palette)).toBe(UNKNOWN_COMPOSITION_COLOR);
    const result = simulate(project);
    result.streams.distillate = { ...result.streams.distillate, a: 0, b: 0 };
    expect(projectCompositionColors(project, result).streams.distillate).toBe(
      UNKNOWN_COMPOSITION_COLOR,
    );
    result.converged = false;
    const failed = projectCompositionColors(project, result);
    expect(failed.streams.distillate).toBe(UNKNOWN_COMPOSITION_COLOR);
    expect(failed.streams.bottoms).toBe(UNKNOWN_COMPOSITION_COLOR);
    expect(failed.streams.s1).not.toBe(UNKNOWN_COMPOSITION_COLOR);
    project.units.push(newUnit("Cooler", "unfinished", 0, 300));
    expect(projectCompositionColors(project).streams.distillate).toBe(
      UNKNOWN_COMPOSITION_COLOR,
    );
    const heating = heatingExample();
    heating.units.push(newUnit("Cooler", "unfinished", 0, 300));
    const known = projectCompositionColors(heating).streams;
    expect(known.s1).not.toBe(UNKNOWN_COMPOSITION_COLOR);
    expect(known.s2).toBe(known.s1);
  });

  it.each(FLUID_PALETTES)(
    "renders ten distinct chemicals and their mixture with $name",
    ({ id }) => {
      const project = tenComponentPlant();
      const saved = structuredClone(project);
      const result = simulate(project);
      expect(result.converged).toBe(true);
      const colors = projectCompositionColors(project, result, id);
      expect(new Set(colors.components.map((c) => c.color)).size).toBe(10);
      colors.components.forEach(({ color }, index) => {
        expect(colors.streams[`feed-F-${index + 1}`]).toBe(color);
        expect(colors.equipment[`F-${index + 1}`].color).toBe(color);
      });
      const mixture = blendColors(
        colors.components.map(({ color }) => ({ color, amount: 1 })),
      );
      expect(colors.streams.mixed).toBe(mixture);
      expect(colors.equipment["P-mixed"].color).toBe(mixture);
      const pipes = createSystemFlow(
        buildProjectPlant(project),
        new OperationClock(),
        colors.streams,
      );
      try {
        for (const [streamId, color] of Object.entries(colors.streams))
          expect(
            materialColor(pipes.getObjectByName(`stream-${streamId}`)),
          ).toBe(color);
      } finally {
        disposeEquipmentModel(pipes);
      }
      project.thermo = settingsFor(
        project.thermo!.catalog!.chemicals.map((c) => c.id).reverse(),
      );
      expect(projectCompositionColors(project, result, id).streams).toEqual(
        colors.streams,
      );
      project.thermo = saved.thermo;
      expect(project).toEqual(saved);
    },
  );

  it.each(FLUID_PALETTES)(
    "extends $name to 40 unique shades without size-dependent reassignment",
    ({ id }) => {
      const full = fluidPaletteColors(id, 40);
      expect(full).toHaveLength(40);
      expect(new Set(full).size).toBe(40);
      expect(fluidPaletteColors(id, 10)).toEqual(full.slice(0, 10));
      expect(fluidPaletteColors(id, 24)).toEqual(full.slice(0, 24));
      for (const color of full) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/);
        if (id !== "red-blue") {
          const { h } = new Color(color).getHSL(
            { h: 0, s: 0, l: 0 },
            SRGBColorSpace,
          );
          const degrees = h * 360;
          expect(degrees >= 20 && degrees <= 345).toBe(true);
          expect(degrees < 190 || degrees > 260).toBe(true);
        }
      }
    },
  );

  it("changes palettes without changing layout or treating unknown compositions as known", () => {
    const project = distillationExample();
    const saved = structuredClone(project);
    const layout = buildProjectPlant(project);
    const first = projectCompositionColors(project);
    const next = projectCompositionColors(project, null, "iris-apricot");
    expect(next.streams.s1).not.toBe(first.streams.s1);
    expect(next.components).not.toEqual(first.components);
    expect(projectCompositionColors(project, null, "missing-palette")).toEqual(
      first,
    );
    expect(buildProjectPlant(project)).toBe(layout);
    expect(project).toEqual(saved);
    const failed = simulate(project);
    failed.converged = false;
    expect(
      projectCompositionColors(project, failed, "iris-apricot").streams
        .distillate,
    ).toBe(UNKNOWN_COMPOSITION_COLOR);
  });

  it("renders the calculated colors in external pipes, column products and receiver liquid", () => {
    const project = distillationExample();
    const colors = projectCompositionColors(project);
    const system = buildProjectPlant(project);
    const clock = new OperationClock();
    const pipes = createSystemFlow(system, clock, colors.streams);
    const column = createProcessContents(
      "Distillation",
      true,
      clock,
      undefined,
      {},
      colors.equipment["D-201"],
    );
    const product = createProcessContents(
      "Product",
      true,
      clock,
      undefined,
      {},
      colors.equipment["P-201"],
    );
    try {
      for (const [id, color] of Object.entries(colors.streams))
        expect(materialColor(pipes.getObjectByName(`stream-${id}`))).toBe(
          color,
        );
      for (const branch of ["distillate", "reflux", "condensate", "inlet"])
        expect(
          materialColor(column.group.getObjectByName(`column-${branch}-flow`)),
        ).toBe(colors.streams.distillate);
      const cores = column.group.children.filter(
        (part) => part.name === "liquid-core",
      );
      expect(materialColor(cores[0])).toBe(colors.streams.s1);
      expect(materialColor(cores[1])).toBe(colors.streams.bottoms);
      expect(
        materialColor(product.group.getObjectByName("moving-liquid-surface")),
      ).toBe(colors.streams.distillate);
    } finally {
      for (const group of [pipes, column.group, product.group])
        disposeEquipmentModel(group);
    }
  });

  it.each(["Heater", "Cooler"] as const)(
    "keeps %s process liquid the same color when only temperature changes",
    (kind) => {
      const colors = projectCompositionColors(thermalCycleExample());
      const id = kind === "Heater" ? "H-401" : "C-401";
      const contents = createProcessContents(
        kind,
        true,
        new OperationClock(),
        undefined,
        {},
        colors.equipment[id],
      );
      try {
        for (const core of contents.group.children.filter(
          (part) => part.name === "liquid-core",
        )) {
          expect(materialColor(core)).toBe(colors.streams.feed);
          const material = (core as Mesh).material as MeshPhysicalMaterial;
          expect(`#${material.userData.liquid.endColor.getHexString()}`).toBe(
            colors.streams.feed,
          );
        }
      } finally {
        disposeEquipmentModel(contents.group);
      }
    },
  );
});

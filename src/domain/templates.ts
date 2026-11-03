// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import {
  aqueousFlashTemplate,
  aromaticFlashTemplate,
  aromaticColumnTemplate,
  aromaticRecoveryTemplate,
  hydraulicColumnTemplate,
  partialCondenserTemplate,
  vaporHeatingTemplate,
  vaporMixingTemplate,
  vaporThermalCycleTemplate,
} from "./real-chemical-templates";
import type { Project } from "./schema";
import { mixtureName } from "./thermo/catalog";
import { modelInfo } from "./thermo/registry";
import { unitThermoSettings } from "./thermo/flowsheet-models";
import {
  methanolSynthesisTemplate,
  methanolNetworkTemplate,
  waterGasShiftTemplate,
} from "./reaction-templates";
import { thermoContext } from "./thermo/catalog";
import {
  methanolRecycleTemplate,
  stagedShiftTemplate,
} from "./process-templates";
import { packedBedIssues } from "./reactions/validation";

export const templateSections = [
  { id: "plants", name: "Process plants" },
  { id: "reactors", name: "Reactors & kinetics" },
  { id: "columns", name: "Distillation & hydraulics" },
  { id: "separations", name: "Flash separations" },
  { id: "basics", name: "Heat & mixing" },
] as const;
export type TemplateSection = (typeof templateSections)[number]["id"];
export type Template = {
  id: string;
  name: string;
  description: string;
  section: TemplateSection;
  tag: string;
  create: () => Project;
};

/** Fully specified recipes, including editable kinetics and offline properties. */
export const templates: Template[] = [
  {
    id: "methanol-recycle-plant",
    name: "Methanol recycle plant",
    description:
      "Two reactor beds, three reaction pathways, gas recycle and two MESH towers.",
    section: "plants",
    tag: "36 trays · recycle · MESH",
    create: methanolRecycleTemplate,
  },
  {
    id: "fractionation",
    name: "Three-stage aromatic recovery",
    description:
      "Recover benzene through successive flashes, cooling and product collection.",
    section: "plants",
    tag: "Benzene / toluene",
    create: () => aromaticRecoveryTemplate("fractionation"),
  },
  {
    id: "fractionation-complex",
    name: "Four-stage recovery plant",
    description:
      "Blend two feeds and recover four cuts through a complete separation train.",
    section: "plants",
    tag: "Benzene / toluene",
    create: () => aromaticRecoveryTemplate("fractionation-complex"),
  },
  {
    id: "pbr-methanol-network",
    name: "Methanol reaction network",
    description: "CO and CO₂ hydrogenation with competing water–gas shift.",
    section: "reactors",
    tag: "3 rate laws · Graaf",
    create: methanolNetworkTemplate,
  },
  {
    id: "pbr-water-gas-shift",
    name: "Water–gas shift",
    description: "Turn CO and steam into hydrogen over a copper catalyst.",
    section: "reactors",
    tag: "Choi–Stenger kinetics",
    create: () => waterGasShiftTemplate(),
  },
  {
    id: "pbr-water-gas-shift-sizing",
    name: "Size a catalyst bed",
    description: "Find the catalyst mass for 90% CO conversion.",
    section: "reactors",
    tag: "Target conversion",
    create: () => waterGasShiftTemplate(true),
  },
  {
    id: "pbr-methanol-synthesis",
    name: "Methanol synthesis",
    description:
      "Follow methanol formation and the reversible water–gas shift side reaction.",
    section: "reactors",
    tag: "2 rate laws · Vanden Bussche–Froment",
    create: methanolSynthesisTemplate,
  },
  {
    id: "staged-hydrogen",
    name: "Two-stage hydrogen production",
    description: "Cool between catalyst beds to push CO conversion further.",
    section: "reactors",
    tag: "Interstage cooling",
    create: stagedShiftTemplate,
  },
  {
    id: "distillation-mesh",
    name: "Equilibrium-stage column",
    description: "Explore eight trays, reflux, condenser and reboiler duties.",
    section: "columns",
    tag: "MESH · benzene / toluene",
    create: () => aromaticColumnTemplate("mesh"),
  },
  {
    id: "distillation-fug",
    name: "Shortcut column design",
    description: "Estimate stages and reflux for 95% key recoveries.",
    section: "columns",
    tag: "Fenske–Underwood–Gilliland",
    create: () => aromaticColumnTemplate("fug"),
  },
  {
    id: "distillation-normal",
    name: "Column within operating limits",
    description: "A 1.2 m sieve-tray tower with a balanced vapor load.",
    section: "columns",
    tag: "MESH · normal hydraulics",
    create: () => hydraulicColumnTemplate("normal"),
  },
  {
    id: "distillation-flooding",
    name: "Flooding column",
    description: "An undersized 0.7 m tower exceeds its tray capacity.",
    section: "columns",
    tag: "MESH · flooding predicted",
    create: () => hydraulicColumnTemplate("flooding"),
  },
  {
    id: "distillation-weeping",
    name: "Weeping column",
    description: "An oversized 2 m tower has too little vapor support.",
    section: "columns",
    tag: "MESH · weeping predicted",
    create: () => hydraulicColumnTemplate("weeping"),
  },
  {
    id: "distillation-partial-condenser",
    name: "Partial condenser",
    description: "Take a vapor distillate while returning liquid reflux.",
    section: "columns",
    tag: "MESH · vapor overhead",
    create: partialCondenserTemplate,
  },
  {
    id: "solution",
    name: "Raoult’s law separation",
    description:
      "Split benzene–toluene into vapor and liquid in a single flash.",
    section: "separations",
    tag: "Ideal solution",
    create: aromaticFlashTemplate,
  },
  {
    id: "distillation",
    name: "Ethanol–water separation",
    description:
      "Explore nonideal vapor–liquid equilibrium in an alcohol–water flash.",
    section: "separations",
    tag: "Modified UNIFAC 2.0",
    create: aqueousFlashTemplate,
  },
  {
    id: "thermal-cycle",
    name: "Heating and cooling",
    description: "Add 30 kW, then cool the vapor back to 400 K.",
    section: "basics",
    tag: "Heat balance",
    create: vaporThermalCycleTemplate,
  },
  {
    id: "mixing",
    name: "Mixing and splitting",
    description: "Blend two vapor feeds and distribute the mixture 75/25.",
    section: "basics",
    tag: "Material balance",
    create: vaporMixingTemplate,
  },
  {
    id: "heating",
    name: "Simple heating",
    description: "Heat benzene–toluene vapor from 400 to 450 K.",
    section: "basics",
    tag: "Start here",
    create: vaporHeatingTemplate,
  },
];

export function loadTemplate(id: string): Project | undefined {
  return templates.find((template) => template.id === id)?.create();
}

export function templateSpecification(project: Project): string {
  const settings = project.thermo;
  if (!settings || settings.mixture === "demo")
    throw new Error(
      "Templates must specify real chemicals and thermodynamics.",
    );
  const parts = [
    mixtureName(settings),
    ...new Set(
      project.units.map(
        (unit) => modelInfo(unitThermoSettings(project, unit.id).modelId).label,
      ),
    ),
  ];
  const reactors = project.units.filter((unit) => unit.kind === "PBR");
  if (reactors.length) {
    const { catalog, ids } = thermoContext(settings);
    const chemicals = ids.map((id) => catalog.get(id));
    for (const reactor of reactors) {
      const bed = reactor.params.packedBed;
      if (
        settings.modelId !== "ideal-gas" ||
        !bed ||
        !bed.reactions.some((r) => r.enabled) ||
        bed.reactions.some((r) => !r.kineticsSource) ||
        packedBedIssues(bed, chemicals).length
      )
        throw new Error(
          "Reaction templates require valid real-chemical reactions and sourced kinetics.",
        );
    }
    parts.push("Isothermal PBR · published kinetics");
  }
  for (const method of new Set(
    project.units
      .filter((unit) => unit.kind === "Distillation")
      .map((unit) => unit.params.distillation?.method ?? "flash"),
  ))
    parts.push(
      method === "fug"
        ? "FUG shortcut design"
        : method === "mesh"
          ? "MESH equilibrium stages"
          : "Vapor–liquid TP flash",
    );
  return parts.join(" · ");
}

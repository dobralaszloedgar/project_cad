import {
  aqueousFlashTemplate,
  aromaticFlashTemplate,
  aromaticRecoveryTemplate,
  vaporHeatingTemplate,
  vaporMixingTemplate,
  vaporThermalCycleTemplate,
} from "./real-chemical-templates";
import type { Project } from "./schema";
import { mixtureName } from "./thermo/catalog";
import { modelInfo } from "./thermo/registry";

/** Only supported, fully specified real-chemical recipes are offered. */
export const templates = [
  {
    id: "thermal-cycle",
    name: "Heating and cooling",
    description:
      "Heat 10 mol/s of 50/50 benzene–toluene vapor with 30 kW, then cool back to 400 K at 101.325 kPa.",
    create: vaporThermalCycleTemplate,
  },
  {
    id: "mixing",
    name: "Mixing and splitting",
    description:
      "Mix 10 mol/s of benzene vapor at 400 K with 5 mol/s of toluene vapor at 450 K; split 75/25 at 101.325 kPa.",
    create: vaporMixingTemplate,
  },
  {
    id: "solution",
    name: "Raoult’s law separation",
    description: "Flash 10 mol/s of 50/50 benzene–toluene at 350 K and 55 kPa.",
    create: aromaticFlashTemplate,
  },
  {
    id: "heating",
    name: "Simple heating",
    description:
      "Heat 10 mol/s of 50/50 benzene–toluene vapor from 400 to 450 K at 101.325 kPa.",
    create: vaporHeatingTemplate,
  },
  {
    id: "distillation",
    name: "Ethanol–water separation",
    description:
      "Flash 10 mol/s of 50/50 ethanol–water at 350 K and 78 kPa using Modified UNIFAC 2.0.",
    create: aqueousFlashTemplate,
  },
  {
    id: "fractionation",
    name: "Three-stage benzene–toluene recovery",
    description:
      "Separate a benzene–toluene feed through three successive flashes at 344, 348 and 352 K; collect cooled cuts at 320 K and 55 kPa.",
    create: () => aromaticRecoveryTemplate("fractionation"),
  },
  {
    id: "fractionation-complex",
    name: "Four-stage benzene–toluene recovery",
    description:
      "Blend benzene–toluene feeds, flash at 344, 348, 352 and 355 K, and cool each cut to 320 K at 55 kPa.",
    create: () => aromaticRecoveryTemplate("fractionation-complex"),
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
  if (project.units.some((unit) => unit.kind === "PBR"))
    throw new Error("Real-chemical reaction templates are not implemented.");
  const parts = [mixtureName(settings), modelInfo(settings.modelId).label];
  if (project.units.some((unit) => unit.kind === "Distillation"))
    parts.push("Vapor–liquid TP flash");
  return parts.join(" · ");
}

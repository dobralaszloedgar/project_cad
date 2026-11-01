import {
  aqueousFlashTemplate,
  aromaticFlashTemplate,
  aromaticColumnTemplate,
  aromaticRecoveryTemplate,
  vaporHeatingTemplate,
  vaporMixingTemplate,
  vaporThermalCycleTemplate,
} from "./real-chemical-templates";
import type { Project } from "./schema";
import { mixtureName } from "./thermo/catalog";
import { modelInfo } from "./thermo/registry";
import {
  methanolSynthesisTemplate,
  waterGasShiftTemplate,
} from "./reaction-templates";
import { thermoContext } from "./thermo/catalog";
import { packedBedIssues } from "./reactions/validation";

/** Only supported, fully specified real-chemical recipes are offered. */
export const templates = [
  {
    id: "pbr-water-gas-shift",
    name: "PBR · Water–gas shift",
    description:
      "React CO and steam to produce hydrogen at 493.15 K and 1 atm over 0.1 kg of Cu/ZnO/Al₂O₃. Reversible Choi–Stenger kinetics; 0.01 mol/s feed.",
    create: () => waterGasShiftTemplate(),
  },
  {
    id: "pbr-water-gas-shift-sizing",
    name: "PBR · Catalyst sizing",
    description:
      "Calculate catalyst mass for 90% CO conversion using the same published water–gas shift kinetics, feed and operating conditions.",
    create: () => waterGasShiftTemplate(true),
  },
  {
    id: "pbr-methanol-synthesis",
    name: "PBR · Methanol synthesis",
    description:
      "Convert syngas to methanol with competing reverse water–gas shift at 493.2 K and 15 bar. Vanden Bussche–Froment kinetics; 0.0348 kg catalyst and 0.01 mol/s feed.",
    create: methanolSynthesisTemplate,
  },
  {
    id: "distillation-fug",
    name: "Distillation · FUG shortcut",
    description:
      "Estimate stages and reflux for 95% benzene and toluene key recoveries at 55 kPa, using supplied relative volatility 2.5.",
    create: () => aromaticColumnTemplate("fug"),
  },
  {
    id: "distillation-mesh",
    name: "Distillation · MESH column",
    description:
      "Solve eight equilibrium trays with feed on tray 4, reflux ratio 2.5 and 5 mol/s distillate at 55 kPa. Includes stage profiles and end duties.",
    create: () => aromaticColumnTemplate("mesh"),
  },
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
  const parts = [mixtureName(settings), modelInfo(settings.modelId).label];
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

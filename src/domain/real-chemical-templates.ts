import {
  heatingExample,
  mixingExample,
  solutionExample,
  thermalCycleExample,
} from "./examples";
import { plantTemplate } from "./plant-templates";
import type { Project } from "./schema";
import type { ModelId } from "./thermo/registry";
import { defaultDistillation } from "./equipment/distillation-schema";

/** Reuse connected layouts, with real property data and re-specified conditions.
 * Synthetic reaction benchmarks remain separate from the template catalog. */
function chemistry(
  project: Project,
  mixture: "aromatics" | "aqueous",
  modelId: ModelId,
): Project {
  if (project.units.some((unit) => unit.kind === "PBR"))
    throw new Error(
      "Reaction templates must specify their chemistry and kinetics explicitly.",
    );
  project.thermo = { modelId, mixture, extrapolate: false };
  return project;
}

export function vaporHeatingTemplate(): Project {
  const project = chemistry(heatingExample(), "aromatics", "ideal-gas");
  const feed = project.units[0];
  feed.name = "Benzene–toluene vapor feed";
  feed.params.temperature = 400;
  feed.params.fractionA = 0.5;
  project.units[1].params.temperature = 450;
  project.units[2].name = "Heated benzene–toluene vapor";
  return project;
}

export function vaporThermalCycleTemplate(): Project {
  const project = chemistry(thermalCycleExample(), "aromatics", "ideal-gas");
  project.units[0].name = "Benzene–toluene vapor feed";
  project.units[0].params.temperature = 400;
  project.units[0].params.fractionA = 0.5;
  project.units.find((unit) => unit.kind === "Cooler")!.params.temperature =
    400;
  project.units.at(-1)!.name = "Cooled benzene–toluene vapor";
  return project;
}

export function vaporMixingTemplate(): Project {
  const project = chemistry(mixingExample(), "aromatics", "ideal-gas");
  project.units[0].name = "Benzene vapor feed";
  project.units[0].params.temperature = 400;
  project.units[1].name = "Toluene vapor feed";
  for (const unit of project.units.filter((unit) => unit.kind === "Product"))
    unit.name = "Benzene–toluene vapor product";
  return project;
}

export function aromaticFlashTemplate(): Project {
  const project = solutionExample();
  project.units[0].name = "Benzene–toluene feed";
  project.units[1].name = "Benzene–toluene flash separator";
  project.units[2].name = "Benzene-rich vapor";
  project.units[3].name = "Toluene-rich liquid";
  return project;
}

export function aromaticColumnTemplate(method: "fug" | "mesh"): Project {
  const project = solutionExample();
  project.name =
    method === "fug"
      ? "Benzene–toluene FUG design"
      : "Benzene–toluene MESH column";
  project.units[0].name = "Benzene–toluene feed";
  project.units[0].params.temperature = 340;
  project.units[0].params.pressure = 65000;
  const column = project.units[1];
  column.name =
    method === "fug" ? "FUG shortcut column" : "MESH distillation column";
  column.params.pressure = 55000;
  column.params.distillation = {
    ...defaultDistillation(["benzene", "toluene"], 2.5),
    method,
    distillateTemperature: 335,
    bottomsTemperature: 360,
  };
  project.units[2].name = "Benzene-rich distillate";
  project.units[3].name = "Toluene-rich bottoms";
  return project;
}

export function aqueousFlashTemplate(): Project {
  const project = chemistry(
    solutionExample(),
    "aqueous",
    "modified-unifac-2.0",
  );
  project.name = "Ethanol–water separation";
  project.units[0].name = "Ethanol–water feed";
  project.units[0].params.pressure = 78000;
  project.units[1].name = "Ethanol–water flash separator";
  project.units[2].name = "Ethanol-rich vapor";
  project.units[3].name = "Water-rich liquid";
  return project;
}

export function aromaticRecoveryTemplate(
  id: "fractionation" | "fractionation-complex",
): Project {
  const project = chemistry(plantTemplate(id)!, "aromatics", "ideal-solution");
  project.name =
    id === "fractionation"
      ? "Three-stage benzene–toluene recovery"
      : "Four-stage benzene–toluene recovery";
  const temperatures = [344, 348, 352, 355];
  let heater = 0;
  let separator = 0;
  for (const unit of project.units) {
    unit.params.pressure = 55000;
    if (unit.kind === "Feed") {
      unit.name = "Benzene–toluene feed";
      unit.params.temperature = 320;
    }
    if (unit.kind === "Cooler") unit.params.temperature = 320;
    if (unit.kind === "Heater")
      unit.params.temperature = temperatures[heater++];
    if (unit.kind === "Distillation") {
      unit.params.temperature = temperatures[separator++];
      unit.name = `Benzene–toluene flash ${separator}`;
    }
  }
  return project;
}

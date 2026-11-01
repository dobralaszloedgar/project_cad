import type { Unit } from "../schema";
import type { Stream } from "../solver";
import { componentFlows, withComponentFlows } from "../stream-composition";
import { evaluateProperties, executeKernel } from "../thermo";
import { thermoContext } from "../thermo/catalog";
import type { ThermoSettings } from "../thermo/registry";
import { distillationSchema, type CondenserType } from "./distillation-schema";
import {
  rateTrayHydraulics,
  type TrayHydraulicsResult,
} from "./tray-hydraulics";

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
function requireColumn(ok: boolean, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export interface FugResult {
  method: "fug";
  condenserType: CondenserType;
  solverVersion: "project-column-fug-v1";
  minimumStages: number;
  theoreticalStages: number;
  minimumRefluxRatio: number;
  refluxRatio: number;
  underwoodRoot: number;
  distillateMolS: number;
  bottomsMolS: number;
  rectifyingVaporMolS: number;
  strippingVaporMolS: number;
  warnings: string[];
}
export interface StageResiduals {
  material: number;
  equilibrium: number;
  energy: number;
  summation: number;
}
export interface ColumnStage {
  stage: number;
  kind: "condenser" | "tray" | "reboiler";
  temperatureK: number;
  pressurePa: number;
  liquidMolS: number;
  vaporMolS: number;
  liquidComposition: number[];
  vaporComposition: number[];
  liquidEnthalpy: number;
  vaporEnthalpy: number;
  residuals: StageResiduals;
}
export interface MeshResult {
  method: "mesh";
  condenserType: CondenserType;
  solverVersion: string;
  componentIds: string[];
  iterations: number;
  feedTray: number;
  feedMolS: number;
  feedComposition: number[];
  feedEnthalpy: number;
  distillateMolS: number;
  bottomsMolS: number;
  condenserDutyW: number;
  reboilerDutyW: number;
  stages: ColumnStage[];
  residuals: StageResiduals & { component: number; overallEnergyW: number };
  warnings: string[];
  hydraulics?: TrayHydraulicsResult;
}
export type DistillationResult = FugResult | MeshResult;

/** Fenske / Underwood / explicit Gilliland with Hengstebeck–Geddes nonkeys. */
export function solveFug(unit: Unit, feed: Stream, settings: ThermoSettings) {
  const d = distillationSchema.parse(unit.params.distillation);
  const { ids } = thermoContext(settings);
  const flows = componentFlows(feed, ids);
  const rows = Object.entries(flows).filter(([, n]) => n > 0);
  const total = sum(rows.map(([, n]) => n));
  const lk = d.lightKey,
    hk = d.heavyKey;
  requireColumn(
    !!lk && !!hk && lk !== hk && flows[lk] > 0 && flows[hk] > 0,
    "FUG requires distinct light and heavy keys present in the feed.",
  );
  requireColumn(
    rows.every(
      ([id]) =>
        Number.isFinite(d.relativeVolatilities[id]) &&
        d.relativeVolatilities[id] > 0,
    ),
    "Supply a positive relative volatility for every active feed component.",
  );
  const alpha = Object.fromEntries(
    rows.map(([id]) => [
      id,
      d.relativeVolatilities[id] / d.relativeVolatilities[hk],
    ]),
  );
  const aL = alpha[lk];
  requireColumn(
    aL > 1 + 1e-8,
    "Light-key volatility must exceed heavy-key volatility.",
  );
  requireColumn(
    rows.every(([id]) => !(alpha[id] > 1 && alpha[id] < aL)),
    "FUG requires adjacent keys in volatility order; an active component lies between the selected keys.",
  );
  const logL = Math.log(d.lightRecovery) - Math.log1p(-d.lightRecovery);
  const logH = Math.log1p(-d.heavyRecovery) - Math.log(d.heavyRecovery);
  const minimumStages = (logL - logH) / Math.log(aL);
  requireColumn(
    minimumStages > 0 && Number.isFinite(minimumStages),
    "Recovery targets must enrich the light key in distillate (combined key recoveries must exceed 1).",
  );
  const top = Object.fromEntries(
    Object.entries(flows).map(([id, n]) => {
      if (n === 0) return [id, 0];
      const logOdds = logH + minimumStages * Math.log(alpha[id]);
      const recovery =
        id === lk
          ? d.lightRecovery
          : id === hk
            ? 1 - d.heavyRecovery
            : logOdds >= 0
              ? 1 / (1 + Math.exp(-logOdds))
              : Math.exp(logOdds) / (1 + Math.exp(logOdds));
      return [id, n * recovery];
    }),
  );
  const bottom = Object.fromEntries(
    Object.entries(flows).map(([id, n]) => [id, n - top[id]]),
  );
  const D = sum(Object.values(top)),
    B = sum(Object.values(bottom));
  const underwood = (theta: number) =>
    sum(rows.map(([id, n]) => (alpha[id] * n) / total / (alpha[id] - theta))) -
    (1 - d.feedLiquidFraction);
  let low = 1,
    high = aL;
  for (let i = 0; i < 120; i++) {
    const theta = (low + high) / 2;
    if (underwood(theta) > 0) high = theta;
    else low = theta;
  }
  const theta = (low + high) / 2;
  requireColumn(
    Math.abs(underwood(theta)) < 1e-7,
    "Underwood root did not converge; check key amounts and volatility spacing.",
  );
  const minimumRefluxRatio =
    sum(rows.map(([id]) => (alpha[id] * top[id]) / D / (alpha[id] - theta))) -
    1;
  requireColumn(
    minimumRefluxRatio > 0,
    "FUG gives nonpositive minimum reflux; this separation needs another specification or model.",
  );
  const refluxRatio =
    d.refluxMode === "ratio"
      ? d.refluxRatio
      : d.refluxMultiplier * minimumRefluxRatio;
  const X = (refluxRatio - minimumRefluxRatio) / (refluxRatio + 1);
  requireColumn(
    refluxRatio - minimumRefluxRatio >
      1e-10 * Math.max(1, minimumRefluxRatio) && X < 1,
    `Operating reflux must exceed minimum reflux (${minimumRefluxRatio.toPrecision(6)}).`,
  );
  const Y = -Math.expm1(
    (((1 + 54.4 * X) / (11 + 117.2 * X)) * (X - 1)) / Math.sqrt(X),
  );
  const theoreticalStages = Math.ceil((minimumStages + Y) / (1 - Y));
  requireColumn(
    Number.isSafeInteger(theoreticalStages),
    "Reflux is too close to minimum to resolve a finite stage count.",
  );
  const rectifyingVaporMolS = (refluxRatio + 1) * D;
  const strippingVaporMolS =
    rectifyingVaporMolS - (1 - d.feedLiquidFraction) * total;
  requireColumn(
    strippingVaporMolS > 0,
    "Feed quality and reflux leave no positive stripping-section boilup.",
  );
  requireColumn(
    unit.params.pressure <= feed.pressure,
    "Column pressure exceeds feed pressure.",
  );
  if (d.condenserType === "partial") {
    try {
      evaluateProperties(
        d.distillateTemperature,
        unit.params.pressure,
        ids.map((id) => top[id] / D),
        settings,
        undefined,
        ids,
        1,
      );
    } catch (error) {
      throw new Error(
        `Equilibrium condenser requires vapor distillate at the specified distillate temperature and top pressure. ${error instanceof Error ? error.message : "Check the product state."}`,
      );
    }
  }
  const result: FugResult = {
    method: "fug",
    condenserType: d.condenserType,
    solverVersion: "project-column-fug-v1",
    minimumStages,
    theoreticalStages,
    minimumRefluxRatio,
    refluxRatio,
    underwoodRoot: theta,
    distillateMolS: D,
    bottomsMolS: B,
    rectifyingVaporMolS,
    strippingVaporMolS,
    warnings: [
      `FUG preliminary design: supplied constant relative volatilities, adjacent keys, constant molar overflow and declared feed q. Stages include an equilibrium reboiler and ${d.condenserType === "partial" ? "the equilibrium partial condenser" : "exclude the total condenser"}. Actual trays require efficiencies; no azeotrope prediction or hydraulics.`,
      "FUG product temperatures are specified. Net duty is only the selected-model outlet-minus-feed enthalpy balance at those temperatures; condenser and reboiler duties and stage profiles are unavailable.",
    ],
  };
  if (d.hydraulics?.enabled)
    result.warnings.push(
      "Tray hydraulic rating is inactive in FUG; select MESH for per-tray flooding and weeping predictions.",
    );
  return {
    result,
    outputs: [
      withComponentFlows(
        {
          temperature: d.distillateTemperature,
          pressure: unit.params.pressure,
          ...(d.condenserType === "partial" ? { vaporFraction: 1 } : {}),
        },
        top,
        ids,
      ),
      withComponentFlows(
        { temperature: d.bottomsTemperature, pressure: unit.params.pressure },
        bottom,
        ids,
      ),
    ],
  };
}

export function solveMesh(unit: Unit, feed: Stream, settings: ThermoSettings) {
  const d = distillationSchema.parse(unit.params.distillation);
  const { ids, catalog } = thermoContext(settings);
  const flows = componentFlows(feed, ids);
  const total = sum(Object.values(flows));
  requireColumn(total > 0, "MESH requires a positive-flow feed.");
  requireColumn(
    d.feedTray <= unit.params.trayCount,
    "Feed tray must be within the installed equilibrium trays.",
  );
  requireColumn(
    d.distillateFlow < total,
    "Distillate flow must be less than feed flow, leaving positive bottoms.",
  );
  const result = executeKernel<MeshResult>({
    modelId: settings.modelId,
    temperature: feed.temperature,
    pressure: feed.pressure,
    composition: ids.map((id) => flows[id] / total),
    chemicals: ids.map((id) => catalog.get(id)),
    extrapolate: settings.extrapolate,
    activityParameters: catalog.activityParameters,
    vaporFraction: feed.vaporFraction,
    column: {
      condenserType: d.condenserType,
      trayCount: unit.params.trayCount,
      feedTray: d.feedTray,
      pressurePa: unit.params.pressure,
      pressureDropPa: d.pressureDrop,
      feedMolS: total,
      distillateMolS: d.distillateFlow,
      refluxRatio: d.refluxRatio,
      maxIterations: d.maxIterations,
      tolerance: d.tolerance,
      kTolerance: d.tolerance,
      enthalpyTolerance: d.tolerance,
    },
  });
  result.method = "mesh";
  if (d.hydraulics?.enabled) {
    result.hydraulics = rateTrayHydraulics(
      result,
      d.hydraulics,
      result.componentIds.map((id) => catalog.get(id).molecularWeight),
    );
    result.warnings.push(...result.hydraulics.warnings);
  }
  result.warnings.push(
    `MESH equilibrium stages: one feed, adiabatic trays, ${d.condenserType === "partial" ? "equilibrium partial condenser with vapor distillate" : "saturated total condenser with liquid distillate"} and kettle reboiler. Tray count excludes both end units. Low-pressure VLE only; no tray efficiencies, hydraulic feedback, side draws or liquid–liquid stability search.`,
  );
  const product = (stage: ColumnStage, rate: number, vapor = false) =>
    withComponentFlows(
      {
        temperature: stage.temperatureK,
        pressure: stage.pressurePa,
        vaporFraction: vapor ? 1 : 0,
      },
      Object.fromEntries(
        ids.map((id) => {
          const i = result.componentIds.indexOf(id);
          return [
            id,
            i < 0
              ? 0
              : rate *
                (vapor
                  ? stage.vaporComposition[i]
                  : stage.liquidComposition[i]),
          ];
        }),
      ),
      ids,
    );
  return {
    result,
    outputs: [
      product(
        result.stages[0],
        result.distillateMolS,
        d.condenserType === "partial",
      ),
      product(result.stages.at(-1)!, result.bottomsMolS),
    ],
  };
}

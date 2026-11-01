import type { MeshResult } from "./distillation";
import type { TrayHydraulicsConfig } from "./tray-hydraulics-schema";

export type HydraulicState =
  | "normal"
  | "near-flooding"
  | "weeping"
  | "flooding"
  | "flooding-and-weeping"
  | "unrated";

export const hydraulicStateLabels: Record<HydraulicState, string> = {
  normal: "Within rated limits",
  "near-flooding": "Near flooding",
  weeping: "Weeping predicted",
  flooding: "Flooding predicted",
  "flooding-and-weeping": "Flooding + weeping predicted",
  unrated: "Incomplete rating",
};

export interface TrayHydraulicResult {
  stage: number;
  state: HydraulicState;
  vaporDensity: number;
  vaporVelocity: number;
  holeVelocity: number;
  liquidVolumeFlow: number;
  flowParameter: number;
  floodVelocity: number | null;
  jetFloodFraction: number | null;
  downcomerFloodFraction: number;
  weepVelocity: number | null;
  /** Actual hole velocity / predicted onset velocity; below 1 predicts weeping. */
  weepRatio: number | null;
  clearLiquidHeight: number;
  frothHeight: number;
  downcomerBackup: number;
  /** Diagnostic only. Never substituted into the MESH pressure profile. */
  pressureDropPa: number;
  notes: string[];
}

export interface TrayHydraulicsResult {
  version: "sieve-rating-v1";
  status: "rated" | "partial" | "unavailable";
  config: TrayHydraulicsConfig;
  stages: TrayHydraulicResult[];
  limitingTray: number | null;
  maxFloodFraction: number | null;
  minimumWeepRatio: number | null;
  warnings: string[];
}

/** Circular-segment downcomer: its chord is the outlet weir. One inlet seal
 * area and one outlet downcomer are excluded from the active bubbling area. */
export function sieveTrayGeometry(h: TrayHydraulicsConfig) {
  const area = (Math.PI * h.diameter ** 2) / 4;
  let low = 0,
    high = Math.PI;
  for (let i = 0; i < 60; i++) {
    const angle = (low + high) / 2;
    if (angle - Math.sin(angle) < 2 * Math.PI * h.downcomerFraction)
      low = angle;
    else high = angle;
  }
  const downcomerArea = area * h.downcomerFraction;
  const activeArea = area - 2 * downcomerArea;
  return {
    area,
    downcomerArea,
    activeArea,
    netArea: area - downcomerArea,
    holeArea: activeArea * h.holeAreaFraction,
    weirLength: h.diameter * Math.sin((low + high) / 4),
  };
}

/** Simevo's published polynomial fit to Fair, in m/s. Natural log; spacing mm.
 * Restricted to 0.01 <= FLV <= 2 and 300–900 mm, without extrapolation.
 * https://libpf.com/posts/2012-03-05-sieve-tray-flooding-correlation/ */
export function fairCapacity(flowParameter: number, spacing: number) {
  if (
    flowParameter < 0.01 ||
    flowParameter > 2 ||
    spacing < 0.3 ||
    spacing > 0.9
  )
    return null;
  const x = Math.log(flowParameter),
    y = spacing * 1000;
  return (
    (((1.10748e-6 * y + 0.00045284) * x + (4.04865e-6 * y + 0.000799395)) * x +
      (-3.09381e-5 * y - 0.00625024)) *
      x +
    (3.00232e-5 * y + 0.0140453)
  );
}

/** Approximate readings of the published Eduljee K2 graph (15–110 mm).
 * Piecewise linear interpolation deliberately avoids extrapolating the graph.
 * Figure 8: https://www.chemengonline.com/entrainment-flooding-and-weeping-velocities/
 * Equation/units: NPTEL 103103027, module 7, lecture 2, eq. 7.3. */
export function weepCoefficient(clearHeightM: number) {
  const points = [
    [15, 27.3],
    [20, 28.35],
    [30, 29.12],
    [40, 29.65],
    [50, 30.02],
    [60, 30.32],
    [80, 30.75],
    [100, 31],
    [110, 31.12],
  ];
  const mm = clearHeightM * 1000;
  if (mm < 15 || mm > 110) return null;
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i],
      [x0, y0] = points[i - 1];
    if (mm <= x) return y0 + ((y - y0) * (mm - x0)) / (x - x0);
  }
  return null;
}

export function hydraulicState(
  jet: number | null,
  downcomer: number,
  weepRatio: number | null,
): HydraulicState {
  const flooding = Math.max(jet ?? 0, downcomer) >= 1;
  const weeping = weepRatio !== null && weepRatio < 1;
  if (flooding && weeping) return "flooding-and-weeping";
  if (flooding) return "flooding";
  if (weeping) return "weeping";
  if (Math.max(jet ?? 0, downcomer) >= 0.8) return "near-flooding";
  if (jet === null || weepRatio === null) return "unrated";
  return "normal";
}

/** Rates the converged local exiting tray traffic. End units are excluded.
 * No stage, pressure, duty, efficiency or stream is modified by this function. */
export function rateTrayHydraulics(
  column: MeshResult,
  h: TrayHydraulicsConfig,
  molecularWeights: number[],
): TrayHydraulicsResult {
  const result: TrayHydraulicsResult = {
    version: "sieve-rating-v1",
    status: "unavailable",
    config: { ...h },
    stages: [],
    limitingTray: null,
    maxFloodFraction: null,
    minimumWeepRatio: null,
    warnings: [
      "Preliminary single-pass sieve-tray rating of MESH traffic. No feedback to separation, pressure profile, efficiencies or duties; predicted limits do not describe operation beyond flooding.",
      "Supplied liquid density and surface tension are constant across trays. Vapor density uses the ideal-gas law at each tray. Assumes clean, level, nonfoaming trays and 50% downcomer liquid fraction.",
      "Fair capacity fit; Eduljee weep onset with approximate graph interpolation; Francis weir and NPTEL pressure-drop/downcomer-backup relations. No weep rate, entrainment rate, downcomer choke or dynamic accumulation model.",
    ],
  };
  if (!h.liquidDensity || !h.surfaceTension) {
    result.warnings.unshift(
      "Hydraulic rating unavailable: supply liquid density and surface tension at representative tray conditions.",
    );
    return result;
  }
  if (
    molecularWeights.length !== column.componentIds.length ||
    molecularWeights.some((w) => !Number.isFinite(w) || w <= 0)
  ) {
    result.warnings.unshift(
      "Hydraulic rating unavailable: missing component molecular weights.",
    );
    return result;
  }
  const g = sieveTrayGeometry(h),
    rhoL = h.liquidDensity;
  for (const s of column.stages.filter((s) => s.kind === "tray")) {
    const mwL = s.liquidComposition.reduce(
      (sum, x, i) => sum + x * molecularWeights[i],
      0,
    );
    const mwV = s.vaporComposition.reduce(
      (sum, y, i) => sum + y * molecularWeights[i],
      0,
    );
    const rhoV = (s.pressurePa * mwV) / (8.314462618 * s.temperatureK);
    const massL = s.liquidMolS * mwL,
      massV = s.vaporMolS * mwV;
    if (
      ![rhoV, massL, massV].every(Number.isFinite) ||
      rhoV <= 0 ||
      rhoV >= rhoL ||
      massL <= 0 ||
      massV <= 0
    ) {
      result.warnings.unshift(
        `Tray ${s.stage}: hydraulic rating unavailable for nonphysical phase density or flow.`,
      );
      continue;
    }
    const qV = massV / rhoV,
      qL = massL / rhoL;
    const uN = qV / g.netArea,
      uH = qV / g.holeArea;
    const flv = (massL / massV) * Math.sqrt(rhoV / rhoL);
    const capacity = fairCapacity(flv, h.traySpacing);
    const floodVelocity =
      capacity === null
        ? null
        : capacity *
          (h.surfaceTension / 0.02) ** 0.2 *
          Math.sqrt((rhoL - rhoV) / rhoV);
    const jet = floodVelocity === null ? null : uN / floodVelocity;
    // NPTEL module 7, lecture 2 eqs. 7.4 and 7.7–7.13, converted mm -> m.
    const crest = 0.75 * (qL / g.weirLength) ** (2 / 3);
    const clear = h.weirHeight + crest;
    const dryHead = (0.051 * (uH / h.dischargeCoefficient) ** 2 * rhoV) / rhoL;
    const residualHead = 12.5 / rhoL;
    const trayHead = dryHead + clear + residualHead;
    const clearanceArea = Math.min(
      g.downcomerArea,
      g.weirLength * h.downcomerClearance,
    );
    const downcomerLoss = 0.166 * (qL / clearanceArea) ** 2;
    const backup = (clear + trayHead + downcomerLoss) / 0.5;
    const downcomer = backup / (h.traySpacing + h.weirHeight);
    const k2 = weepCoefficient(clear);
    const weepVelocity =
      k2 === null
        ? null
        : (k2 - 0.9 * (25.4 - h.holeDiameter * 1000)) / Math.sqrt(rhoV);
    const weepRatio = weepVelocity === null ? null : uH / weepVelocity;
    const notes: string[] = [];
    if (capacity === null)
      notes.push("Jet flooding unrated: flow parameter outside 0.01–2.");
    if (k2 === null)
      notes.push("Weeping unrated: clear liquid height outside 15–110 mm.");
    result.stages.push({
      stage: s.stage,
      state: hydraulicState(jet, downcomer, weepRatio),
      vaporDensity: rhoV,
      vaporVelocity: uN,
      holeVelocity: uH,
      liquidVolumeFlow: qL,
      flowParameter: flv,
      floodVelocity,
      jetFloodFraction: jet,
      downcomerFloodFraction: downcomer,
      weepVelocity,
      weepRatio,
      clearLiquidHeight: clear,
      frothHeight: clear / 0.5,
      downcomerBackup: backup,
      pressureDropPa: rhoL * 9.80665 * trayHead,
      notes,
    });
  }
  if (!result.stages.length) return result;
  result.status =
    result.stages.length ===
      column.stages.filter((s) => s.kind === "tray").length &&
    result.stages.every((s) => !s.notes.length)
      ? "rated"
      : "partial";
  const limiting = result.stages.reduce((a, b) =>
    Math.max(a.jetFloodFraction ?? 0, a.downcomerFloodFraction) >=
    Math.max(b.jetFloodFraction ?? 0, b.downcomerFloodFraction)
      ? a
      : b,
  );
  result.limitingTray = limiting.stage;
  result.maxFloodFraction = Math.max(
    limiting.jetFloodFraction ?? 0,
    limiting.downcomerFloodFraction,
  );
  const ratios = result.stages.flatMap((s) =>
    s.weepRatio === null ? [] : [s.weepRatio],
  );
  result.minimumWeepRatio = ratios.length ? Math.min(...ratios) : null;
  const flooded = result.stages.filter(
    (s) => s.state.includes("flooding") && s.state !== "near-flooding",
  );
  const weeping = result.stages.filter(
    (s) => s.weepRatio !== null && s.weepRatio < 1,
  );
  if (flooded.length)
    result.warnings.unshift(
      `Flooding predicted on tray(s) ${flooded.map((s) => s.stage).join(", ")}.`,
    );
  else if (result.maxFloodFraction >= 0.8)
    result.warnings.unshift(
      `Tray ${result.limitingTray} is at or above 80% of a predicted flooding limit.`,
    );
  if (weeping.length)
    result.warnings.unshift(
      `Weeping predicted on tray(s) ${weeping.map((s) => s.stage).join(", ")}.`,
    );
  if (result.status === "partial")
    result.warnings.unshift(
      "Hydraulic rating is incomplete; inspect the unrated trays and correlation limits.",
    );
  return result;
}

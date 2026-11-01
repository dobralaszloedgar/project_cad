export type Dimension =
  | "temperature"
  | "pressure"
  | "pressureDifference"
  | "temperatureDifference"
  | "molarFlow"
  | "massFlow"
  | "power"
  | "enthalpy"
  | "molecularWeight"
  | "specificEnergy"
  | "volumetricEnergy"
  | "volumeFlow"
  | "length"
  | "area"
  | "volume"
  | "mass"
  | "time"
  | "rotationalSpeed"
  | "torque"
  | "specificPower"
  | "conductance"
  | "heatTransferCoefficient"
  | "thermalConductivity"
  | "density"
  | "dynamicViscosity"
  | "kinematicViscosity"
  | "heatCapacity"
  | "surfaceTension"
  | "foulingResistance";

function definition(
  dimension: Dimension,
  scale: number,
  offset = 0,
  gauge = false,
) {
  return { dimension, scale, offset, gauge };
}

// SI = value * scale + offset. US units use the international pound and
// International Table Btu (not the thermochemical Btu).
// Reference: https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8
const pound = 0.45359237;
const poundMole = pound * 1000;
const btu = 1055.05585262;
const foot = 0.3048;
const psi = (pound * 9.80665) / 0.0254 ** 2;
export const STANDARD_ATMOSPHERE = 101325;
export const UNIT_DEFINITIONS = {
  "rev/s": definition("rotationalSpeed", 1),
  rpm: definition("rotationalSpeed", 1 / 60),
  "N m": definition("torque", 1),
  "lbf ft": definition("torque", pound * 9.80665 * foot),
  "W/m3": definition("specificPower", 1),
  "kW/m3": definition("specificPower", 1000),
  K: definition("temperature", 1),
  degC: definition("temperature", 1, 273.15),
  degF: definition("temperature", 5 / 9, 273.15 - (32 * 5) / 9),
  degR: definition("temperature", 5 / 9),
  deltaK: definition("temperatureDifference", 1),
  deltaC: definition("temperatureDifference", 1),
  deltaF: definition("temperatureDifference", 5 / 9),
  deltaR: definition("temperatureDifference", 5 / 9),
  Pa: definition("pressure", 1),
  kPa: definition("pressure", 1000),
  bar: definition("pressure", 100000),
  MPa: definition("pressure", 1e6),
  atm: definition("pressure", STANDARD_ATMOSPHERE),
  psi: definition("pressure", psi),
  Pag: definition("pressure", 1, 0, true),
  kPag: definition("pressure", 1000, 0, true),
  MPag: definition("pressure", 1e6, 0, true),
  barg: definition("pressure", 100000, 0, true),
  psig: definition("pressure", psi, 0, true),
  "mol/s": definition("molarFlow", 1),
  "kmol/h": definition("molarFlow", 1000 / 3600),
  "lbmol/h": definition("molarFlow", poundMole / 3600),
  "kg/s": definition("massFlow", 1),
  "kg/h": definition("massFlow", 1 / 3600),
  "lb/h": definition("massFlow", pound / 3600),
  W: definition("power", 1),
  kW: definition("power", 1000),
  hp: definition("power", 550 * foot * pound * 9.80665),
  "Btu/h": definition("power", btu / 3600),
  "MMBtu/h": definition("power", (btu * 1e6) / 3600),
  "MJ/h": definition("power", 1e6 / 3600),
  "J/Sm3": definition("volumetricEnergy", 1),
  "MJ/Sm3": definition("volumetricEnergy", 1e6),
  "Btu/scf": definition("volumetricEnergy", btu / foot ** 3),
  "J/mol": definition("enthalpy", 1),
  "kJ/mol": definition("enthalpy", 1000),
  "Btu/lbmol": definition("enthalpy", btu / poundMole),
  "kg/mol": definition("molecularWeight", 1),
  "g/mol": definition("molecularWeight", 0.001),
  "lb/lbmol": definition("molecularWeight", pound / poundMole),
  "J/kg": definition("specificEnergy", 1),
  "kJ/kg": definition("specificEnergy", 1000),
  "Btu/lb": definition("specificEnergy", btu / pound),
  "m3/s": definition("volumeFlow", 1),
  "m3/h": definition("volumeFlow", 1 / 3600),
  "L/s": definition("volumeFlow", 0.001),
  "L/min": definition("volumeFlow", 0.001 / 60),
  "ft3/min": definition("volumeFlow", foot ** 3 / 60),
  "ft3/h": definition("volumeFlow", foot ** 3 / 3600),
  m: definition("length", 1),
  cm: definition("length", 0.01),
  mm: definition("length", 0.001),
  ft: definition("length", foot),
  in: definition("length", 0.0254),
  m2: definition("area", 1),
  ft2: definition("area", foot ** 2),
  m3: definition("volume", 1),
  L: definition("volume", 0.001),
  ft3: definition("volume", foot ** 3),
  kg: definition("mass", 1),
  g: definition("mass", 0.001),
  lb: definition("mass", pound),
  s: definition("time", 1),
  min: definition("time", 60),
  h: definition("time", 3600),
  "W/K": definition("conductance", 1),
  "kW/K": definition("conductance", 1000),
  "Btu/(h degF)": definition("conductance", ((btu / 3600) * 9) / 5),
  "W/(m2 K)": definition("heatTransferCoefficient", 1),
  "Btu/(h ft2 degF)": definition(
    "heatTransferCoefficient",
    ((btu / 3600 / foot ** 2) * 9) / 5,
  ),
  "W/(m K)": definition("thermalConductivity", 1),
  "kg/m3": definition("density", 1),
  "lb/ft3": definition("density", pound / foot ** 3),
  "Pa s": definition("dynamicViscosity", 1),
  cP: definition("dynamicViscosity", 0.001),
  "lb/(ft s)": definition("dynamicViscosity", pound / foot),
  "m2/s": definition("kinematicViscosity", 1),
  cSt: definition("kinematicViscosity", 1e-6),
  "ft2/s": definition("kinematicViscosity", foot ** 2),
  "J/(kg K)": definition("heatCapacity", 1),
  "kJ/(kg K)": definition("heatCapacity", 1000),
  "Btu/(lb degF)": definition("heatCapacity", ((btu / pound) * 9) / 5),
  "N/m": definition("surfaceTension", 1),
  "mN/m": definition("surfaceTension", 0.001),
  "lbf/ft": definition("surfaceTension", (pound * 9.80665) / foot),
  "Btu/(h ft degF)": definition(
    "thermalConductivity",
    ((btu / 3600 / foot) * 9) / 5,
  ),
  "m2 K/W": definition("foulingResistance", 1),
  "h ft2 degF/Btu": definition(
    "foulingResistance",
    (3600 * foot ** 2 * 5) / 9 / btu,
  ),
};
export type Unit = keyof typeof UNIT_DEFINITIONS;
export function isUnit(value: string): value is Unit {
  return Object.hasOwn(UNIT_DEFINITIONS, value);
}

export function unitLabel(unit: Unit) {
  return (
    (
      {
        degC: "°C",
        degF: "°F",
        degR: "°R",
        deltaK: "K",
        deltaC: "°C",
        deltaF: "°F",
        deltaR: "°R",
        Pag: "Pa(g)",
        kPag: "kPa(g)",
        MPag: "MPa(g)",
        m2: "m²",
        ft2: "ft²",
        m3: "m³",
        ft3: "ft³",
        "m3/s": "m³/s",
        "m3/h": "m³/h",
        "ft3/min": "ft³/min",
        "ft3/h": "ft³/h",
        "kg/m3": "kg/m³",
        "lb/ft3": "lb/ft³",
        "Pa s": "Pa·s",
        "m2/s": "m²/s",
        "ft2/s": "ft²/s",
        "Btu/(lb degF)": "Btu/(lb °F)",
        "J/Sm3": "J/Sm³",
        "MJ/Sm3": "MJ/Sm³",
        "Btu/(h degF)": "Btu/(h °F)",
        "W/(m2 K)": "W/(m² K)",
        "Btu/(h ft2 degF)": "Btu/(h ft² °F)",
        "Btu/(h ft degF)": "Btu/(h ft °F)",
        "m2 K/W": "m² K/W",
        "h ft2 degF/Btu": "h ft² °F/Btu",
      } as Partial<Record<Unit, string>>
    )[unit] ?? unit
  );
}

export const UNIT_SYSTEMS = {
  si: {
    label: "SI",
    description: "K · Pa · mol/s · kg/s · W",
    units: {
      temperature: "K",
      pressure: "Pa",
      pressureDifference: "Pa",
      temperatureDifference: "deltaK",
      molarFlow: "mol/s",
      massFlow: "kg/s",
      power: "W",
      enthalpy: "J/mol",
      molecularWeight: "kg/mol",
      specificEnergy: "J/kg",
      volumetricEnergy: "J/Sm3",
      volumeFlow: "m3/s",
      length: "m",
      area: "m2",
      volume: "m3",
      mass: "kg",
      time: "s",
      rotationalSpeed: "rpm",
      torque: "N m",
      specificPower: "kW/m3",
      conductance: "W/K",
      heatTransferCoefficient: "W/(m2 K)",
      thermalConductivity: "W/(m K)",
      density: "kg/m3",
      dynamicViscosity: "Pa s",
      kinematicViscosity: "m2/s",
      heatCapacity: "J/(kg K)",
      surfaceTension: "N/m",
      foulingResistance: "m2 K/W",
    },
  },
  metric: {
    label: "Metric engineering",
    description: "°C · bar · kmol/h · kg/h · kW",
    units: {
      temperature: "degC",
      pressure: "bar",
      pressureDifference: "bar",
      temperatureDifference: "deltaK",
      molarFlow: "kmol/h",
      massFlow: "kg/h",
      power: "kW",
      enthalpy: "kJ/mol",
      molecularWeight: "g/mol",
      specificEnergy: "kJ/kg",
      volumetricEnergy: "MJ/Sm3",
      volumeFlow: "m3/h",
      length: "m",
      area: "m2",
      volume: "m3",
      mass: "kg",
      time: "s",
      rotationalSpeed: "rpm",
      torque: "N m",
      specificPower: "kW/m3",
      conductance: "W/K",
      heatTransferCoefficient: "W/(m2 K)",
      thermalConductivity: "W/(m K)",
      density: "kg/m3",
      dynamicViscosity: "cP",
      kinematicViscosity: "cSt",
      heatCapacity: "kJ/(kg K)",
      surfaceTension: "mN/m",
      foulingResistance: "m2 K/W",
    },
  },
  us: {
    label: "US customary",
    description: "°F · psi · lbmol/h · lb/h · Btu/h",
    units: {
      temperature: "degF",
      pressure: "psi",
      pressureDifference: "psi",
      temperatureDifference: "deltaF",
      molarFlow: "lbmol/h",
      massFlow: "lb/h",
      power: "Btu/h",
      enthalpy: "Btu/lbmol",
      molecularWeight: "lb/lbmol",
      specificEnergy: "Btu/lb",
      volumetricEnergy: "Btu/scf",
      volumeFlow: "ft3/min",
      length: "ft",
      area: "ft2",
      volume: "ft3",
      mass: "lb",
      time: "s",
      rotationalSpeed: "rpm",
      torque: "N m",
      specificPower: "kW/m3",
      conductance: "Btu/(h degF)",
      heatTransferCoefficient: "Btu/(h ft2 degF)",
      thermalConductivity: "Btu/(h ft degF)",
      density: "lb/ft3",
      dynamicViscosity: "lb/(ft s)",
      kinematicViscosity: "ft2/s",
      heatCapacity: "Btu/(lb degF)",
      surfaceTension: "lbf/ft",
      foulingResistance: "h ft2 degF/Btu",
    },
  },
} as const satisfies Record<
  string,
  { label: string; description: string; units: Record<Dimension, Unit> }
>;
export type UnitSystem = keyof typeof UNIT_SYSTEMS;
export const DEFAULT_UNIT_SYSTEM: UnitSystem = "metric";
export function unitSystemPreference(value: unknown): UnitSystem {
  return typeof value === "string" && Object.hasOwn(UNIT_SYSTEMS, value)
    ? (value as UnitSystem)
    : DEFAULT_UNIT_SYSTEM;
}

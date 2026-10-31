import type { Kind } from "@/domain/schema";
import { columnSymbol } from "./column-symbol";

const stroke = 'vector-effect="non-scaling-stroke"';
const body = `class="pfd-body" fill="var(--pfd-fill,none)" ${stroke}`;
const accent = `class="pfd-accent" stroke="var(--pfd-accent,currentColor)" ${stroke}`;
const boundary = `<path d="M28 48h44V36l32 28-32 28V80H28Z" ${body}/>`;
const defaultColumn = columnSymbol();

// Process equipment symbols. Keep the connector stubs separate
// so each drawing uses this editor's material ports and also works in the library.
export const equipmentSymbols: Record<Kind, string> = {
  Feed: boundary,
  Product: boundary,
  Mixer: `<path d="M40 28l48 36-48 36Z" ${body}/>`,
  Splitter: `<path d="M40 64l48-36v72Z" ${body}/>`,
  Heater: `<circle cx="64" cy="64" r="32" ${body}/><path d="M32 64h10l9-16 13 32 13-32 9 16h10" ${accent}/><path d="M64 120V96m-5 7 5-7 5 7" ${accent}/>`,
  Cooler: `<circle cx="64" cy="64" r="32" ${body}/><path d="M32 64h10l9-16 13 32 13-32 9 16h10" ${accent}/><path d="M64 96v24m-5-7 5 7 5-7" ${accent}/>`,
  PBR: `<rect x="32" y="20" width="64" height="88" rx="23" ${body}/><path d="M34 35h60M34 59h60M34 70h60M34 94h60" ${stroke}/>${[42, 52, 77, 87].map((y) => [44, 57, 70, 83].map((x) => `<circle cx="${x}" cy="${y}" r="2.8" ${stroke}/>`).join("")).join("")}<path d="M43 65h42" ${stroke}/>`,
  Distillation: defaultColumn.body,
};

export const equipmentConnectors: Record<Kind, string> = {
  Feed: "M104 64H120",
  Product: "M8 64H28",
  Mixer: "M8 40H40M8 88H40M88 64H120",
  Splitter: "M8 64H40M88 40H120M88 88H120",
  Heater: "M8 64H32M96 64H120",
  Cooler: "M8 64H32M96 64H120",
  PBR: "M64 8V20M64 108V120",
  Distillation: `M8 ${defaultColumn.feedY}H34M96 ${defaultColumn.distillateY}H120M78 ${defaultColumn.height - 32}V${defaultColumn.bottomsY}H120`,
};

// The 32px palette drawings keep pellets and trays distinct at small sizes.
export const compactEquipmentSymbols: Partial<Record<Kind, string>> = {
  PBR: `<rect x="8" y="5" width="16" height="22" rx="6" fill="var(--pfd-fill,none)"/><path d="M16 2v3M16 27v3M9 9h14M9 23h14"/><g fill="currentColor" stroke="none">${[12, 16, 20].map((y) => [13, 19].map((x) => `<circle cx="${x}" cy="${y}" r="1.1"/>`).join("")).join("")}</g>`,
  Distillation: `<rect x="11" y="4" width="12" height="24" rx="5" fill="var(--pfd-fill,none)"/><path d="M3 16h8M17 1v3M17 28v3M23 9h6M23 23h6"/><path d="M11 12h9v2.5M23 20h-9v2.5"/>`,
};

import type { Kind } from "@/domain/schema";

const stroke = 'vector-effect="non-scaling-stroke"';
const body = `class="pfd-body" fill="var(--pfd-fill,none)" ${stroke}`;
const accent = `class="pfd-accent" stroke="var(--pfd-accent,currentColor)" ${stroke}`;

// A compact, shared set of process-diagram primitives. Coordinates are in a
// 128-unit square; nozzles terminate at the same points as the material handles.
export const equipmentSymbols: Record<Kind, string> = {
  Feed: `<path d="M26 49H70V37L103 64 70 91V79H26Z" ${body}/>`,
  Product: `<path d="M29 49H69V39L98 64 69 89V79H29Z" ${body}/>`,
  Mixer: `<path d="M39 29 91 64 39 99Z" ${body}/>`,
  Splitter: `<path d="M37 64 89 29V99Z" ${body}/>`,
  Heater: `<circle cx="64" cy="64" r="29" ${body}/><path d="M35 64H45L53 50 65 78 76 50 84 64H93" ${accent}/><path d="M64 111V94M59 100 64 94 69 100" ${accent}/>`,
  Cooler: `<circle cx="64" cy="64" r="29" ${body}/><path d="M35 64H45L53 50 65 78 76 50 84 64H93" ${accent}/><path d="M64 94V111M59 105 64 111 69 105" ${accent}/>`,
  PBR: `<rect x="38" y="22" width="52" height="84" rx="18" ${body}/><path d="M40 36H88M38 64H90M40 92H88" ${stroke}/>${[45, 56, 73, 84].map((y) => [50, 64, 78].map((x) => `<circle cx="${x}" cy="${y}" r="2.5" ${stroke}/>`).join("")).join("")}`,
  Distillation: `<rect x="46" y="18" width="36" height="92" rx="18" ${body}/><path d="M48 37H73V43M80 53H55V59M48 70H73V76M80 87H55V93" ${stroke}/>`,
};

export const equipmentConnectors: Record<Kind, string> = {
  Feed: "M103 64H120",
  Product: "M8 64H29",
  Mixer: "M8 40H39M8 88H39M91 64H120",
  Splitter: "M8 64H37M89 40H120M89 88H120",
  Heater: "M8 64H35M93 64H120",
  Cooler: "M8 64H35M93 64H120",
  PBR: "M64 8V22M64 106V120",
  Distillation: "M8 64H46M64 8V18M64 110V120",
};

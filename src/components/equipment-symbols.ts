import type { Kind } from "@/domain/schema";
export const equipmentSymbols: Record<Kind, string> = {
  Feed: '<path d="M28 48h44V36l32 28-32 28V80H28Z" class="pfd-body" vector-effect="non-scaling-stroke" fill="var(--pfd-fill,none)"/>',
  Product:
    '<path d="M28 48h44V36l32 28-32 28V80H28Z" class="pfd-body" vector-effect="non-scaling-stroke" fill="var(--pfd-fill,none)"/>',
  Mixer:
    '<path d="M40 28l48 36-48 36Z" class="pfd-body" vector-effect="non-scaling-stroke" fill="var(--pfd-fill,none)"/>',
  Splitter:
    '<path d="M40 64l48-36v72Z" class="pfd-body" vector-effect="non-scaling-stroke" fill="var(--pfd-fill,none)"/>',
  Heater:
    '<circle cx="64" cy="64" r="32" class="pfd-body" vector-effect="non-scaling-stroke" fill="var(--pfd-fill,none)"/><path d="M32 64h10l9-16 13 32 13-32 9 16h10" class="pfd-accent" vector-effect="non-scaling-stroke" stroke="var(--pfd-accent,currentColor)"/><path d="M64 120V96m-5 7 5-7 5 7" class="pfd-accent" vector-effect="non-scaling-stroke" stroke="var(--pfd-accent,currentColor)"/>',
  Cooler:
    '<circle cx="64" cy="64" r="32" class="pfd-body" vector-effect="non-scaling-stroke" fill="var(--pfd-fill,none)"/><path d="M32 64h10l9-16 13 32 13-32 9 16h10" class="pfd-accent" vector-effect="non-scaling-stroke" stroke="var(--pfd-accent,currentColor)"/><path d="M64 96v24m-5-7 5 7 5-7" class="pfd-accent" vector-effect="non-scaling-stroke" stroke="var(--pfd-accent,currentColor)"/>',
  PBR: '<rect x="32" y="20" width="64" height="88" rx="23" fill="var(--pfd-fill,none)" vector-effect="non-scaling-stroke"/>\n<path d="M64 8v12M64 108v12M34 35h60M34 59h60M34 70h60M34 94h60" vector-effect="non-scaling-stroke"/>\n<circle cx="44" cy="42" r="2.8" vector-effect="non-scaling-stroke"/><circle cx="57" cy="42" r="2.8" vector-effect="non-scaling-stroke"/><circle cx="70" cy="42" r="2.8" vector-effect="non-scaling-stroke"/><circle cx="83" cy="42" r="2.8" vector-effect="non-scaling-stroke"/><circle cx="44" cy="52" r="2.8" vector-effect="non-scaling-stroke"/><circle cx="57" cy="52" r="2.8" vector-effect="non-scaling-stroke"/><circle cx="70" cy="52" r="2.8" vector-effect="non-scaling-stroke"/><circle cx="83" cy="52" r="2.8" vector-effect="non-scaling-stroke"/><circle cx="44" cy="77" r="2.8" vector-effect="non-scaling-stroke"/><circle cx="57" cy="77" r="2.8" vector-effect="non-scaling-stroke"/><circle cx="70" cy="77" r="2.8" vector-effect="non-scaling-stroke"/><circle cx="83" cy="77" r="2.8" vector-effect="non-scaling-stroke"/><circle cx="44" cy="87" r="2.8" vector-effect="non-scaling-stroke"/><circle cx="57" cy="87" r="2.8" vector-effect="non-scaling-stroke"/><circle cx="70" cy="87" r="2.8" vector-effect="non-scaling-stroke"/><circle cx="83" cy="87" r="2.8" vector-effect="non-scaling-stroke"/>\n<path d="M43 65h42" vector-effect="non-scaling-stroke"/>',
  Distillation:
    '<rect x="44" y="16" width="40" height="96" rx="20" fill="var(--pfd-fill,none)" vector-effect="non-scaling-stroke"/>\n<path d="M8 64h36M64 8v8M64 112v8" vector-effect="non-scaling-stroke"/>\n<path d="M45 34h29v7M83 50H54v7M45 66h29v7M83 82H54v7M45 98h29" vector-effect="non-scaling-stroke"/>',
};

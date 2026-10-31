import { type CSSProperties } from "react";
import type { Kind } from "@/domain/schema";
import {
  compactEquipmentSymbols,
  equipmentConnectors,
  equipmentSymbols,
} from "./equipment-symbols";
export const equipmentLabels: Record<Kind, string> = {
  Feed: "Feed",
  Product: "Product",
  Mixer: "Mixer",
  Splitter: "Splitter",
  Heater: "Heater",
  Cooler: "Cooler",
  PBR: "Packed-bed reactor",
  Distillation: "Distillation column",
};
export function EquipmentPanelIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="7" y="4" width="10" height="15" rx="4" />
      <path d="M12 1V4M2 9H7M17 14H22M9 19V22M15 19V22M7 9H17M7 14H17" />
    </svg>
  );
}
export function EquipmentIcon({
  kind,
  size = 24,
}: {
  kind: Kind;
  size?: number;
}) {
  const compact = size <= 48 ? compactEquipmentSymbols[kind] : undefined;
  const geometry =
    compact ??
    equipmentSymbols[kind] +
      (size > 48
        ? `<path d="${equipmentConnectors[kind]}" vector-effect="non-scaling-stroke"/>`
        : "");
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={compact ? "0 0 32 32" : "0 0 128 128"}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="var(--pfd-stroke-width,1.8)"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="equipment-symbol"
      aria-hidden="true"
      style={{ "--pfd-fill": "var(--symbol-fill,none)" } as CSSProperties}
      dangerouslySetInnerHTML={{ __html: geometry }}
    />
  );
}

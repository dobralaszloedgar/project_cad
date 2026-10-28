import { type CSSProperties } from "react";
import type { Kind } from "@/domain/schema";
import { equipmentSymbols } from "./equipment-symbols";
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
export function EquipmentIcon({
  kind,
  size = 24,
}: {
  kind: Kind;
  size?: number;
}) {
  const connectorPaths: Partial<Record<Kind, string>> = {
    Feed: "M104 64h16",
    Product: "M8 64h20",
    Mixer: "M8 40h32M8 88h32M88 64h32",
    Splitter: "M8 64h32M88 40h32M88 88h32",
    Heater: "M8 64h24M96 64h24",
    Cooler: "M8 64h24M96 64h24",
  };
  const geometry =
    equipmentSymbols[kind] +
    (size > 48 && connectorPaths[kind]
      ? `<path d="${connectorPaths[kind]}" vector-effect="non-scaling-stroke"/>`
      : "");
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
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

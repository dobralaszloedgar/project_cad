import type { Metadata } from "next";
import EquipmentSandbox from "@/components/equipment-3d/EquipmentSandbox";

export const metadata: Metadata = {
  title: "Project CAD – Equipment sandbox",
  description:
    "Explore eight detailed process equipment models and their internal assemblies in an interactive 3D studio.",
};

export default function EquipmentSandboxPage() {
  return <EquipmentSandbox />;
}

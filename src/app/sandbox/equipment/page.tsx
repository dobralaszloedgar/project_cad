// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

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

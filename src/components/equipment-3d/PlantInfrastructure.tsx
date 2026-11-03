// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import { useLayoutEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { Group } from "three";
import type { SystemExample } from "./system-geometry";
import { disposeEquipmentModel } from "./models";
import { createPlantInfrastructure } from "./plant-infrastructure";

export function PlantInfrastructure({ system }: { system: SystemExample }) {
  const mount = useRef<Group>(null);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    const parent = mount.current;
    if (!parent) return;
    const group = createPlantInfrastructure(system);
    parent.add(group);
    invalidate();
    return () => {
      parent.remove(group);
      disposeEquipmentModel(group);
    };
  }, [system, invalidate]);
  return <group ref={mount} />;
}

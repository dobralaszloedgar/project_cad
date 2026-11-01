"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import { Group } from "three";
import type { Kind } from "@/domain/schema";
import {
  createEquipmentModel,
  createSystemConnections,
  disposeEquipmentModel,
} from "./models";
import { OperationClock } from "./operation";
import { createProcessContents, createSystemFlow } from "./process-contents";
import type { SystemExample } from "./system-geometry";
import type { EquipmentCompositionColors } from "./composition-colors";
import type { EquipmentModelOptions } from "./column-layout";
import type { TrayHydraulicsResult } from "@/domain/equipment/tray-hydraulics";

export type MotionProps = {
  playing: boolean;
  speed: number;
  motionVisible: boolean;
  transparent: boolean;
};

export function EquipmentModel({
  kind,
  section = false,
  transparent,
  playing,
  speed,
  motionVisible,
  liquidColor,
  compositionColors,
  trayCount = 8,
  column,
  hydraulics,
  ...props
}: ThreeElements["group"] &
  MotionProps & {
    kind: Kind;
    section?: boolean;
    liquidColor?: string;
    compositionColors?: EquipmentCompositionColors;
    trayCount?: number;
    column?: EquipmentModelOptions["column"];
    hydraulics?: TrayHydraulicsResult;
  }) {
  const mount = useRef<Group>(null);
  const rotors = useRef<Group[]>([]);
  const clock = useMemo(() => new OperationClock(), []);
  const contents = useRef<ReturnType<typeof createProcessContents> | null>(
    null,
  );
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    const parent = mount.current;
    if (!parent) return;
    const model = createEquipmentModel(kind, section, transparent, {
      trayCount,
      column,
    });
    rotors.current = [];
    model.traverse((part) => {
      if (
        part instanceof Group &&
        typeof part.userData.angularSpeed === "number"
      ) {
        const angle = clock.uniform.value * part.userData.angularSpeed;
        part.rotation.set(
          part.userData.angularAxis === "x" ? angle : 0,
          part.userData.angularAxis === "x" ? 0 : angle,
          0,
        );
        rotors.current.push(part);
      }
    });
    parent.add(model);
    invalidate();
    return () => {
      parent.remove(model);
      rotors.current = [];
      disposeEquipmentModel(model);
    };
  }, [kind, section, transparent, invalidate, clock, trayCount, column]);
  // Composition edits replace only the fluid, preserving equipment, camera,
  // and animation time while the new material colors become visible.
  useLayoutEffect(() => {
    const parent = mount.current;
    if (!parent) return;
    const fluid = createProcessContents(
      kind,
      section || transparent,
      clock,
      liquidColor,
      { trayCount, column },
      compositionColors,
      hydraulics,
    );
    contents.current = fluid;
    parent.add(fluid.group);
    invalidate();
    return () => {
      parent.remove(fluid.group);
      disposeEquipmentModel(fluid.group);
      contents.current = null;
    };
  }, [
    kind,
    section,
    transparent,
    invalidate,
    clock,
    liquidColor,
    trayCount,
    column,
    hydraulics,
    compositionColors,
  ]);
  useFrame((_, delta) => {
    clock.advance(delta, playing, speed);
    for (const rotor of rotors.current) {
      const angle = clock.uniform.value * rotor.userData.angularSpeed;
      rotor.rotation.set(
        rotor.userData.angularAxis === "x" ? angle : 0,
        rotor.userData.angularAxis === "x" ? 0 : angle,
        0,
      );
    }
    contents.current?.update(motionVisible);
  });
  return (
    <group {...props}>
      <group ref={mount} />
    </group>
  );
}

export function SystemConnections({
  system,
  streamColors,
  transparent,
  section,
  playing,
  speed,
}: MotionProps & {
  system: SystemExample;
  streamColors?: Record<string, string>;
  section: boolean;
}) {
  const mount = useRef<Group>(null);
  const clock = useMemo(() => new OperationClock(), []);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    const parent = mount.current;
    if (!parent) return;
    const model = createSystemConnections(system, transparent, section);
    parent.add(model);
    invalidate();
    return () => {
      parent.remove(model);
      disposeEquipmentModel(model);
    };
  }, [system, transparent, section, invalidate]);
  useLayoutEffect(() => {
    const parent = mount.current;
    if (!parent) return;
    const fluid = createSystemFlow(system, clock, streamColors);
    fluid.visible = transparent || section;
    parent.add(fluid);
    invalidate();
    return () => {
      parent.remove(fluid);
      disposeEquipmentModel(fluid);
    };
  }, [system, streamColors, transparent, section, clock, invalidate]);
  useFrame((_, delta) => clock.advance(delta, playing, speed));
  return <group ref={mount} />;
}

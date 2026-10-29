"use client";

import { useMemo } from "react";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useLayoutEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { rackMembers, type SystemExample } from "./system-geometry";
import { equipmentEnvelope } from "./plant-routing";
import { disposeEquipmentModel } from "./models";

/** Shared steelwork gives the routed pipes a physical home. The access aisle
 * stays under the rack; individual concrete plinths follow equipment footprints. */
export function PlantInfrastructure({ system }: { system: SystemExample }) {
  const mount = useRef<Group>(null);
  const invalidate = useThree((state) => state.invalidate);
  const site = system.site;
  const members = useMemo(() => (site ? rackMembers(site.rack) : []), [site]);
  useLayoutEffect(() => {
    const parent = mount.current;
    if (!parent || !site) return;
    const group = new Group();
    const parts = members.map(({ center, size }) =>
      new BoxGeometry(...size).translate(...center),
    );
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    const steel = new Mesh(
      geometry,
      new MeshStandardMaterial({
        color: "#53666b",
        metalness: 0.72,
        roughness: 0.38,
      }),
    );
    steel.castShadow = true;
    steel.receiveShadow = true;
    group.add(steel);
    const concrete = new MeshStandardMaterial({
      color: "#cbd0ca",
      roughness: 0.94,
    });
    for (const item of system.equipment) {
      const box = equipmentEnvelope(item);
      const slab = new Mesh(
        new BoxGeometry(
          box.max[0] - box.min[0] + 0.24,
          0.12,
          box.max[2] - box.min[2] + 0.24,
        ),
        concrete,
      );
      slab.position.set(
        (box.min[0] + box.max[0]) / 2,
        -0.06,
        (box.min[2] + box.max[2]) / 2,
      );
      slab.receiveShadow = true;
      group.add(slab);
    }
    const aisle = new Mesh(
      new BoxGeometry(
        site.rack.end - site.rack.start + 1,
        0.035,
        site.rack.halfWidth * 2 - 0.4,
      ),
      new MeshStandardMaterial({ color: "#dce0da", roughness: 1 }),
    );
    aisle.position.set((site.rack.start + site.rack.end) / 2, -0.06, 0);
    aisle.receiveShadow = true;
    group.add(aisle);
    parent.add(group);
    invalidate();
    return () => {
      parent.remove(group);
      disposeEquipmentModel(group);
    };
  }, [members, site, system, invalidate]);
  return <group ref={mount} />;
}

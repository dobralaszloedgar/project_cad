"use client";

import { useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { MotionValue } from "motion/react";
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  TubeGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { EquipmentModel } from "@/components/equipment-3d/EquipmentModel";
import { disposeEquipmentModel } from "@/components/equipment-3d/models";
import { pipeCurve, type Point } from "@/components/equipment-3d/operation";
import type { Kind } from "@/domain/schema";
import { reveal } from "./landing-system";

type Unit = {
  id: string;
  kind: Kind;
  position: Point;
  scale: number;
  color: string;
  turn?: 0 | 1 | 2 | 3;
  distant?: boolean;
};

// Two side aisles recede into the scene, leaving the central sightline open. These are the same operating equipment
// models used in the workspace, not flat scenery or invented vessel silhouettes.
const units: Unit[] = [
  {
    id: "rear-reactor",
    kind: "PBR",
    position: [-12, 0, -22],
    scale: 2.1,
    color: "#8f8752",
  },
  {
    id: "rear-column",
    kind: "Distillation",
    position: [12, 0, -27],
    scale: 1.9,
    color: "#329e9b",
  },
  {
    id: "far-column",
    kind: "Distillation",
    position: [-17, 0, -44],
    scale: 2.3,
    color: "#438f8d",
    distant: true,
  },
  {
    id: "far-reactor",
    kind: "PBR",
    position: [18, 0, -48],
    scale: 2.6,
    color: "#a08a63",
    distant: true,
  },
];

/** Repeated structural details are merged by finish, keeping the background cheap. */
function createArchitecture() {
  const group = new Group();
  const batches: Record<string, BufferGeometry[]> = {
    steel: [],
    rail: [],
    pipe: [],
    light: [],
  };
  const box = (position: Point, size: Point, finish = "steel") => {
    const geometry = new BoxGeometry(...size).toNonIndexed();
    geometry.translate(...position);
    batches[finish].push(geometry);
  };
  const pipe = (points: Point[], radius: number, finish = "pipe") => {
    const geometry = new TubeGeometry(
      pipeCurve(points),
      points.length * 18,
      radius,
      10,
      false,
    ).toNonIndexed();
    batches[finish].push(geometry);
  };
  // A modeled hall replaces the photograph: floor, steel bays, service walls
  // and roof beams all share the equipment's perspective and lighting.
  for (const side of [-1, 1]) {
    for (const z of [10, -2, -14, -26, -38, -50, -62]) {
      const x = side * 19;
      box([x, 12, z], [0.5, 24, 0.7]);
      box([x + side * 0.5, 12, z - 5.7], [0.32, 24, 11.4]);
      for (const y of [5.5, 11, 17.5])
        box([x - side * 0.5, y, z - 5.7], [0.5, 0.35, 11.4]);
      for (let lane = 0; lane < 3; lane++) {
        const pipeX = side * (17.9 - lane * 0.48);
        pipe(
          [
            [pipeX, 0.2, z],
            [pipeX, 16 - lane, z],
            [pipeX, 16 - lane, z - 10],
          ],
          0.13 + lane * 0.04,
        );
      }
      box([side * 15.5, 0.15, z - 4], [4.5, 0.3, 9.5]);
      for (let slat = 0; slat < 24; slat++)
        box(
          [side * 15.5, 0.34, z + 0.5 - slat * 0.4],
          [4.5, 0.035, 0.045],
          "rail",
        );
      box([side * 17.8, 8.5, z - 3], [0.13, 0.16, 1.5], "light");
    }
    for (const x of [side * 5.5, side * 10.8])
      box([x, -0.2, -25], [0.045, 0.035, 92], "rail");
  }
  for (const z of [-8, -30, -52]) {
    box([0, 19, z], [38, 0.65, 0.45]);
    box([0, 21.5, z], [38, 0.3, 0.3]);
    for (let x = -18; x <= 18; x += 3) box([x, 20.3, z], [0.16, 2.5, 0.16]);
  }
  box([0, 12, -71], [40, 24, 0.5]);
  for (let x = -15; x <= 15; x += 5) {
    box([x, 11, -70.6], [0.25, 22, 0.25], "rail");
    box([x, 12, -70.4], [1.5, 15, 0.04], "light");
  }
  // Crosswalks have actual grated decks, toe boards, handrails and supporting legs.
  for (const [z, height] of [[-46, 11.2]]) {
    for (const x of [-14, -7, 7, 14]) {
      box([x, height / 2, z], [0.24, height, 0.3]);
      box([x, 0.12, z], [0.8, 0.24, 0.8]);
    }
    for (const edge of [-1, 1]) {
      box([0, height, z + edge], [30, 0.3, 0.2]);
      box([0, height + 0.18, z + edge], [30, 0.22, 0.08], "rail");
      for (const rail of [0.65, 1.25])
        box([0, height + rail, z + edge], [30, 0.07, 0.07], "rail");
      for (let x = -15; x <= 15; x += 2.5)
        box([x, height + 0.68, z + edge], [0.065, 1.35, 0.065], "rail");
    }
    for (let x = -15; x <= 15; x += 0.3)
      box([x, height + 0.06, z], [0.055, 0.1, 2]);
    for (const x of [-12, 0, 12]) {
      box([x, height - 0.75, z], [0.05, 1.25, 0.05]);
      const housing = new CylinderGeometry(0.12, 0.42, 0.18, 16).toNonIndexed();
      housing.translate(x, height - 1.4, z);
      batches.pipe.push(housing);
      box([x, height - 1.5, z], [0.48, 0.04, 0.48], "light");
    }
  }
  // Longitudinal pipe rack: true perspective and occlusion as the camera travels.
  for (const side of [-1, 1]) {
    for (const z of [-22, -34, -46]) {
      box([side * 16, 5.5, z], [0.22, 11, 0.22]);
      box([side * 16, 10.1, z], [3.4, 0.2, 0.2]);
    }
    for (let lane = 0; lane < 3; lane++) {
      const x = side * (15 + lane * 0.7);
      pipe(
        [
          [x, 1, -22],
          [x, 10.4, -22],
          [x, 10.4, -50],
        ],
        0.22 + lane * 0.025,
      );
    }
  }
  const materials: Record<string, MeshStandardMaterial> = {
    steel: new MeshStandardMaterial({
      color: "#29404a",
      metalness: 0.8,
      roughness: 0.38,
    }),
    rail: new MeshStandardMaterial({
      color: "#6c7463",
      metalness: 0.65,
      roughness: 0.32,
    }),
    pipe: new MeshStandardMaterial({
      color: "#507079",
      metalness: 0.8,
      roughness: 0.28,
    }),
    light: new MeshStandardMaterial({
      color: "#ffe7b0",
      emissive: "#ffc774",
      emissiveIntensity: 3,
      toneMapped: false,
    }),
  };
  for (const [finish, geometries] of Object.entries(batches)) {
    const geometry = mergeGeometries(geometries)!;
    group.add(new Mesh(geometry, materials[finish]));
    geometries.forEach((item) => item.dispose());
  }
  group.name = "background-catwalks-and-pipe-racks";
  return group;
}

export default function IndustrialBackdrop({
  progress,
  playing,
}: {
  progress: MotionValue<number>;
  playing: boolean;
}) {
  const root = useRef<Group>(null);
  const structure = useRef<Group>(null);
  const finishes = useRef<{ material: Material; opacity: number }[]>([]);
  const originals = useRef(new WeakMap<Material, number>());
  const { size, gl, invalidate } = useThree();
  const compact = size.width < 700;
  const visibleUnits = units.filter((item) => !compact || !item.distant);
  useLayoutEffect(() => {
    const parent = structure.current;
    if (!parent) return;
    const model = createArchitecture();
    parent.add(model);
    invalidate();
    return () => {
      parent.remove(model);
      disposeEquipmentModel(model);
    };
  }, [invalidate]);
  useLayoutEffect(() => {
    const seen = new Set<Material>();
    finishes.current = [];
    root.current?.updateMatrixWorld(true);
    root.current?.traverse((part) => {
      if (!(part instanceof Mesh)) return;
      for (const material of Array.isArray(part.material)
        ? part.material
        : [part.material]) {
        if (seen.has(material)) continue;
        seen.add(material);
        const original = originals.current.get(material);
        finishes.current.push({
          material,
          opacity: original ?? material.opacity,
        });
        if (original !== undefined) continue;
        originals.current.set(material, material.opacity);
        material.transparent = true;
        if (material instanceof MeshStandardMaterial) {
          // Keep the catalog silhouettes and materials, with atmospheric distance.
          const distance = Math.max(0, -part.matrixWorld.elements[14] - 10);
          material.color.lerp(
            new Color("#163b4c"),
            Math.min(0.58, 0.18 + distance * 0.008),
          );
          material.color.multiplyScalar(0.48);
          material.envMapIntensity *= 0.22;
          material.roughness = Math.max(0.44, material.roughness);
        }
        material.needsUpdate = true;
      }
    });
    gl.domElement.setAttribute(
      "data-background-equipment",
      String(visibleUnits.length),
    );
    invalidate();
  }, [compact, gl, invalidate, visibleUnits.length]);
  useFrame(() => {
    const p = progress.get();
    const alpha = 1 - reveal(p, 0.14, 0.32);
    if (root.current) root.current.visible = alpha > 0.001;
    for (const finish of finishes.current)
      finish.material.setValues({ opacity: finish.opacity * alpha });
  });
  return (
    <group ref={root} name="live-industrial-background">
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.3, -22]}
        receiveShadow
      >
        <planeGeometry args={[140, 160]} />
        <meshPhysicalMaterial
          color="#0a202a"
          metalness={0.6}
          roughness={0.32}
          clearcoat={0.45}
          clearcoatRoughness={0.3}
        />
      </mesh>
      <group ref={structure} />
      {visibleUnits.map((unit) => (
        <EquipmentModel
          key={unit.id}
          name={`background-${unit.id}`}
          kind={unit.kind}
          position={unit.position}
          scale={unit.scale}
          rotation={[0, ((unit.turn ?? 0) * Math.PI) / 2, 0]}
          trayCount={6}
          transparent
          section={false}
          playing={playing}
          speed={1.2}
          motionVisible
          liquidColor={unit.color}
        />
      ))}
    </group>
  );
}

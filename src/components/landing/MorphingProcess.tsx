"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { FloorGrid } from "../graphics/FloorGrid";
import {
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from "three";
import { Line2NodeMaterial } from "three/webgpu";
import { Line2 } from "three/addons/lines/webgpu/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import type { MotionValue } from "motion/react";
import {
  EquipmentModel,
  SystemConnections,
} from "@/components/equipment-3d/EquipmentModel";
import { pipeCurve } from "@/components/equipment-3d/operation";
import type { SystemExample } from "@/components/equipment-3d/system-geometry";
import { rackMembers } from "@/components/equipment-3d/system-geometry";
import { reveal } from "./landing-system";
import { tourWeights } from "./landing-motion";
import { ROUTE_SAMPLES, unitUnfold } from "./landing-construction";
import type { CadBridge } from "./CadWorkbench";

/** The fixed worksheet supplies the paths that rise into the 3D pipes. */
function RisingRoutes({
  system,
  progress,
  bridge,
}: {
  system: SystemExample;
  progress: MotionValue<number>;
  bridge: CadBridge;
}) {
  const root = useRef<Group>(null);
  const strokes = useRef<
    {
      id: string;
      line: Line2;
      physical: ReturnType<ReturnType<typeof pipeCurve>["getSpacedPoints"]>;
    }[]
  >([]);
  useLayoutEffect(() => {
    const group = root.current!;
    strokes.current = system.streams.map((stream) => {
      const physical = pipeCurve(stream.points).getSpacedPoints(ROUTE_SAMPLES);
      const geometry = new LineGeometry().setPositions(
        physical.flatMap((point) => point.toArray()),
      );
      // The shared renderer uses node materials on both graphics backends.
      const material = new Line2NodeMaterial({
        color: stream.color,
        linewidth: 1.8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
        fog: false,
        alphaToCoverage: true,
      });
      const line = new Line2(geometry, material);
      line.frustumCulled = false;
      group.add(line);
      return { id: stream.id, line, physical };
    });
    return () => {
      for (const { line } of strokes.current) {
        line.geometry.dispose();
        line.material.dispose();
      }
      strokes.current = [];
      group.clear();
    };
  }, [system]);
  useFrame(() => {
    const p = progress.get();
    if (root.current) root.current.visible = p > 0.55 && p < 0.86;
    if (p <= 0.55 || p >= 0.86) return;
    const blend = reveal(p, 0.57, 0.8);
    const lift = reveal(p, 0.55, 0.87);
    for (const { id, line, physical } of strokes.current) {
      const drawing = bridge.routes.get(id);
      if (!drawing) continue;
      const starts = line.geometry.attributes.instanceStart;
      const ends = line.geometry.attributes.instanceEnd;
      for (let i = 0; i < ROUTE_SAMPLES; i++) {
        for (const [attribute, point] of [
          [starts, i],
          [ends, i + 1],
        ] as const) {
          const a = drawing[point],
            b = physical[point];
          attribute.setXYZ(
            i,
            a.x + (b.x - a.x) * blend,
            a.y + (b.y * lift - a.y) * blend,
            a.z + (b.z - a.z) * blend,
          );
        }
      }
      // These buffers belong to Three.js, not React state.
      // eslint-disable-next-line react-hooks/immutability
      starts.needsUpdate = true;
      ends.needsUpdate = true;
      line.material.setValues({
        opacity: reveal(p, 0.56, 0.62) * (1 - reveal(p, 0.79, 0.86)),
      });
    }
  });
  return <group ref={root} />;
}

/** A rigid planar assembly unfolds vertically without swapping scenes or routes. */
export default function MorphingProcess({
  system,
  progress,
  bridge,
  playing,
}: {
  system: SystemExample;
  progress: MotionValue<number>;
  bridge: CadBridge;
  playing: boolean;
}) {
  const stage = useRef<Group>(null);
  const ground = useRef<Group>(null);
  const machinery = useRef<Group>(null);
  const pipes = useRef<Group>(null);
  const rack = useRef<Group>(null);
  const equipment = useRef<(Group | null)[]>([]);
  const surface = useRef<MeshBasicMaterial>(null);
  const materials = useRef<
    {
      material: Material;
      opacity: number;
      unit: number;
    }[]
  >([]);
  const originals = useRef(new WeakMap<Material, number>());
  const previousProgress = useRef(-1);
  const members = useMemo(() => rackMembers(system.site!.rack), [system]);
  useLayoutEffect(() => {
    previousProgress.current = -1;
    const seen = new Set<Material>();
    materials.current = [];
    const collect = (group: Group | null, unit: number) =>
      group?.traverse((part) => {
        if (!(part instanceof Mesh)) return;
        const list = Array.isArray(part.material)
          ? part.material
          : [part.material];
        for (const material of list) {
          if (seen.has(material)) continue;
          seen.add(material);
          const opacity = originals.current.get(material) ?? material.opacity;
          originals.current.set(material, opacity);
          materials.current.push({ material, opacity, unit });
          // Keep steel in the opaque depth pass. Alpha hashing allows the short
          // reveal/focus fades without making the whole plant glass-like or
          // sorting hundreds of overlapping metal surfaces as transparency.
          material.alphaHash = true;
          material.transparent = false;
          material.forceSinglePass = true;
          if (material instanceof MeshStandardMaterial) {
            material.roughness = Math.max(0.42, material.roughness);
            material.envMapIntensity = 0.65;
          }
          material.needsUpdate = true;
        }
      });
    equipment.current.forEach((group, index) => collect(group, index));
    collect(pipes.current, -2);
    collect(machinery.current, -1);
  }, []);
  useFrame(() => {
    const p = progress.get();
    if (p === previousProgress.current) return;
    previousProgress.current = p;
    const lift = reveal(p, 0.55, 0.87);
    const weights = tourWeights(p);
    const emphasis = (index: number) => {
      const focus = ["heater", "reactor", "column"].indexOf(
        system.equipment[index].id,
      );
      return weights[0] + (focus >= 0 ? weights[focus + 1] : 0);
    };
    if (stage.current) stage.current.visible = p > 0.17;
    if (ground.current) ground.current.visible = lift > 0.003;
    if (machinery.current) {
      machinery.current.visible = lift > 0.003;
      machinery.current.scale.y = Math.max(0.003, lift);
      equipment.current.forEach((group, index) => {
        if (!group) return;
        const height = unitUnfold(p, index).height;
        group.visible = height > 0.001 && emphasis(index) > 0.002;
        group.scale.set(1, Math.max(0.001, height) / Math.max(0.003, lift), 1);
      });
      for (const item of materials.current) {
        const opacity =
          item.unit >= 0
            ? unitUnfold(p, item.unit).solid * emphasis(item.unit)
            : item.unit === -2
              ? reveal(p, 0.77, 0.85) * weights[0]
              : reveal(p, 0.68, 0.8) * weights[0];
        // Three.js materials are owned by this scene, outside React state.
        // eslint-disable-next-line react-hooks/immutability
        item.material.opacity = item.opacity * opacity;
      }
      if (pipes.current) pipes.current.visible = weights[0] > 0.002;
      if (rack.current) rack.current.visible = weights[0] > 0.002;
    }
    if (surface.current) surface.current.opacity = reveal(p, 0.55, 0.7) * 0.9;
  });
  return (
    <group ref={stage}>
      <group ref={ground}>
        <mesh position={[0, -0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[200, 200]} />
          <meshBasicMaterial
            ref={surface}
            color="#f5f7f3"
            toneMapped={false}
            transparent
            opacity={0}
          />
        </mesh>
        <FloorGrid
          args={[28, 16]}
          position={[0.3, -0.12, -1.3]}
          cellSize={0.5}
          sectionSize={2.5}
          cellThickness={0.45}
          sectionThickness={0.7}
          cellColor="#dce4dd"
          sectionColor="#b9cbbd"
          fadeDistance={90}
          fadeStrength={1}
        />
      </group>
      <RisingRoutes system={system} progress={progress} bridge={bridge} />
      <group ref={machinery}>
        {system.equipment.map((item, index) => (
          <group
            key={item.id}
            ref={(group) => {
              equipment.current[index] = group;
            }}
          >
            <EquipmentModel
              kind={item.kind}
              position={item.position}
              rotation={[0, ((item.turn ?? 0) * Math.PI) / 2, 0]}
              trayCount={8}
              transparent={false}
              section={["heater", "reactor", "column"].includes(item.id)}
              showContents={false}
              playing={playing}
              speed={1.5}
              motionVisible
              liquidColor={item.color}
            />
          </group>
        ))}
        <group ref={pipes}>
          <SystemConnections
            system={system}
            transparent={false}
            section={false}
            playing={playing}
            speed={1.5}
            motionVisible
          />
        </group>
        <group ref={rack}>
          {members.map(({ center, size }, i) => {
            const longest = size.indexOf(Math.max(...size));
            const slender = size.map((n, axis) =>
              axis === longest ? n : n * 0.4,
            ) as [number, number, number];
            return (
              <mesh key={i} position={center}>
                <boxGeometry args={slender} />
                <meshStandardMaterial
                  color="#75969d"
                  metalness={0.35}
                  roughness={0.6}
                />
              </mesh>
            );
          })}
          <mesh position={[0.3, -0.25, -1.3]}>
            <boxGeometry args={[28, 0.2, 16]} />
            <meshBasicMaterial color="#eef2ed" />
          </mesh>
        </group>
      </group>
    </group>
  );
}

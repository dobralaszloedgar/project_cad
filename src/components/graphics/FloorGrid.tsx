"use client";

import { useEffect, useMemo } from "react";
import { DoubleSide } from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  cameraPosition,
  color,
  float,
  mix,
  positionLocal,
  positionWorld,
  vec3,
} from "three/tsl";

export function FloorGrid({
  args = [160, 160],
  position = [0, -0.03, 0],
  cellSize = 0.5,
  sectionSize = 2.5,
  cellThickness = 0.5,
  sectionThickness = 0.6,
  cellColor = "#d8dfda",
  sectionColor = "#c4cec7",
  fadeDistance = 40,
  fadeStrength = 2,
}: {
  args?: [number, number];
  position?: [number, number, number];
  cellSize?: number;
  sectionSize?: number;
  cellThickness?: number;
  sectionThickness?: number;
  cellColor?: string;
  sectionColor?: string;
  fadeDistance?: number;
  fadeStrength?: number;
}) {
  const material = useMemo(() => {
    const grid = (size: number, thickness: number) => {
      const p = positionLocal.xy.div(size);
      const line = p
        .sub(0.5)
        .fract()
        .sub(0.5)
        .abs()
        .div(p.fwidth().max(0.00001));
      return float(1).sub(
        line.x
          .min(line.y)
          .add(1 - thickness)
          .min(1),
      );
    };
    const cell = grid(cellSize, cellThickness);
    const section = grid(sectionSize, sectionThickness);
    const from = vec3(cameraPosition.x, positionWorld.y, cameraPosition.z);
    const fade = float(1)
      .sub(from.distance(positionWorld).div(fadeDistance).min(1))
      .pow(fadeStrength);
    const result = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    result.colorNode = mix(
      color(cellColor),
      color(sectionColor),
      section.mul(sectionThickness).min(1),
    );
    result.opacityNode = cell
      .add(section)
      .mul(fade)
      .mul(mix(0.75, 1, section));
    return result;
  }, [
    cellSize,
    sectionSize,
    cellThickness,
    sectionThickness,
    cellColor,
    sectionColor,
    fadeDistance,
    fadeStrength,
  ]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
    >
      <planeGeometry args={args} />
    </mesh>
  );
}

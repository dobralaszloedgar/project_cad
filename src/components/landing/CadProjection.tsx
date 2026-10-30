"use client";

import { useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Matrix4, Vector3 } from "three";
import { CAD_SCALE, CAD_CENTER_Z } from "./landing-construction";
import type { CadBridge } from "./CadWorkbench";

/** Project the real DOM canvas with the same camera as the WebGL plant.
 * React retains ownership of its DOM; no secondary React root or raster capture. */
export default function CadProjection({ bridge }: { bridge: CadBridge }) {
  const { camera, size } = useThree();
  const plane = useMemo(
    () =>
      new Matrix4()
        .makeRotationX(-Math.PI / 2)
        .scale(new Vector3(1 / CAD_SCALE, 1 / CAD_SCALE, 1 / CAD_SCALE))
        .setPosition(0, 0.18, CAD_CENTER_Z),
    [],
  );
  useFrame(() => {
    const viewport = bridge.viewport.current;
    const cameraLayer = bridge.camera.current;
    const surface = bridge.surface.current;
    if (!viewport || !cameraLayer || !surface) return;
    // CSS has a downward Y axis; flip the camera row and the plane column.
    const view = camera.matrixWorldInverse.elements.map(
      (n, i) => n * (i % 4 === 1 ? -1 : 1),
    );
    const model = plane.elements.map((n, i) => n * (i >= 4 && i < 8 ? -1 : 1));
    const focalLength = (camera.projectionMatrix.elements[5] * size.height) / 2;
    viewport.style.setProperty("perspective", `${focalLength}px`);
    cameraLayer.style.setProperty(
      "transform",
      `translateZ(${focalLength}px) matrix3d(${view.join(",")}) translate(${size.width / 2}px,${size.height / 2}px)`,
    );
    surface.style.setProperty(
      "transform",
      `translate(-50%,-50%) matrix3d(${model.join(",")})`,
    );
  });
  return null;
}

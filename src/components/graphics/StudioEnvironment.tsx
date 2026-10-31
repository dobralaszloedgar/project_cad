"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal, useThree } from "@react-three/fiber";
import { CubeCamera, HalfFloatType, Scene } from "three";
import { CubeRenderTarget } from "three/webgpu";
import { sceneRenderer } from "./renderer";

/** Bake the studio lights once with a render target supported by both backends. */
export function StudioEnvironment({
  children,
  resolution = 128,
  intensity = 0.8,
}: {
  children: ReactNode;
  resolution?: number;
  intensity?: number;
}) {
  const get = useThree((state) => state.get);
  const [studio] = useState(() => new Scene());
  useLayoutEffect(() => {
    const { gl, scene, invalidate } = get();
    const target = new CubeRenderTarget(resolution, { type: HalfFloatType });
    const camera = new CubeCamera(0.1, 1000, target);
    camera.update(sceneRenderer(gl), studio);
    const previousMap = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    scene.environment = target.texture;
    scene.environmentIntensity = intensity;
    invalidate();
    return () => {
      scene.environment = previousMap;
      scene.environmentIntensity = previousIntensity;
      target.dispose();
    };
  }, [get, studio, resolution, intensity]);
  return createPortal(children, studio);
}

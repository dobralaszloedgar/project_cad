// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import {
  CubeCamera,
  DoubleSide,
  HalfFloatType,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene,
} from "three";
import { CubeRenderTarget, type WebGPURenderer } from "three/webgpu";

export const STUDIO_AMBIENT = 0.65;
export const STUDIO_LIGHTS: {
  position: [number, number, number];
  intensity: number;
  color: string;
}[] = [
  { position: [5, 10, 6], intensity: 2.7, color: "#fff8ee" },
  { position: [-6, 4, -4], intensity: 1.8, color: "#dcebf0" },
];
export const STUDIO_LIGHTFORMERS: {
  position: [number, number, number];
  scale: [number, number, number];
  intensity: number;
  color: string;
  target: [number, number, number];
}[] = [
  {
    position: [-4, 4, 2],
    scale: [5, 9, 1],
    intensity: 3,
    color: "#ffffff",
    target: [0, 1, 0],
  },
  {
    position: [6, 3, 4],
    scale: [3, 7, 1],
    intensity: 4,
    color: "#e8f3f1",
    target: [0, 1, 0],
  },
  {
    position: [0, 6, -4],
    scale: [9, 4, 1],
    intensity: 3,
    color: "#fff2dd",
    target: [0, 0, 0],
  },
];

/** Bake the editor's exact lightformer recipe for the non-R3F landing renderer. */
export function createStudioEnvironment(
  renderer: WebGPURenderer,
  resolution = 128,
) {
  const studio = new Scene();
  for (const light of STUDIO_LIGHTFORMERS) {
    const material = new MeshBasicMaterial({
      color: light.color,
      side: DoubleSide,
      toneMapped: false,
    });
    material.color.multiplyScalar(light.intensity);
    const mesh = new Mesh(new PlaneGeometry(1, 1), material);
    mesh.position.fromArray(light.position);
    mesh.scale.fromArray(light.scale);
    mesh.lookAt(...light.target);
    studio.add(mesh);
  }
  const target = new CubeRenderTarget(resolution, { type: HalfFloatType });
  new CubeCamera(0.1, 1000, target).update(renderer, studio);
  studio.traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose();
      (object.material as MeshBasicMaterial).dispose();
    }
  });
  return target;
}

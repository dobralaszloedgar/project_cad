// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import {
  DataTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  RGBAFormat,
} from "three";

export const DEFAULT_EQUIPMENT_ACCENT = "#286e5c";

/** The tower's brushed finish is shared by equipment and connecting pipework.
 * Each model owns its grain texture, which disposeEquipmentModel releases. */
export function finishEquipmentSteel(model: Group) {
  const steel: Mesh[] = [];
  model.traverse((part) => {
    if (
      part instanceof Mesh &&
      part.material instanceof MeshStandardMaterial &&
      !part.material.transparent &&
      ["steel", "satin"].includes(part.userData.finish)
    )
      steel.push(part);
  });
  if (!steel.length) return;

  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const grain = Math.sin(y * 93.17 + 0.6 * Math.sin(x * 0.17)) * 0.5 + 0.5;
      const value = Math.round(195 + grain * 40);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
  const grain = new DataTexture(data, size, size, RGBAFormat);
  grain.wrapS = grain.wrapT = RepeatWrapping;
  grain.repeat.set(3, 5);
  grain.needsUpdate = true;

  for (const part of steel) {
    const material = part.material as MeshStandardMaterial;
    material.metalness = 0.88;
    material.roughness = 0.36;
    material.roughnessMap = grain;
    material.bumpMap = grain;
    material.bumpScale = 0.0006;
    material.envMapIntensity = 1.05;
  }
}

/** Update only painted hardware; fluid colors and clear shells remain independent. */
export function applyEquipmentAccent(model: Group, color: string) {
  model.traverse((part) => {
    if (
      part instanceof Mesh &&
      part.userData.finish === "accent" &&
      part.material instanceof MeshStandardMaterial &&
      !part.material.transparent
    )
      part.material.color.set(color);
  });
}

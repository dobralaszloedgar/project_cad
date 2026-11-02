// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import {
  CatmullRomCurve3,
  MathUtils,
  Matrix4,
  PerspectiveCamera,
  Vector3,
} from "three";
import { equipmentEnvelope } from "../equipment-3d/plant-routing";
import type { SystemExample } from "../equipment-3d/system-geometry";
import {
  CAD_WIDTH,
  CAD_HEIGHT,
  CAD_SCALE,
  CAD_CENTER_Z,
} from "./landing-construction";
import { reveal } from "./landing-motion";

/** Reuse the camera, bounds and curve storage throughout the continuous tour. */
export function createProcessCamera(system: SystemExample) {
  const camera = new PerspectiveCamera(38, 1, 0.1, 240);
  const bounds: Vector3[] = [];
  for (const item of system.equipment) {
    const box = equipmentEnvelope(item);
    for (const x of [box.min[0], box.max[0]])
      for (const y of [box.min[1], box.max[1]])
        for (const z of [box.min[2], box.max[2]])
          bounds.push(new Vector3(x, y, z));
  }
  for (const x of [-CAD_WIDTH / CAD_SCALE / 2, CAD_WIDTH / CAD_SCALE / 2])
    for (const z of [-CAD_HEIGHT / CAD_SCALE / 2, CAD_HEIGHT / CAD_SCALE / 2])
      bounds.push(new Vector3(x, 0, z + CAD_CENTER_Z));
  const target = new Vector3(),
    direction = new Vector3();
  const right = new Vector3(),
    up = new Vector3(),
    offset = new Vector3();
  const positions = Array.from({ length: 4 }, () => new Vector3());
  const targets = [
    new Vector3(),
    new Vector3(-4, 1.2, -2),
    new Vector3(-0.5, 1.8, -2),
    new Vector3(6.5, 3.9, -2),
  ];
  const positionCurve = new CatmullRomCurve3(positions);
  const targetCurve = new CatmullRomCurve3(targets);
  const update = (width: number, height: number, progress: number) => {
    if (camera.aspect !== width / height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    const unfold = reveal(progress, 0.55, 0.87);
    const orbit = reveal(progress, 0.55, 0.94);
    const portrait = width < height;
    target.set(
      0.3,
      2.15 * unfold,
      MathUtils.lerp(CAD_CENTER_Z + (portrait ? 2.6 : 1.1), -1.3, unfold),
    );
    const angle = 0.32 * orbit;
    const elevation = Math.PI / 2 - 0.001 - orbit * 1.08;
    direction.set(
      Math.sin(angle) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(angle) * Math.cos(elevation),
    );
    right.set(0, 1, 0).cross(direction).normalize();
    up.copy(direction).cross(right).normalize();
    const vertical = Math.tan(MathUtils.degToRad(camera.fov) / 2);
    const horizontal = (vertical * width) / height;
    let fit = 0;
    for (const point of bounds) {
      offset.set(point.x, point.y * unfold, point.z).sub(target);
      fit = Math.max(
        fit,
        offset.dot(direction) + Math.abs(offset.dot(right)) / horizontal,
        offset.dot(direction) + Math.abs(offset.dot(up)) / vertical,
      );
    }
    camera.position
      .copy(target)
      .addScaledVector(
        direction,
        fit * MathUtils.lerp(portrait ? 1.12 : 1.38, 1.12, unfold),
      );
    const tourProgress = reveal(progress, 1, 1.65);
    if (tourProgress > 0) {
      targets[0].copy(target);
      positions[0].copy(camera.position);
      positions[1].set(-0.7, 3.8, 4.5);
      positions[2].set(-7.6, 4.5, -6.5);
      positions[3].set(13.6, 6.4, -10.8);
      // Pull back from the inspection path so neighboring units and connections
      // remain in the composition, especially on portrait screens.
      for (let i = 1; i < positions.length; i++)
        positions[i]
          .sub(targets[i])
          .multiplyScalar(portrait ? 2.5 : 2)
          .add(targets[i]);
      positionCurve.getPoint(tourProgress, camera.position);
      targetCurve.getPoint(tourProgress, target);
    }
    camera.lookAt(target);
    camera.updateMatrixWorld();
  };
  return { camera, update };
}

export function processCamera(
  system: SystemExample,
  width: number,
  height: number,
  progress: number,
) {
  const rig = createProcessCamera(system);
  rig.update(width, height, progress);
  return rig.camera;
}

/** Project the worksheet onto the same live camera as the equipment and pipes. */
export function worksheetProjection(
  camera: PerspectiveCamera,
  width: number,
  height: number,
) {
  const plane = new Matrix4().set(
    1 / CAD_SCALE,
    0,
    0,
    -CAD_WIDTH / CAD_SCALE / 2,
    0,
    0,
    1,
    0.18,
    0,
    1 / CAD_SCALE,
    0,
    CAD_CENTER_Z - CAD_HEIGHT / CAD_SCALE / 2,
    0,
    0,
    0,
    1,
  );
  const m = new Matrix4()
    .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    .multiply(plane).elements;
  return [
    (width / 2) * (m[0] + m[3]),
    (height / 2) * (m[3] - m[1]),
    m[3],
    (width / 2) * (m[4] + m[7]),
    (height / 2) * (m[7] - m[5]),
    m[7],
    (width / 2) * (m[12] + m[15]),
    (height / 2) * (m[15] - m[13]),
    m[15],
  ].map((value) => Number(value.toFixed(8)));
}

export function worksheetTransform(projection: number[]) {
  const [a, b, g, c, d, h, e, f, i] = projection;
  return `matrix3d(${[a, b, 0, g, c, d, 0, h, 0, 0, 1, 0, e, f, 0, i].join(",")})`;
}

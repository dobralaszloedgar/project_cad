// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { CircleGeometry, DoubleSide, Mesh, PlaneGeometry } from "three";
import { MeshBasicNodeMaterial, type Node } from "three/webgpu";
import {
  Fn,
  If,
  float,
  materialReference,
  mix,
  normalLocal,
  positionLocal,
  transformNormalToView,
  vec3,
} from "three/tsl";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { OperationClock } from "./operation";

const hash = Fn(([p]: [Node<"vec3">]) =>
  p
    .dot(vec3(127.1, 311.7, 74.7))
    .sin()
    .mul(43758.5453)
    .fract(),
);
const noise = Fn(([p]: [Node<"vec3">]) => {
  const cell = p.floor();
  const f = p.fract();
  const w = f.mul(f).mul(float(3).sub(f.mul(2)));
  return mix(
    mix(
      mix(hash(cell), hash(cell.add(vec3(1, 0, 0))), w.x),
      mix(hash(cell.add(vec3(0, 1, 0))), hash(cell.add(vec3(1, 1, 0))), w.x),
      w.y,
    ),
    mix(
      mix(hash(cell.add(vec3(0, 0, 1))), hash(cell.add(vec3(1, 0, 1))), w.x),
      mix(hash(cell.add(vec3(0, 1, 1))), hash(cell.add(vec3(1, 1, 1))), w.x),
      w.y,
    ),
    w.z,
  );
});

// One shared node graph works with both WebGPU and the WebGL fallback. The
// positive time offset carries the cloud field toward -X, against tube flow.
const steamOpacity = Fn(() => {
  const time = materialReference(
    "userData.clock.value",
    "float",
  ) as unknown as Node<"float">;
  const p = positionLocal
    .mul(vec3(3.4, 1.8, 1.8))
    .add(vec3(time.mul(1.15), 0, 0));
  const curl = vec3(
    0,
    p.x.mul(0.7).add(p.z).sin().mul(0.36),
    p.x.mul(0.55).sub(p.y).cos().mul(0.3),
  );
  const drift = p.add(curl);
  const density = noise(drift)
    .mul(0.7)
    .add(noise(drift.mul(2.13)).mul(0.3))
    .smoothstep(0.38, 0.68);
  const edge = float(1)
    .sub(positionLocal.yz.length().smoothstep(0.4, 0.49))
    .mul(float(1).sub(positionLocal.x.abs().smoothstep(0.83, 0.99)));
  // Keep steam out of the tube bores and soften it around their clear walls.
  const nearestTube = positionLocal.yz.div(0.16).round().clamp(-2, 2).mul(0.16);
  const clearance = float(1).toVar();
  If(nearestTube.dot(nearestTube).lessThan(0.175), () => {
    clearance.assign(
      positionLocal.yz.sub(nearestTube).length().smoothstep(0.034, 0.05),
    );
  });
  // Crossed slices make a volume from every camera angle. Fade grazing slices
  // so their edges never become bright stripes when orbiting the heater.
  const facing = transformNormalToView(normalLocal).z.abs().pow(3);
  return density
    .mul(edge)
    .mul(clearance)
    .mul(facing)
    .mul(materialReference("opacity", "float") as unknown as Node<"float">);
})();

const steamColor = mix(
  vec3(0.62, 0.67, 0.68),
  vec3(1, 0.79, 0.48),
  positionLocal.x.smoothstep(-0.85, 0.85),
);

/** Soft, shell-confined steam; all slices share one material and draw call. */
export function createHeaterSteam(clock: OperationClock) {
  const slices = [];
  const radius = 0.49;
  for (let i = 0; i < 8; i++) {
    const offset = (((i + 0.5) / 8) * 2 - 1) * radius;
    const width = 2 * Math.sqrt(radius * radius - offset * offset);
    slices.push(
      new PlaneGeometry(1.98, width).translate(0, 0, offset),
      new PlaneGeometry(1.98, width)
        .rotateX(Math.PI / 2)
        .translate(0, offset, 0),
    );
  }
  for (let i = 0; i < 16; i++) {
    slices.push(
      new CircleGeometry(radius, 32)
        .rotateY(Math.PI / 2)
        .translate((((i + 0.5) / 16) * 2 - 1) * 0.99, 0, 0),
    );
  }
  const geometry = mergeGeometries(slices)!;
  slices.forEach((slice) => slice.dispose());
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    side: DoubleSide,
    forceSinglePass: true,
  });
  material.userData.clock = clock.uniform;
  material.colorNode = steamColor;
  material.opacityNode = steamOpacity;
  const mesh = new Mesh(geometry, material);
  mesh.name = "countercurrent-shell-steam";
  mesh.position.y = 1.14;
  // A light veil surrounds the tubes, underneath the clear outer enclosure.
  mesh.renderOrder = 1.5;
  return mesh;
}

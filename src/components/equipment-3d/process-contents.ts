import {
  Box3,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  PlaneGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import type { Kind } from "@/domain/schema";
import { liquidMaterial, vaporMaterial } from "./fluid-materials";
import { OperationClock, pipeCurve, type Point } from "./operation";
import { flowColors, type SystemExample } from "./system-geometry";
import { columnLayout, type EquipmentModelOptions } from "./column-layout";

type Bubble = {
  x: number;
  y: number;
  z: number;
  rise: number;
  radius: number;
  phase: number;
  rate: number;
};
const random = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

class Contents {
  readonly group = new Group();
  private bubbles: Bubble[] = [];
  constructor(
    private clock: OperationClock,
    private color = flowColors.feed,
  ) {
    this.group.name = "process-contents";
  }

  surface(
    position: Point,
    radius: number,
    amplitude = 0.008,
    froth = 0.08,
    size?: [number, number],
    vortex = 0,
  ) {
    const geometry = new PlaneGeometry(
      size?.[0] ?? radius * 2,
      size?.[1] ?? radius * 2,
      48,
      48,
    ).rotateX(-Math.PI / 2);
    const material = liquidMaterial(this.clock, {
      radius: size ? 0 : radius,
      amplitude,
      froth,
      vortex,
      color: this.color,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = "moving-liquid-surface";
    mesh.position.set(...position);
    this.group.add(mesh);
  }

  bulk(position: Point, radius: number, height: number) {
    const mesh = new Mesh(
      new CylinderGeometry(radius, radius, height, 48, 1, true),
      new MeshPhysicalMaterial({
        color: this.color,
        transparent: true,
        opacity: 0.42,
        roughness: 0.12,
        metalness: 0,
        clearcoat: 1,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.position.set(...position);
    this.group.add(mesh);
  }

  fall(position: Point, width: number, height: number, rotation = Math.PI / 2) {
    const mesh = new Mesh(
      new PlaneGeometry(width, height, 20, 32),
      liquidMaterial(this.clock, {
        mode: "fall",
        color: this.color,
        amplitude: 0.019,
        froth: 0.55,
        opacity: 0.8,
      }),
    );
    mesh.position.set(...position);
    mesh.rotation.y = rotation;
    mesh.name = "descending-liquid-film";
    this.group.add(mesh);
  }

  stream(
    points: Point[],
    radius: number,
    opacity = 0.95,
    color = this.color,
    endColor = color,
  ) {
    const path = pipeCurve(points);
    const mesh = new Mesh(
      new TubeGeometry(
        path,
        Math.max(48, points.length * 20),
        radius,
        16,
        false,
      ),
      liquidMaterial(this.clock, {
        mode: "pipe",
        opacity,
        froth: 0.18,
        color,
        endColor,
        length: path.getLength(),
      }),
    );
    mesh.name = "liquid-core";
    mesh.renderOrder = 1;
    this.group.add(mesh);
  }

  vapor(
    position: Point,
    width: number,
    height: number,
    opacity = 0.13,
    depth = width,
  ) {
    const material = vaporMaterial(this.clock, opacity);
    for (const angle of [0, Math.PI / 2]) {
      const mesh = new Mesh(
        new PlaneGeometry(angle === 0 ? width : depth, height),
        material,
      );
      mesh.position.set(...position);
      mesh.rotation.y = angle;
      mesh.name = "vapor-in-vessel";
      this.group.add(mesh);
    }
  }

  aerate(position: Point, radius: number, count = 32, rise = 0.085) {
    for (let i = 0; i < count; i++) {
      const seed = this.bubbles.length + 1,
        a = random(seed) * Math.PI * 2,
        r = Math.sqrt(random(seed + 41)) * radius;
      this.bubbles.push({
        x: position[0] + Math.cos(a) * r,
        y: position[1],
        z: position[2] + Math.sin(a) * r,
        rise,
        radius: 0.009 + random(seed + 9) * 0.012,
        phase: random(seed + 8),
        rate: 1.6 + random(seed + 13) * 1.6,
      });
    }
  }

  finish() {
    const matrix = new Matrix4(),
      point = new Vector3(),
      scale = new Vector3(),
      rotation = new Quaternion();
    const bubbles = new InstancedMesh(
      new SphereGeometry(1, 12, 8),
      new MeshPhysicalMaterial({
        color: "#e1f0ea",
        transparent: true,
        opacity: 0.62,
        metalness: 0.05,
        roughness: 0.06,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        depthWrite: false,
      }),
      this.bubbles.length,
    );
    bubbles.name = "vapor-bubbles-in-liquid";
    bubbles.frustumCulled = false;
    // Fit the real operating envelope, even before the first animation frame.
    // Default identity instance matrices would otherwise add a unit sphere at
    // the origin and make the camera fit empty space below the equipment.
    bubbles.boundingBox = new Box3();
    for (const b of this.bubbles) {
      bubbles.boundingBox.expandByPoint(
        new Vector3(b.x - b.radius - 0.005, b.y - b.radius, b.z - b.radius),
      );
      bubbles.boundingBox.expandByPoint(
        new Vector3(
          b.x + b.radius + 0.005,
          b.y + b.rise + b.radius,
          b.z + b.radius,
        ),
      );
    }
    if (this.bubbles.length) this.group.add(bubbles);
    else {
      bubbles.geometry.dispose();
      (bubbles.material as MeshPhysicalMaterial).dispose();
    }
    return {
      group: this.group,
      update: (active: boolean) => {
        if (!this.bubbles.length) return;
        bubbles.visible = active;
        if (!active) return;
        for (let i = 0; i < this.bubbles.length; i++) {
          const b = this.bubbles[i],
            phase = (this.clock.uniform.value * b.rate + b.phase) % 1;
          const r = b.radius * Math.sin(phase * Math.PI);
          point.set(
            b.x + Math.sin(phase * 10.0 + i) * 0.005,
            b.y + phase * b.rise,
            b.z,
          );
          scale.set(r, r * 0.8, r);
          matrix.compose(point, rotation, scale);
          bubbles.setMatrixAt(i, matrix);
        }
        bubbles.instanceMatrix.needsUpdate = true;
      },
    };
  }
}

/** Contents are revealed by a cutaway or transparent inspection shell. Fluid
 * stays in the actual equipment volume and remains depth-tested. */
export function createProcessContents(
  kind: Kind,
  section: boolean,
  clock: OperationClock,
  color = kind === "Distillation" || kind === "PBR"
    ? flowColors.warm
    : flowColors.feed,
  options: EquipmentModelOptions = {},
) {
  const c = new Contents(clock, color);
  if (!section) return c.finish();
  switch (kind) {
    case "Feed":
      c.bulk([0, 0.96, 0], 0.62, 0.83);
      c.surface([0, 1.375, 0], 0.62, 0.035);
      c.stream(
        [
          [0, 0.44, 0],
          [0, 0.35, 0.33],
          [1.31, 0.35, 0.33],
        ],
        0.06,
      );
      break;
    case "Product": {
      const liquid = new Shape(),
        r = 0.51,
        level = -0.03,
        angle = Math.asin(level / r);
      for (let i = 0; i <= 48; i++) {
        const a = Math.PI - angle + ((Math.PI + 2 * angle) * i) / 48;
        if (i) liquid.lineTo(r * Math.cos(a), r * Math.sin(a));
        else liquid.moveTo(r * Math.cos(a), r * Math.sin(a));
      }
      liquid.closePath();
      const body = new Mesh(
        new ExtrudeGeometry(liquid, { depth: 1.76, bevelEnabled: false })
          .translate(0, 0, -0.88)
          .rotateY(Math.PI / 2),
        liquidMaterial(clock, {
          mode: "pipe",
          color,
          opacity: 0.58,
          froth: 0.02,
        }),
      );
      body.position.y = 1.08;
      c.group.add(body);
      c.stream(
        [
          [-1.45, 1.08, 0],
          [-0.6, 1.08, 0],
        ],
        0.062,
      );
      c.surface([0, 1.055, 0], 0.5, 0.028, 0.18, [1.75, 1.01]);
      c.stream(
        [
          [0.45, 0.62, 0],
          [0.45, 0.39, 0],
          [1.8, 0.39, 0],
        ],
        0.044,
      );
      break;
    }
    case "Mixer": {
      // A rotating annular film inside the bowl; no open tank surface or air
      // bubbles. The cutaway exposes the internal oil inside the clear inspection shell.
      const film = new Mesh(
        new LatheGeometry(
          [
            new Vector2(0.12, 0.39),
            new Vector2(0.325, 0.52),
            new Vector2(0.327, 0.7),
          ],
          96,
        ).rotateZ(-Math.PI / 2),
        liquidMaterial(clock, {
          mode: "swirl",
          amplitude: 0.009,
          froth: 0,
          color,
          opacity: 0.94,
        }),
      );
      film.position.y = 0.82;
      film.name = "centrifugal-liquid-annulus";
      c.group.add(film);
      c.stream(
        [
          [1.82, 1.71, 0],
          [1.82, 0.82, 0],
          [0.61, 0.82, 0],
        ],
        0.077,
      );
      c.stream(
        [
          [1.39, 1.18, 0],
          [1.39, 0.82, 0],
        ],
        0.024,
      );
      c.stream(
        [
          [0.73, 1.09, 0],
          [0.73, 2.36, 0],
        ],
        0.064,
      );
      break;
    }
    case "Splitter":
      c.stream(
        [
          [-1.375, 1.1, 0],
          [0, 1.1, 0],
        ],
        0.092,
      );
      for (const z of [-0.62, 0.62])
        c.stream(
          [
            [0, 1.1, 0],
            [0.3, 1.1, z],
            [1.38, 1.1, z],
          ],
          0.078,
        );
      break;
    case "Heater":
      c.stream(
        [
          [-1.7676, 1.14, 0],
          [-1.02, 1.14, 0],
        ],
        0.073,
      );
      c.stream(
        [
          [1.02, 1.14, 0],
          [1.7676, 1.14, 0],
        ],
        0.073,
        0.95,
        flowColors.warm,
      );
      for (let y = -0.32; y <= 0.33; y += 0.16)
        for (let z = -0.32; z <= 0.33; z += 0.16)
          if (y * y + z * z < 0.175)
            c.stream(
              [
                [-1.025, 1.14 + y, z],
                [1.025, 1.14 + y, z],
              ],
              0.025,
              0.96,
              color,
              flowColors.warm,
            );
      c.vapor([0, 1.18, 0.05], 1.98, 0.75, 0.11, 0.7);
      c.stream(
        [
          [0.65, 0.67, 0],
          [0.65, 0.42, 0],
          [1.5, 0.42, 0],
        ],
        0.05,
      );
      break;
    case "Cooler":
      for (const x of [-1.38, 1.38]) {
        const inlet = x < 0;
        c.stream(
          inlet
            ? [
                [x, 1.5, 0.85],
                [x, 1.5, -0.61],
              ]
            : [
                [x, 1.5, -0.61],
                [x, 1.5, 0.85],
              ],
          0.066,
          0.95,
          inlet ? color : flowColors.cool,
        );
      }
      for (let z = -0.52; z < 0.6; z += 0.18)
        c.stream(
          [
            [-1.38, 1.52, z],
            [1.38, 1.52, z],
          ],
          0.027,
          0.96,
          color,
          flowColors.cool,
        );
      break;
    case "PBR":
      c.stream(
        [
          [-0.99, 3.55, 0],
          [-0.99, 4.07, 0],
          [0, 4.07, 0],
          [0, 3.3, 0],
        ],
        0.058,
      );
      c.stream(
        [
          [0, 0.75, 0],
          [0, 0.48, 0.08],
          [1.04, 0.48, 0.08],
        ],
        0.06,
      );
      // Thin liquid rivulets wet the fixed packing, with short distributor jets.
      for (const base of [1.12, 2.22]) {
        for (let i = 0; i < 16; i++) {
          const a = 0.12 + i * 0.095,
            x = Math.sin(a) * 0.51,
            z = Math.cos(a) * 0.51;
          const points: Point[] = [];
          for (let j = 0; j <= 14; j++)
            points.push([
              x + Math.sin(j * 2.4 + i) * 0.016,
              base + 0.88 - j * 0.059,
              z + Math.sin(j * 2.1 + i) * 0.015,
            ]);
          c.stream(points, 0.012, 0.94);
        }
      }
      for (const x of [-0.24, 0, 0.24])
        for (const z of [0, 0.24])
          c.stream(
            [
              [x, 3.19, z],
              [x, 3.06, z],
            ],
            0.009,
          );
      break;
    case "Distillation": {
      const layout = columnLayout(options);
      const top = (y: number) => y + layout.topOffset;
      c.stream(
        [
          [-1.3, layout.feedY, 0],
          [-0.5, layout.feedY, 0],
        ],
        0.054,
      );
      c.stream(
        [
          [1.52, top(5.33), 0],
          [1.52, top(5.06), 0],
          [0.54, top(5.06), 0],
        ],
        0.039,
        0.95,
        flowColors.cool,
      );
      c.stream(
        [
          [1.52, top(5.06), 0],
          [2.1, top(5.06), 0],
        ],
        0.039,
        0.95,
        flowColors.cool,
      );
      c.stream(
        [
          [0, 0.82, 0.1],
          [0, 0.42, 0.1],
          [1.95, 0.42, 0.1],
        ],
        0.05,
      );
      c.stream(
        [
          [0.42, 0.94, -0.12],
          [0.8, 0.94, -0.12],
          [0.8, 0.31, -0.12],
          [1.25, 0.31, -0.12],
          [1.25, 0.4, -0.12],
        ],
        0.043,
      );
      c.stream(
        [
          [1.25, 1.16, -0.12],
          [1.25, 1.3, -0.12],
          [0.5, 1.3, -0.12],
        ],
        0.043,
      );
      c.stream(
        [
          [0, top(5.45), 0],
          [0, top(6.7), 0],
          [1.52, top(6.7), 0],
          [1.52, top(6.18), 0],
        ],
        0.048,
        0.42,
        "#c1d9d6",
      );
      for (const [i, y] of layout.trays.entries()) {
        const x = i % 2 === 0 ? -0.46 : 0.46;
        c.bulk([0, y + 0.035, 0], 0.54, 0.05);
        c.surface([0, y + 0.07, 0], 0.54, 0.035, 0.82);
        c.aerate(
          [0, y + 0.055, 0],
          0.47,
          Math.min(120, Math.max(24, Math.floor(1600 / layout.trayCount))),
          0.15,
        );
        c.fall([x, y - 0.15, 0], 0.43, 0.43);
        c.vapor([0, y + 0.26, 0], 0.89, 0.3, 0.08);
      }
      c.bulk([0, 1.1, 0], 0.54, 0.16);
      c.surface([0, 1.18, 0], 0.54, 0.035, 0.45);
      // Reboiler liquid boils around the heated bundle; condenser films descend.
      c.bulk([1.25, 0.74, -0.12], 0.24, 0.48);
      c.surface([1.25, 0.98, -0.12], 0.24, 0.038, 0.9);
      c.aerate([1.25, 0.93, -0.12], 0.19, 120, 0.16);
      c.vapor([1.25, 1.04, -0.12], 0.39, 0.15, 0.12);
      c.bulk([1.52, top(5.51), 0], 0.175, 0.16);
      c.surface([1.52, top(5.59), 0], 0.175, 0.005, 0.05);
      for (const x of [-0.09, 0.09])
        c.fall([1.52 + x, top(5.85), 0.08], 0.07, 0.51, 0);
      break;
    }
  }
  return c.finish();
}

/** Pipe walls and contents share exactly the same centerline and bend radii. */
export function createSystemFlow(system: SystemExample, clock: OperationClock) {
  const c = new Contents(clock);
  c.group.name = `system-flow-${system.id}`;
  for (const stream of system.streams) {
    c.stream(stream.points, stream.radius * 0.76, 0.96, stream.color);
  }
  return c.group;
}

import {
  Box3,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  Sphere,
  TubeGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Kind } from "@/domain/schema";
import { liquidMaterial, vaporMaterial } from "./fluid-materials";
import { OperationClock, pipeCurve, type Point } from "./operation";
import { flowColors, type SystemExample } from "./system-geometry";
import {
  blendColors,
  UNKNOWN_COMPOSITION_COLOR,
  type EquipmentCompositionColors,
} from "./composition-colors";
import {
  columnLayout,
  columnOverhead,
  type EquipmentModelOptions,
} from "./column-layout";
import type {
  TrayHydraulicsResult,
  HydraulicState,
} from "@/domain/equipment/tray-hydraulics";
import {
  bedRivulets,
  bedDrainage,
  distributorBores,
  packedBedLayout,
} from "./packed-bed-layout";

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
  private droplets: {
    mesh: InstancedMesh;
    curves: ReturnType<typeof pipeCurve>[];
    lengths: number[];
    radius: number;
    perPath: number;
    velocity: number;
    pendant: boolean;
  }[] = [];
  constructor(
    private clock: OperationClock,
    private color = flowColors.feed,
  ) {
    this.group.name = "process-contents";
  }

  tint(color: string) {
    this.color = color;
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

  fall(
    position: Point,
    width: number,
    height: number,
    rotation = Math.PI / 2,
    options: { amplitude?: number; froth?: number } = {},
  ) {
    const mesh = new Mesh(
      new PlaneGeometry(width, height, 20, 32),
      liquidMaterial(this.clock, {
        mode: "fall",
        color: this.color,
        amplitude: options.amplitude ?? 0.019,
        froth: options.froth ?? 0.55,
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
    return mesh;
  }

  trickles(
    paths: Point[][],
    radius: number,
    name: string,
    opacity = 0.78,
    coalescing = false,
  ) {
    const geometries = paths.map((points, i) => {
      const curve = pipeCurve(points);
      const geometry = new TubeGeometry(
        curve,
        Math.max(12, (points.length - 1) * 4),
        radius,
        6,
        false,
      );
      const uv = geometry.getAttribute("uv");
      if (coalescing) {
        const positions = geometry.getAttribute("position");
        const normals = geometry.getAttribute("normal");
        for (let vertex = 0; vertex < positions.count; vertex++) {
          const t = uv.getX(vertex);
          // The meniscus draws into a neck with an uneven, fuller stream below.
          const thickness = 1.35 - t * 0.55 + Math.sin(t * 9 + i * 2.7) * 0.14;
          positions.setXYZ(
            vertex,
            positions.getX(vertex) +
              normals.getX(vertex) * radius * (thickness - 1),
            positions.getY(vertex) +
              normals.getY(vertex) * radius * (thickness - 1),
            positions.getZ(vertex) +
              normals.getZ(vertex) * radius * (thickness - 1),
          );
        }
        geometry.computeVertexNormals();
      }
      const length = curve.getLength();
      // Physical distance gives every path the same downward velocity; phase
      // offsets keep a bed of independent rivulets from flashing in unison.
      for (let vertex = 0; vertex < uv.count; vertex++)
        uv.setX(vertex, uv.getX(vertex) * length + random(i + 31) * 2);
      return geometry;
    });
    const merged = mergeGeometries(geometries);
    geometries.forEach((geometry) => geometry.dispose());
    if (!merged) return;
    const mesh = new Mesh(
      merged,
      liquidMaterial(this.clock, {
        mode: "trickle",
        color: this.color,
        amplitude: radius * (coalescing ? 0.42 : 0.12),
        opacity,
        froth: 0,
      }),
    );
    mesh.name = name;
    mesh.renderOrder = 1;
    this.group.add(mesh);
  }

  drops(
    paths: Point[][],
    radius: number,
    perPath: number,
    velocity: number,
    name: string,
    pendant = false,
  ) {
    const curves = paths.map(pipeCurve);
    const geometry = new SphereGeometry(1, 10, 8);
    if (pendant) {
      const vertices = geometry.getAttribute("position");
      for (let i = 0; i < vertices.count; i++) {
        const y = vertices.getY(i);
        const neck = y > 0 ? 1 - y * y * 0.65 : 1;
        vertices.setXYZ(i, vertices.getX(i) * neck, y, vertices.getZ(i) * neck);
      }
      geometry.computeVertexNormals();
    }
    const mesh = new InstancedMesh(
      geometry,
      new MeshPhysicalMaterial({
        color: new Color(this.color).lerp(new Color("#c1eee7"), 0.12),
        transparent: true,
        opacity: 0.92,
        roughness: 0.08,
        metalness: 0,
        clearcoat: 1,
        ior: 1.333,
        depthWrite: false,
      }),
      curves.length * perPath,
    );
    mesh.name = name;
    mesh.renderOrder = 1;
    mesh.visible = false;
    mesh.boundingBox = new Box3()
      .setFromPoints(paths.flat().map((p) => new Vector3(...p)))
      .expandByScalar(radius * 1.7);
    mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new Sphere());
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.group.add(mesh);
    this.droplets.push({
      mesh,
      curves,
      lengths: curves.map((curve) => curve.getLength()),
      radius,
      perPath,
      velocity,
      pendant,
    });
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
    bubbles.instanceMatrix.setUsage(DynamicDrawUsage);
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
    bubbles.boundingSphere = bubbles.boundingBox.getBoundingSphere(
      new Sphere(),
    );
    if (this.bubbles.length) this.group.add(bubbles);
    else {
      bubbles.geometry.dispose();
      (bubbles.material as MeshPhysicalMaterial).dispose();
    }
    let previousTime = Number.NaN;
    let previousActive: boolean | undefined;
    return {
      group: this.group,
      update: (active: boolean) => {
        // Camera movement renders paused scenes too. Keep instance buffers on
        // the GPU until operation time or visibility actually changes.
        const time = this.clock.uniform.value;
        if (active === previousActive && (!active || time === previousTime))
          return;
        previousActive = active;
        const changed = time !== previousTime;
        if (active) previousTime = time;
        for (const {
          mesh,
          curves,
          lengths,
          radius,
          perPath,
          velocity,
          pendant,
        } of this.droplets) {
          mesh.visible = active;
          if (!active || !changed) continue;
          for (let path = 0; path < curves.length; path++) {
            for (let drop = 0; drop < perPath; drop++) {
              const phase =
                (this.clock.uniform.value *
                  velocity *
                  (pendant
                    ? 0.7 + random(path + 211) * 0.7
                    : 1 / lengths[path]) +
                  random(path + 109) +
                  drop / perPath) %
                1;
              if (pendant) {
                const falling = Math.max(0, (phase - 0.58) / 0.42);
                curves[path].getPointAt(falling * falling, point);
                const growth =
                  phase < 0.58
                    ? Math.cbrt(phase / 0.58)
                    : Math.min(1, (1 - phase) * 18);
                const r = radius * growth;
                const stretch =
                  1.15 + (phase < 0.58 ? phase / 0.58 : 1 - falling) * 0.9;
                scale.set(r, r * stretch, r);
                point.y -= r * stretch * (1 - falling);
              } else {
                curves[path].getPointAt(phase, point);
                const r = radius * Math.min(1, phase * 12, (1 - phase) * 12);
                scale.set(r, r * 1.7, r);
              }
              mesh.setMatrixAt(
                path * perPath + drop,
                matrix.compose(point, rotation, scale),
              );
            }
          }
          mesh.instanceMatrix.needsUpdate = true;
        }
        if (!this.bubbles.length) return;
        bubbles.visible = active;
        if (!active || !changed) return;
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
  composition?: EquipmentCompositionColors,
  hydraulics?: TrayHydraulicsResult,
) {
  color = composition?.color ?? color;
  const c = new Contents(clock, color);
  const inlet = composition?.ports.in ?? color;
  const outlet = composition?.ports.out ?? color;
  const between = (from: string, to: string, fraction: number) =>
    blendColors([
      { color: from, amount: 1 - Math.max(0, Math.min(1, fraction)) },
      { color: to, amount: Math.max(0, Math.min(1, fraction)) },
    ]);
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
        0.95,
        inlet,
      );
      c.stream(
        [
          [1.39, 1.18, 0],
          [1.39, 0.82, 0],
        ],
        0.024,
        0.95,
        composition?.ports.in2 ?? color,
      );
      c.stream(
        [
          [0.73, 1.09, 0],
          [0.73, 2.36, 0],
        ],
        0.064,
        0.95,
        outlet,
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
          0.95,
          composition?.ports[z < 0 ? "out" : "out2"] ?? color,
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
        composition ? outlet : flowColors.warm,
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
              inlet,
              composition ? outlet : flowColors.warm,
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
        const isInlet = x < 0;
        c.stream(
          isInlet
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
          isInlet ? inlet : composition ? outlet : flowColors.cool,
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
          composition ? outlet : flowColors.cool,
        );
      break;
    case "PBR": {
      c.tint(inlet);
      c.stream(
        [
          [-0.99, 3.55, 0],
          [-0.99, 4.07, 0],
          [0, 4.07, 0],
          [0, 3.29, 0],
        ],
        0.058,
      );
      c.stream(
        [
          [0, packedBedLayout.collector, 0],
          [0, 0.75, 0],
          [0, 0.48, 0.08],
          [1.04, 0.48, 0.08],
        ],
        0.06,
        0.95,
        outlet,
      );
      c.trickles(
        Array.from({ length: 12 }, (_, i): Point[] => {
          const a = (i / 12) * Math.PI * 2;
          return [
            [Math.cos(a) * 0.08, 3.285, Math.sin(a) * 0.08],
            [Math.cos(a) * 0.17, 3.26, Math.sin(a) * 0.17],
            [Math.cos(a) * 0.26, 3.216, Math.sin(a) * 0.26],
          ];
        }),
        0.006,
        "inlet-diffuser-liquid",
      );
      for (const [index, bed] of packedBedLayout.beds.entries()) {
        // Illustrate the change between the calculated inlet and outlet; the
        // authored beds are visual sections, not additional reaction stages.
        c.tint(between(inlet, outlet, index / packedBedLayout.beds.length));
        c.surface([0, bed.distributor + 0.014, 0], 0.599, 0.0015, 0.015);
        const feeds = distributorBores.map(({ x, z }, i): Point[] => [
          [x, bed.distributor - 0.04, z],
          [
            x + Math.sin(i * 2.7) * 0.008,
            bed.top + 0.07,
            z + Math.cos(i) * 0.008,
          ],
          [
            x + Math.sin(i * 2.7) * 0.016,
            bed.top + 0.025,
            z + Math.cos(i) * 0.016,
          ],
        ]);
        c.trickles(
          feeds.filter((_, i) => i % 7 === index),
          0.006,
          `bed-${index + 1}-distributor-threads`,
          0.88,
          true,
        );
        c.drops(
          feeds.filter((_, i) => i % 7 !== index),
          0.009,
          1,
          1.2,
          `bed-${index + 1}-distributor-beads`,
          true,
        );
        const wetting = bedRivulets(index);
        c.tint(
          between(inlet, outlet, (index + 0.5) / packedBedLayout.beds.length),
        );
        c.trickles(wetting, 0.0022, `bed-${index + 1}-wetting-films`, 0.38);
        c.drops(
          wetting,
          0.007,
          2,
          0.17,
          `bed-${index + 1}-descending-droplets`,
        );
        const drainage = bedDrainage(index);
        c.tint(
          between(inlet, outlet, (index + 1) / packedBedLayout.beds.length),
        );
        c.trickles(
          drainage.branches,
          0.007,
          `bed-${index + 1}-gathering-films`,
          0.88,
          true,
        );
        c.trickles(
          drainage.streams,
          0.014,
          `bed-${index + 1}-merged-streams`,
          0.94,
          true,
        );
        c.drops(
          drainage.drips,
          0.011,
          1,
          0.9,
          `bed-${index + 1}-pendant-drops`,
          true,
        );
      }
      // A shallow sump collects the distributed drainage before the low outlet.
      // Its radius is inside the dished head at this elevation.
      c.tint(outlet);
      c.surface([0, packedBedLayout.collector, 0], 0.59, 0.003, 0.025);
      c.bulk([0, 0.79, 0], 0.59, 0.06);
      break;
    }
    case "Distillation": {
      const layout = columnLayout(options);
      c.group.scale.set(layout.radialScale, 1, layout.radialScale);
      c.group.userData.hydraulics = hydraulics;
      const overhead = columnOverhead(options);
      const top = (y: number) => y + layout.topOffset;
      const distillate = composition
        ? (composition.ports.out ?? UNKNOWN_COMPOSITION_COLOR)
        : flowColors.cool;
      const bottoms = composition
        ? (composition.ports.out2 ?? UNKNOWN_COMPOSITION_COLOR)
        : color;
      c.tint(inlet);
      c.stream(
        [
          [-1.3, layout.feedY, 0],
          [-0.5, layout.feedY, 0],
        ],
        0.054,
      );
      for (const branch of [
        "condensate",
        "inlet",
        "reflux",
        "distillate",
      ] as const)
        c.stream(overhead[branch], 0.039, 0.86, distillate).name =
          `column-${branch}-flow`;
      c.tint(bottoms);
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
        overhead.vapor,
        0.048,
        0.42,
        composition ? distillate : "#c1d9d6",
      );
      for (const [i, y] of layout.trays.entries()) {
        // Geometry is bottom-up; the solver numbers trays from the top.
        const stage = layout.trayCount - i;
        const rating = hydraulics?.stages.find((s) => s.stage === stage);
        const weeping =
          rating?.weepRatio !== null &&
          rating?.weepRatio !== undefined &&
          rating.weepRatio < 1;
        const flooding =
          !!rating &&
          Math.max(
            rating.jetFloodFraction ?? 0,
            rating.downcomerFloodFraction,
          ) >= 1;
        const depth = rating
          ? Math.min(
              layout.traySpacing * 0.82,
              Math.max(
                0.025,
                rating.frothHeight * (weeping ? 0.45 : 1) +
                  (flooding ? layout.traySpacing * 0.28 : 0),
              ),
            )
          : 0.07;
        // The solver provides endpoint compositions, not a tray profile. Blend
        // through the feed elevation without inventing additional separation.
        c.tint(
          composition
            ? y <= layout.feedY
              ? between(
                  bottoms,
                  inlet,
                  (y - layout.trays[0]) / (layout.feedY - layout.trays[0]),
                )
              : between(
                  inlet,
                  distillate,
                  (y - layout.feedY) / (layout.trays.at(-1)! - layout.feedY),
                )
            : color,
        );
        const x = i % 2 === 0 ? -0.46 : 0.46;
        c.bulk([0, y + depth / 2, 0], 0.54, depth);
        c.surface(
          [0, y + depth, 0],
          0.54,
          flooding ? 0.018 : 0.007,
          flooding ? 0.65 : 0.28,
        );
        c.aerate(
          [0, y + 0.055, 0],
          0.47,
          Math.min(
            120,
            Math.max(12, Math.floor((weeping ? 400 : 1600) / layout.trayCount)),
          ),
          Math.max(0.03, depth - 0.025),
        );
        c.fall(
          [x, y - (layout.traySpacing - depth) / 2, 0],
          0.43,
          layout.traySpacing - 0.03,
          Math.PI / 2,
          {
            amplitude: 0.004,
            froth: 0.14,
          },
        );
        c.vapor(
          [0, y + layout.traySpacing * 0.57, 0],
          0.89,
          layout.traySpacing * 0.65,
          0.035,
        );
        if (hydraulics) {
          const colors: Record<HydraulicState, string> = {
            normal: "#17885f",
            "near-flooding": "#eaa521",
            weeping: "#3577ef",
            flooding: "#f04949",
            "flooding-and-weeping": "#f04949",
            unrated: "#94a3ab",
          };
          const ring = new Mesh(
            new TorusGeometry(0.558, 0.012, 8, 48),
            new MeshBasicMaterial({
              color: colors[rating?.state ?? "unrated"],
            }),
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.y = y + 0.02;
          ring.name = `tray-${stage}-hydraulic-state`;
          ring.userData = { stage, state: rating?.state ?? "unrated" };
          c.group.add(ring);
        }
        if (weeping) {
          const paths: Point[][] = [];
          for (let dx = -0.27; dx <= 0.3; dx += 0.18)
            for (let dz = -0.27; dz <= 0.3; dz += 0.18)
              paths.push([
                [dx, y - 0.02, dz],
                [dx, y - layout.traySpacing + 0.1, dz],
              ]);
          c.drops(paths, 0.012, 3, 0.65, `tray-${stage}-weeping`, true);
        }
        if (flooding) {
          const paths: Point[][] = Array.from({ length: 8 }, (_, k) => {
            const angle = (k * Math.PI) / 4;
            return [
              [Math.cos(angle) * 0.28, y + depth, Math.sin(angle) * 0.28],
              [
                Math.cos(angle + 0.15) * 0.4,
                y + layout.traySpacing + 0.05,
                Math.sin(angle + 0.15) * 0.4,
              ],
            ];
          });
          c.drops(paths, 0.014, 3, 0.8, `tray-${stage}-carryover`);
        }
      }
      c.tint(bottoms);
      c.bulk([0, 1.1, 0], 0.54, 0.16);
      c.surface([0, 1.18, 0], 0.54, 0.009, 0.12);
      // Reboiler liquid boils around the heated bundle; condenser films descend.
      c.bulk([1.25, 0.74, -0.12], 0.24, 0.48);
      c.surface([1.25, 0.98, -0.12], 0.24, 0.012, 0.5);
      c.aerate([1.25, 0.93, -0.12], 0.19, 120, 0.16);
      c.vapor([1.25, 1.04, -0.12], 0.39, 0.15, 0.12);
      c.tint(distillate);
      c.bulk([1.52, top(5.96), 0], 0.21, 0.08);
      c.surface([1.52, top(6), 0], 0.21, 0.003, 0.04);
      for (const x of [-0.09, 0.09])
        c.fall([1.52 + x, top(6.17), 0.08], 0.07, 0.3, 0, {
          amplitude: 0.002,
          froth: 0.08,
        });
      c.bulk([1.52, top(5.47), 0], 0.203, 0.13);
      c.surface([1.52, top(5.535), 0], 0.203, 0.002, 0.015);
      break;
    }
  }
  return c.finish();
}

/** Pipe walls and contents share exactly the same centerline and bend radii. */
export function createSystemFlow(
  system: SystemExample,
  clock: OperationClock,
  colors?: Record<string, string>,
) {
  const c = new Contents(clock);
  c.group.name = `system-flow-${system.id}`;
  for (const stream of system.streams) {
    c.stream(
      stream.points,
      stream.radius * 0.76,
      0.96,
      colors?.[stream.id] ?? stream.color,
    ).name = `stream-${stream.id}`;
  }
  return c.group;
}

import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  type Material,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Path,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  type Texture,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Kind } from "@/domain/schema";
import { pipeCurve } from "./operation";
import type { SystemExample } from "./system-geometry";
import {
  columnLayout,
  columnOverhead,
  type EquipmentModelOptions,
} from "./column-layout";
import { distributorBores, packedBedLayout } from "./packed-bed-layout";
import { createCatalystPacking } from "./packed-bed-packing";
import { finishColumnSteel, refluxTeeGeometry } from "./column-details";

type Point = [number, number, number];
type Axis = "x" | "y" | "z";
type Finish =
  | "steel"
  | "satin"
  | "dark"
  | "teal"
  | "copper"
  | "blue"
  | "rubber"
  | "gold"
  | "liquid"
  | "white"
  | "motor";
const TAU = Math.PI * 2;
const finishes: Record<Finish, [string, number, number]> = {
  steel: ["#b5c4c8", 0.85, 0.25],
  motor: ["#657383", 0.35, 0.42],
  satin: ["#d6deda", 0.65, 0.34],
  dark: ["#46585d", 0.7, 0.35],
  teal: ["#286f60", 0.45, 0.3],
  copper: ["#bd7847", 0.72, 0.28],
  blue: ["#5189aa", 0.5, 0.3],
  rubber: ["#283735", 0.05, 0.8],
  gold: ["#b99659", 0.55, 0.4],
  liquid: ["#4b9c8d", 0.25, 0.22],
  white: ["#f3f3e8", 0.1, 0.5],
};

/** Build in local coordinates, then batch by finish. Even the packed beds and
 * bolted connections cost only one draw call per material, not per fitting. */
class Fabricator {
  private batches = new Map<
    string,
    { finish: Finish; enclosure: boolean; geometries: BufferGeometry[] }
  >();
  private frame = new Matrix4();
  private assemblies: Group[] = [];
  private isEnclosure = false;

  constructor(readonly transparent = false) {}

  enclosure(build: () => void) {
    const previous = this.isEnclosure;
    this.isEnclosure = true;
    build();
    this.isEnclosure = previous;
  }

  part(
    geometry: BufferGeometry,
    finish: Finish,
    position: Point = [0, 0, 0],
    rotation: Point = [0, 0, 0],
  ) {
    // Extruded profiles are non-indexed; normalize before material batching.
    if (!geometry.index)
      geometry.setIndex(
        Array.from({ length: geometry.attributes.position.count }, (_, i) => i),
      );
    const matrix = new Matrix4().compose(
      new Vector3(...position),
      new Quaternion().setFromEuler(new Euler(...rotation)),
      new Vector3(1, 1, 1),
    );
    geometry.applyMatrix4(this.frame.clone().multiply(matrix));
    const key = `${finish}-${this.isEnclosure ? "enclosure" : "hardware"}`;
    const batch = this.batches.get(key) ?? {
      finish,
      enclosure: this.isEnclosure,
      geometries: [],
    };
    batch.geometries.push(geometry);
    this.batches.set(key, batch);
  }

  at(position: Point, rotation: Point, build: () => void) {
    const previous = this.frame;
    this.frame = previous
      .clone()
      .multiply(
        new Matrix4().compose(
          new Vector3(...position),
          new Quaternion().setFromEuler(new Euler(...rotation)),
          new Vector3(1, 1, 1),
        ),
      );
    build();
    this.frame = previous;
  }

  assembly(name: string, build: (part: Fabricator) => void) {
    const part = new Fabricator(this.transparent);
    build(part);
    const assembly = part.build(name);
    assembly.applyMatrix4(this.frame);
    this.assemblies.push(assembly);
  }

  box(
    position: Point,
    size: Point,
    finish: Finish = "steel",
    rotation: Point = [0, 0, 0],
  ) {
    this.part(new BoxGeometry(...size), finish, position, rotation);
  }

  cylinder(
    position: Point,
    radius: number,
    height: number,
    finish: Finish = "steel",
    axis: Axis = "y",
    radiusTop = radius,
    segments = 40,
  ) {
    this.part(
      new CylinderGeometry(radiusTop, radius, height, segments),
      finish,
      position,
      axis === "x"
        ? [0, 0, -Math.PI / 2]
        : axis === "z"
          ? [Math.PI / 2, 0, 0]
          : [0, 0, 0],
    );
  }

  shell(
    position: Point,
    radius: number,
    height: number,
    section: boolean,
    finish: Finish = "steel",
    axis: Axis = "y",
    enclosure = true,
  ) {
    section = section && !this.transparent;
    const previous = this.isEnclosure;
    this.isEnclosure = enclosure;
    this.part(
      new CylinderGeometry(
        radius,
        radius,
        height,
        64,
        1,
        true,
        section && axis === "y" ? Math.PI / 2 : 0,
        section ? Math.PI * 1.5 : TAU,
      ),
      finish,
      position,
      axis === "x" ? [0, 0, -Math.PI / 2] : [0, 0, 0],
    );
    this.isEnclosure = previous;
  }

  sphere(
    position: Point,
    scale: Point,
    finish: Finish = "steel",
    segments = 32,
    enclosure = true,
  ) {
    const previous = this.isEnclosure;
    this.isEnclosure = enclosure;
    this.part(
      new SphereGeometry(1, segments, Math.max(8, segments / 2)).scale(
        ...scale,
      ),
      finish,
      position,
    );
    this.isEnclosure = previous;
  }

  ring(
    position: Point,
    radius: number,
    thickness: number,
    finish: Finish = "steel",
    axis: Axis = "y",
    arc = TAU,
  ) {
    this.part(
      new TorusGeometry(radius, thickness, 8, 64, arc),
      finish,
      position,
      axis === "y"
        ? [Math.PI / 2, 0, 0]
        : axis === "x"
          ? [0, Math.PI / 2, 0]
          : [0, 0, 0],
    );
  }

  annulus(
    position: Point,
    outer: number,
    inner: number,
    thickness: number,
    finish: Finish = "steel",
    axis: Axis = "y",
  ) {
    const shape = new Shape();
    shape.absarc(0, 0, outer, 0, TAU, false);
    const bore = new Path();
    bore.absarc(0, 0, inner, 0, TAU, true);
    shape.holes.push(bore);
    this.part(
      new ExtrudeGeometry(shape, {
        depth: thickness,
        bevelEnabled: false,
        curveSegments: 24,
      }).translate(0, 0, -thickness / 2),
      finish,
      position,
      axis === "y"
        ? [-Math.PI / 2, 0, 0]
        : axis === "x"
          ? [0, Math.PI / 2, 0]
          : [0, 0, 0],
    );
  }

  rotor(
    name: string,
    position: Point,
    angularSpeed: number,
    build: (part: Fabricator) => void,
    axis: Axis = "y",
  ) {
    const part = new Fabricator();
    build(part);
    const assembly = part.build(name);
    assembly.position.set(...position);
    assembly.applyMatrix4(this.frame);
    assembly.userData.angularSpeed = angularSpeed;
    assembly.userData.angularAxis = axis;
    this.assemblies.push(assembly);
  }

  turned(
    position: Point,
    profile: [number, number][],
    section = false,
    finish: Finish = "steel",
    enclosure = finish !== "motor",
  ) {
    section = section && !this.transparent;
    const previous = this.isEnclosure;
    this.isEnclosure = enclosure;
    // Radius / axial distance profile, turned around X. The fixed section
    // removes only the upper-front quadrant; the bore stays genuinely open.
    this.part(
      new LatheGeometry(
        profile.map(([r, x]) => new Vector2(r, x)),
        96,
        0,
        section ? Math.PI * 1.5 : TAU,
      ).rotateZ(-Math.PI / 2),
      finish,
      position,
    );
    this.isEnclosure = previous;
  }

  clamp(position: Point, radius: number, axis: Axis = "y") {
    this.at(position, axis === "x" ? [0, 0, -Math.PI / 2] : [0, 0, 0], () => {
      this.annulus([0, -0.025, 0], radius, radius * 0.7, 0.035);
      this.annulus([0, 0.025, 0], radius, radius * 0.7, 0.035);
      this.annulus([0, 0, 0], radius * 0.94, radius * 0.7, 0.012, "rubber");
      this.ring([0, 0, 0], radius + 0.008, 0.018, "satin");
      this.box([0, 0, radius + 0.025], [0.11, 0.065, 0.045], "steel");
      this.rod(
        [-0.075, 0, radius + 0.04],
        [0.075, 0, radius + 0.04],
        0.012,
        "dark",
      );
    });
  }

  rod(
    from: Point,
    to: Point,
    radius: number,
    finish: Finish = "steel",
    segments = 12,
  ) {
    const a = new Vector3(...from),
      b = new Vector3(...to),
      delta = b.clone().sub(a);
    const geometry = new CylinderGeometry(
      radius,
      radius,
      delta.length(),
      segments,
    );
    geometry.applyQuaternion(
      new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        delta.normalize(),
      ),
    );
    this.part(
      geometry,
      finish,
      a.add(b).multiplyScalar(0.5).toArray() as Point,
    );
  }

  pipe(
    points: Point[],
    radius = 0.065,
    finish: Finish = "steel",
    section = false,
    enclosure = true,
  ) {
    const radial = 16;
    const geometry = new TubeGeometry(
      pipeCurve(points),
      Math.max(12, points.length * 12),
      radius,
      radial,
      false,
    );
    if (section && !this.transparent && geometry.index) {
      // Remove the upper-front wall quadrant, retaining the actual pipe lumen.
      const indices = geometry.index.array,
        open: number[] = [];
      const normals = geometry.getAttribute("normal");
      for (let i = 0; i < indices.length; i += 6) {
        const a = indices[i],
          b = indices[i + 2];
        const facing =
          (normals.getY(a) + normals.getY(b)) * 0.25 +
          (normals.getZ(a) + normals.getZ(b)) * 0.433;
        if (facing > 0.65) continue;
        for (let j = 0; j < 6; j++) open.push(indices[i + j]);
      }
      geometry.setIndex(open);
    }
    const previous = this.isEnclosure;
    this.isEnclosure = enclosure;
    this.part(geometry, finish);
    this.isEnclosure = previous;
  }

  flange(
    position: Point,
    radius = 0.15,
    axis: Axis = "x",
    finish: Finish = "steel",
    bolts = 8,
    boreRadius?: number,
  ) {
    this.at(
      position,
      axis === "x"
        ? [0, 0, -Math.PI / 2]
        : axis === "z"
          ? [Math.PI / 2, 0, 0]
          : [0, 0, 0],
      () => {
        const outer = radius > 0.4 ? radius * 1.1 : radius;
        const bore = boreRadius ?? radius * (radius > 0.4 ? 0.89 : 0.48);
        const boltCircle = (outer + bore) / 2;
        const boltRadius = (outer - bore) * 0.22;
        this.annulus([0, -0.028, 0], outer, bore, 0.045, finish);
        this.annulus([0, 0.028, 0], outer, bore, 0.045, finish);
        this.annulus([0, 0, 0], outer * 0.99, bore, 0.012, "rubber");
        for (let i = 0; i < bolts; i++) {
          const a = (i / bolts) * TAU;
          this.cylinder(
            [Math.cos(a) * boltCircle, 0.06, Math.sin(a) * boltCircle],
            boltRadius,
            0.035,
            "dark",
            "y",
            boltRadius,
            6,
          );
        }
      },
    );
  }

  nozzle(
    position: Point,
    axis: Axis = "x",
    length = 0.32,
    radius = 0.075,
    finish: Finish = "steel",
    direction = 1,
  ) {
    this.at(
      position,
      axis === "x"
        ? [0, 0, -Math.PI / 2]
        : axis === "z"
          ? [Math.PI / 2, 0, 0]
          : [0, 0, 0],
      () => {
        this.enclosure(() =>
          this.annulus([0, 0, 0], radius, radius * 0.72, length, finish),
        );
        this.flange(
          [0, direction * (length / 2 - 0.025), 0],
          radius * 1.8,
          "y",
        );
      },
    );
  }

  instrumentPlug(position: Point) {
    // Keep the welded boss and short neck opaque in inspection mode, so the
    // fitting still visibly meets the shell instead of appearing to float.
    const plug = new Fabricator();
    plug.cylinder([-0.008, 0, 0], 0.068, 0.036, "satin", "x");
    plug.cylinder([-0.065, 0, 0], 0.033, 0.098, "steel", "x");
    plug.cylinder([-0.116, 0, 0], 0.046, 0.025, "satin", "x");
    plug.cylinder([-0.144, 0, 0], 0.044, 0.038, "steel", "x", 0.044, 6);
    plug.cylinder([-0.166, 0, 0], 0.032, 0.012, "satin", "x");
    const assembly = plug.build("capped-instrument-port");
    assembly.position.set(...position);
    assembly.applyMatrix4(this.frame);
    this.assemblies.push(assembly);
  }

  valve(position: Point, finish: Finish = "teal", axis: Axis = "x") {
    this.at(position, axis === "z" ? [0, Math.PI / 2, 0] : [0, 0, 0], () => {
      this.enclosure(() => this.cylinder([0, 0, 0], 0.11, 0.26, finish, "x"));
      this.flange([-0.15, 0, 0], 0.145, "x");
      this.flange([0.15, 0, 0], 0.145, "x");
      this.cylinder([0, 0.12, 0], 0.075, 0.2, finish);
      this.cylinder([0, 0.3, 0], 0.025, 0.22, "steel");
      this.ring([0, 0.42, 0], 0.145, 0.02, finish);
      this.rod([-0.145, 0.42, 0], [0.145, 0.42, 0], 0.012, finish);
      this.rod([0, 0.42, -0.145], [0, 0.42, 0.145], 0.012, finish);
    });
  }

  gauge(position: Point, mountY: number) {
    // Keep the complete dial in its own inspectable assembly. The stem reaches
    // the vessel, while the housing is stood clear of the dished head.
    const dial = new Fabricator();
    dial.cylinder([0, 0, 0], 0.115, 0.07, "dark", "z");
    dial.cylinder([0, 0, 0.038], 0.098, 0.009, "white", "z");
    dial.ring([0, 0, 0.044], 0.105, 0.012, "steel", "z");
    dial.rod([0, 0, 0.046], [-0.047, 0.05, 0.046], 0.005, "rubber", 6);
    dial.cylinder([0, 0, 0.048], 0.013, 0.006, "dark", "z", 0.013, 12);
    for (let i = 0; i < 13; i++) {
      const a = -0.55 + i * 0.35;
      dial.rod(
        [
          Math.cos(a) * (i % 3 ? 0.079 : 0.07),
          Math.sin(a) * (i % 3 ? 0.079 : 0.07),
          0.046,
        ],
        [Math.cos(a) * 0.086, Math.sin(a) * 0.086, 0.046],
        0.0022,
        "dark",
        6,
      );
    }
    const assembly = dial.build("pressure-gauge");
    assembly.position.set(...position);
    assembly.applyMatrix4(this.frame);
    assembly.userData.gauge = { radius: 0.117, mountY };
    this.assemblies.push(assembly);
    const stemTop = position[1] - 0.1;
    this.cylinder(
      [position[0], (mountY + stemTop) / 2, position[2]],
      0.023,
      stemTop - mountY,
      "steel",
    );
    this.cylinder(
      [position[0], mountY + 0.035, position[2]],
      0.044,
      0.07,
      "dark",
      "y",
      0.044,
      6,
    );
  }

  plate(position: Point, width = 0.28) {
    this.box(position, [width, 0.14, 0.018], "dark");
    for (let i = 0; i < 3; i++)
      this.box(
        [
          position[0] - width * 0.1,
          position[1] + 0.035 - i * 0.035,
          position[2] + 0.012,
        ],
        [width * (i === 0 ? 0.65 : 0.4), 0.009, 0.004],
        "satin",
      );
  }

  skid(width: number, depth: number) {
    for (const z of [-depth / 2, depth / 2])
      this.box([0, 0.11, z], [width, 0.18, 0.12], "dark");
    for (const x of [-width / 2 + 0.12, 0, width / 2 - 0.12])
      this.box([x, 0.11, 0], [0.12, 0.18, depth], "dark");
    for (const x of [-width / 2 + 0.15, width / 2 - 0.15])
      for (const z of [-depth / 2, depth / 2]) {
        this.box([x, 0.025, z], [0.26, 0.05, 0.24], "steel");
        this.cylinder([x, 0.07, z], 0.025, 0.04, "dark", "y", 0.025, 6);
      }
  }

  supports(radius: number, top: number, finish: Finish = "steel") {
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2,
        x = Math.cos(a) * radius,
        z = Math.sin(a) * radius;
      this.box([x, (top + 0.16) / 2, z], [0.1, top - 0.16, 0.1], finish);
      this.box([x, 0.16, z], [0.22, 0.06, 0.22], "dark");
      this.cylinder(
        [x + 0.07, 0.205, z + 0.07],
        0.022,
        0.035,
        "steel",
        "y",
        0.022,
        6,
      );
    }
  }

  ladder(x: number, z: number, bottom: number, top: number, width = 0.32) {
    for (const dx of [-width / 2, width / 2])
      this.rod([x + dx, bottom, z], [x + dx, top + 0.2, z], 0.022, "dark");
    for (let y = bottom + 0.12; y < top; y += 0.19)
      this.rod([x - width / 2, y, z], [x + width / 2, y, z], 0.015, "steel");
    for (let y = bottom + 0.3; y < top; y += 0.8)
      for (const dx of [-width / 2, width / 2])
        this.rod([x + dx, y, z], [x + dx, y, z - 0.18], 0.018, "dark");
  }

  build(kind: string) {
    const group = new Group();
    group.name = kind;
    for (const [key, { finish, geometries, enclosure }] of this.batches) {
      const merged = mergeGeometries(geometries);
      geometries.forEach((geometry) => geometry.dispose());
      if (!merged) throw new Error(`Could not assemble ${kind} ${finish}`);
      const [color, metalness, roughness] = finishes[finish];
      const mesh = new Mesh(
        merged,
        this.transparent && enclosure
          ? new MeshPhysicalMaterial({
              color: "#bad8d4",
              transparent: true,
              opacity: 0.16,
              metalness: 0,
              roughness: 0.12,
              clearcoat: 1,
              clearcoatRoughness: 0.08,
              ior: 1.46,
              envMapIntensity: 0.65,
              depthWrite: false,
              side: DoubleSide,
              forceSinglePass: true,
            })
          : new MeshStandardMaterial({
              color,
              metalness,
              roughness,
              side: DoubleSide,
            }),
      );
      mesh.name = `${kind}-${key}`;
      mesh.userData.enclosure = enclosure;
      mesh.castShadow = !(this.transparent && enclosure);
      mesh.renderOrder = this.transparent && enclosure ? 2 : 0;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    for (const assembly of this.assemblies) group.add(assembly);
    return group;
  }
}

function perforatedPlate(
  radius: number,
  holes: { x: number; y: number; r: number }[],
  depth = 0.025,
  cut?: number,
) {
  const shape = new Shape();
  const points: [number, number][] = [];
  for (let i = 0; i <= 96; i++) {
    const a = (i * TAU) / 96;
    const x = Math.cos(a) * radius,
      y = Math.sin(a) * radius;
    if (cut === undefined || (cut > 0 ? y <= cut : y >= cut))
      points.push([x, y]);
  }
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  for (const hole of holes) {
    if (
      cut !== undefined &&
      (cut > 0 ? hole.y + hole.r > cut : hole.y - hole.r < cut)
    )
      continue;
    const path = new Path();
    path.absarc(hole.x, hole.y, hole.r, 0, TAU, true);
    shape.holes.push(path);
  }
  return new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 8,
  }).translate(0, 0, -depth / 2);
}

function blade(length: number, width: number) {
  const profile = new Shape();
  profile.moveTo(0.08, -width * 0.2);
  profile.quadraticCurveTo(length * 0.6, -width * 0.4, length, -width * 0.15);
  profile.lineTo(length * 0.96, width * 0.28);
  profile.quadraticCurveTo(length * 0.6, width, 0.09, width * 0.35);
  profile.closePath();
  return new ExtrudeGeometry(profile, {
    depth: 0.018,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.006,
    bevelThickness: 0.004,
    curveSegments: 12,
  })
    .rotateX(Math.PI / 2)
    .rotateZ(0.22);
}

function feed(f: Fabricator, section: boolean) {
  f.skid(1.9, 1.5);
  f.supports(0.58, 0.65);
  f.shell([0, 1.35, 0], 0.67, 1.65, section, "satin");
  f.enclosure(() => {
    f.cylinder([0, 0.52, 0], 0.42, 0.23, "steel", "y", 0.67);
    f.cylinder([0, 2.3, 0], 0.69, 0.3, "teal", "y", 0.12);
  });
  for (const y of [0.55, 1.1, 1.65, 2.17])
    f.ring([0, y, 0], 0.674, 0.015, "steel");
  f.pipe(
    [
      [0, 2.44, 0],
      [0, 2.7, 0],
      [0.24, 2.7, 0],
      [0.24, 2.58, 0],
    ],
    0.04,
  );
  f.flange([-0.25, 2.29, 0.2], 0.16, "y");
  f.pipe(
    [
      [0, 0.44, 0],
      [0, 0.35, 0.33],
      [1.12, 0.35, 0.33],
    ],
    0.075,
    "steel",
    section,
  );
  f.valve([0.83, 0.35, 0.33]);
  f.nozzle([1.15, 0.35, 0.33]);
  f.pipe(
    [
      [0.38, 0.7, 0.54],
      [0.52, 0.7, 0.7],
      [0.52, 1.95, 0.7],
      [0.38, 1.95, 0.54],
    ],
    0.027,
    "dark",
  );
  f.cylinder([0.52, 1.15, 0.7], 0.035, 0.8, "liquid");
  for (let y = 0.8; y < 1.95; y += 0.1)
    f.box([0.61, y, 0.7], [0.06, 0.012, 0.018], "dark");
  f.plate([0, 1.76, 0.67]);
  f.ladder(-0.61, 0.58, 0.2, 2.22, 0.25);
  f.nozzle([-0.24, 0.94, 0.67], "z", 0.2, 0.145);
  f.cylinder([-0.24, 0.94, 0.79], 0.23, 0.035, "steel", "z");
  f.rod([-0.33, 0.94, 0.83], [-0.15, 0.94, 0.83], 0.018, "dark");
  f.box([-0.46, 0.94, 0.78], [0.08, 0.2, 0.06], "dark");
  if (section) {
    f.pipe(
      [
        [0, 0.62, 0.1],
        [0, 0.4, 0.1],
        [0.65, 0.4, 0.1],
      ],
      0.07,
      "steel",
    );
  }
}

function product(f: Fabricator, section: boolean) {
  f.skid(2.7, 1.45);
  for (const x of [-0.72, 0.72]) {
    f.box([x, 0.45, 0], [0.2, 0.52, 1.05], "dark");
    f.box([x, 0.22, 0], [0.4, 0.08, 1.18], "steel");
    f.ring([x, 1.08, 0], 0.555, 0.045, "teal", "x");
  }
  f.shell([0, 1.08, 0], 0.55, 1.85, section, "satin", "x");
  for (const x of [-0.92, 0.92]) {
    f.sphere([x, 1.08, 0], [0.28, 0.55, 0.55]);
    f.ring([x, 1.08, 0], 0.552, 0.022, "steel", "x");
  }
  f.nozzle([-1.3, 1.08, 0], "x", 0.3, 0.09, "steel", -1);
  f.nozzle([0, 1.68, 0], "y", 0.26, 0.16);
  f.cylinder([0, 1.85, 0], 0.25, 0.06, "teal");
  f.rod([-0.13, 1.91, 0], [0.13, 1.91, 0], 0.018, "steel");
  for (const x of [-0.65, 0.65]) {
    f.annulus([x, 1.7, -0.08], 0.09, 0.045, 0.04, "steel", "z");
    f.box([x, 1.62, -0.08], [0.13, 0.1, 0.04], "steel");
  }
  f.gauge([0.62, 1.94, 0.05], 1.59);
  f.pipe(
    [
      [0.45, 0.62, 0],
      [0.45, 0.39, 0],
      [1.8, 0.39, 0],
    ],
    0.055,
    "steel",
    section,
  );
  f.valve([1.5, 0.39, 0]);
  f.plate([0, 1.25, 0.555], 0.38);
}

function mixer(f: Fabricator, section: boolean) {
  // CM-type centrifugal mixer: horizontal spindle, rotating bowl, stationary
  // centripetal pickup, axial feed and upper discharge. See references.ts.
  const axisY = 0.82;
  f.part(
    new RoundedBoxGeometry(1.8, 0.1, 1.03, 2, 0.035),
    "satin",
    [-0.94, 0.1, 0],
  );
  for (const x of [-1.53, -0.38])
    for (const z of [-0.34, 0.34]) {
      f.part(new RoundedBoxGeometry(0.3, 0.12, 0.23, 2, 0.025), "motor", [
        x,
        0.22,
        z,
      ]);
      f.box([x, 0.37, z * 0.8], [0.15, 0.25, 0.18], "motor");
      f.cylinder([x, 0.3, z], 0.032, 0.045, "steel", "y", 0.032, 6);
    }
  // The motor cooling fins follow the spindle, with an enclosed rear fan cowl.
  f.cylinder([-1.02, axisY, 0], 0.355, 1.02, "motor", "x");
  f.turned(
    [0, axisY, 0],
    [
      [0, -1.85],
      [0.29, -1.85],
      [0.38, -1.79],
      [0.39, -1.7],
      [0.39, -1.52],
      [0.355, -1.49],
    ],
    false,
    "motor",
  );
  for (let i = 0; i < 28; i++) {
    const angle = (i * TAU) / 28;
    f.box(
      [-1.02, axisY + Math.cos(angle) * 0.378, Math.sin(angle) * 0.378],
      [0.94, 0.065, 0.017],
      "motor",
      [angle, 0, 0],
    );
  }
  f.ring([-1.49, axisY, 0], 0.356, 0.018, "dark", "x");
  f.ring([-0.51, axisY, 0], 0.356, 0.018, "dark", "x");
  f.part(
    new RoundedBoxGeometry(0.48, 0.35, 0.22, 3, 0.035),
    "motor",
    [-1.03, 0.86, 0.38],
  );
  f.part(
    new RoundedBoxGeometry(0.51, 0.37, 0.045, 2, 0.02),
    "motor",
    [-1.03, 0.86, 0.51],
  );
  for (const x of [-1.23, -0.83])
    for (const y of [0.72, 1])
      f.cylinder([x, y, 0.541], 0.015, 0.012, "steel", "z", 0.015, 6);
  f.cylinder([-0.76, 0.78, 0.4], 0.041, 0.09, "dark", "x", 0.041, 6);
  f.plate([-1.06, 1.07, 0.36], 0.29);
  f.annulus([-1.02, 1.29, 0], 0.064, 0.037, 0.035, "steel", "z");
  f.box([-1.02, 1.22, 0], [0.07, 0.06, 0.06], "motor");

  // Cast coupling bell and removable polished hood are separate assemblies.
  f.turned(
    [0, axisY, 0],
    [
      [0.29, -0.51],
      [0.36, -0.46],
      [0.43, -0.37],
      [0.45, -0.28],
      [0.45, 0.2],
      [0.42, 0.25],
    ],
    section,
    "satin",
  );
  for (const x of [-0.29, 0.21])
    f.ring([x, axisY, 0], 0.453, 0.019, "steel", "x");
  f.flange([0.28, axisY, 0], 0.47, "x", "steel", 12);
  f.turned(
    [0, axisY, 0],
    [
      [0.465, 0.29],
      [0.474, 0.34],
      [0.471, 0.51],
      [0.452, 0.65],
      [0.415, 0.76],
      [0.35, 0.85],
      [0.25, 0.92],
      [0.13, 0.97],
      [0.112, 1.07],
      [0.093, 1.07],
      [0.108, 0.95],
      [0.23, 0.9],
      [0.33, 0.83],
      [0.395, 0.74],
      [0.433, 0.63],
      [0.451, 0.5],
      [0.454, 0.31],
    ],
    section,
    "steel",
  );
  f.clamp([1.1, axisY, 0], 0.14, "x");
  // Small casing drain is plugged during operation.
  f.pipe(
    [
      [-0.03, 0.41, 0.25],
      [-0.03, 0.28, 0.35],
      [-0.03, 0.21, 0.35],
    ],
    0.027,
  );
  f.cylinder([-0.03, 0.21, 0.35], 0.038, 0.045, "dark", "y", 0.038, 6);

  // Removable sanitary pipework, with open ferrules and clamp bands.
  f.pipe(
    [
      [1.82, 1.71, 0],
      [1.82, axisY, 0],
      [0.71, axisY, 0],
    ],
    0.1,
    "steel",
    section,
  );
  f.clamp([1.82, 1.65, 0], 0.145);
  f.clamp([1.34, axisY, 0], 0.14, "x");
  f.pipe(
    [
      [0.73, 1.09, 0],
      [0.73, 2.36, 0],
    ],
    0.085,
    "steel",
    section,
  );
  f.clamp([0.73, 1.48, 0], 0.132);
  f.clamp([0.73, 2.27, 0], 0.132);
  f.cylinder([0.73, 1.94, 0.07], 0.117, 0.18, "steel", "z");
  f.cylinder([0.73, 1.94, 0.176], 0.1, 0.03, "satin", "z");
  f.ring([0.73, 1.94, 0.19], 0.103, 0.012, "steel", "z");
  // An auxiliary dosing port joins the main feed before the bowl.
  f.pipe(
    [
      [1.39, 1.18, 0],
      [1.39, axisY, 0],
    ],
    0.034,
    "steel",
    section,
  );
  f.clamp([1.39, 1.16, 0], 0.058);

  if (section) {
    f.cylinder([-0.11, axisY, 0], 0.048, 1.2, "dark", "x");
    f.cylinder([-0.29, axisY, 0], 0.115, 0.15, "steel", "x");
    // The axisymmetric bowl uses the same fixed cut plane as the housing.
    f.turned(
      [0, axisY, 0],
      [
        [0.055, 0.31],
        [0.13, 0.31],
        [0.32, 0.43],
        [0.368, 0.5],
        [0.368, 0.74],
        [0.34, 0.74],
        [0.34, 0.52],
        [0.115, 0.365],
        [0.055, 0.365],
      ],
      true,
      "satin",
    );
    f.rotor(
      "centrifugal-bowl-vanes",
      [0.56, axisY, 0],
      28,
      (rotor) => {
        rotor.cylinder([-0.07, 0, 0], 0.08, 0.18, "steel", "x");
        for (let i = 0; i < 8; i++) {
          const vane = new Shape();
          vane.moveTo(0.125, -0.013);
          vane.quadraticCurveTo(0.23, -0.04, 0.32, 0.06);
          vane.lineTo(0.308, 0.078);
          vane.quadraticCurveTo(0.22, -0.015, 0.125, 0.012);
          vane.closePath();
          rotor.part(
            new ExtrudeGeometry(vane, {
              depth: 0.13,
              bevelEnabled: true,
              bevelSize: 0.003,
              bevelThickness: 0.003,
              bevelSegments: 1,
              curveSegments: 12,
            }).rotateY(Math.PI / 2),
            "steel",
            [0, 0, 0],
            [(i * TAU) / 8, 0, 0],
          );
        }
      },
      "x",
    );
    // The pickup remains fixed while the bowl/vanes rotate behind it.
    f.annulus([0.73, axisY, 0], 0.3, 0.11, 0.028, "satin", "x");
    f.annulus([0.765, axisY, 0], 0.3, 0.11, 0.014, "steel", "x");
  }
}

function splitter(f: Fabricator, section: boolean) {
  f.skid(2.6, 1.85);
  f.pipe(
    [
      [-1.3, 1.1, 0],
      [0, 1.1, 0],
    ],
    0.12,
    "satin",
    section,
  );
  f.pipe(
    [
      [0, 1.1, 0],
      [0.3, 1.1, -0.62],
      [1.3, 1.1, -0.62],
    ],
    0.1,
    "satin",
    section,
  );
  f.pipe(
    [
      [0, 1.1, 0],
      [0.3, 1.1, 0.62],
      [1.3, 1.1, 0.62],
    ],
    0.1,
    "satin",
    section,
  );
  f.sphere([0, 1.1, 0], [0.14, 0.14, 0.14]);
  f.flange([-1.16, 1.1, 0], 0.21);
  f.nozzle([-1.3, 1.1, 0], "x", 0.15, 0.12, "steel", -1);
  for (const z of [-0.62, 0.62]) {
    f.valve([0.73, 1.1, z], z < 0 ? "blue" : "teal");
    f.nozzle([1.28, 1.1, z], "x", 0.2, 0.1);
    f.cylinder([0.35, 0.62, z], 0.045, 0.8, "dark");
    f.box([0.35, 0.2, z], [0.3, 0.07, 0.27], "steel");
  }
  f.cylinder([-0.8, 0.62, 0], 0.045, 0.8, "dark");
  f.gauge([-0.52, 1.5, 0], 1.2);
  f.plate([-0.12, 0.38, 0.925], 0.35);
  f.rod([-0.12, 0.19, 0.925], [-0.12, 0.35, 0.925], 0.014, "dark");
  for (const z of [-0.62, 0.62]) {
    f.annulus([0.35, 1.1, z], 0.12, 0.101, 0.045, "dark", "x");
    f.plate([0.88, 0.86, z + 0.12], 0.19);
    f.rod([0.88, 1.02, z], [0.88, 0.92, z + 0.12], 0.012, "dark");
  }
  f.pipe(
    [
      [-0.2, 1.1, 0],
      [-0.2, 0.8, 0],
      [-0.2, 0.8, 0.3],
    ],
    0.025,
  );
  f.cylinder([-0.2, 0.8, 0.33], 0.045, 0.07, "dark", "z");
}

function heater(f: Fabricator, section: boolean) {
  f.skid(3.25, 1.55);
  for (const x of [-0.83, 0.83]) {
    f.box([x, 0.49, 0], [0.19, 0.58, 1], "dark");
    f.box([x, 0.23, 0], [0.44, 0.08, 1.15], "steel");
  }
  f.shell([0, 1.14, 0], 0.53, 2.12, section, "satin", "x");
  for (const x of [-1.08, 1.08]) {
    f.flange([x, 1.14, 0], 0.59, "x", "steel", 16);
    f.sphere([x * 1.15, 1.14, 0], [0.23, 0.51, 0.51], "copper");
    f.nozzle([x * 1.47, 1.14, 0], "x", 0.36, 0.105, "steel", Math.sign(x));
  }
  for (const x of [-0.72, 0.72])
    f.ring([x, 1.14, 0], 0.535, 0.025, "steel", "x");
  f.pipe(
    [
      [-0.64, 1.6, 0],
      [-0.64, 2.04, 0],
      [-0.15, 2.04, 0],
    ],
    0.075,
    "copper",
  );
  f.valve([-0.18, 2.04, 0], "copper");
  f.pipe(
    [
      [0.65, 0.67, 0],
      [0.65, 0.42, 0],
      [1.5, 0.42, 0],
    ],
    0.065,
    "copper",
    section,
  );
  f.flange([1.37, 0.42, 0], 0.13);
  f.gauge([0.68, 1.96, 0.05], 1.65);
  f.plate([0.05, 1.27, 0.533]);
  for (const x of [-0.85, 0.85]) {
    f.annulus([x, 1.76, -0.05], 0.08, 0.04, 0.04, "steel", "z");
    f.box([x, 1.67, -0.05], [0.1, 0.1, 0.04], "steel");
  }
  if (section) {
    const holes: { x: number; y: number; r: number }[] = [];
    for (let y = -0.32; y <= 0.33; y += 0.16)
      for (let z = -0.32; z <= 0.33; z += 0.16) {
        if (y * y + z * z < 0.175) {
          f.pipe(
            [
              [-1.025, 1.14 + y, z],
              [1.025, 1.14 + y, z],
            ],
            0.032,
            "copper",
            true,
          );
          holes.push({ x: -z, y, r: 0.038 });
        }
      }
    for (const [i, x] of [-0.7, -0.23, 0.23, 0.7].entries())
      f.part(
        perforatedPlate(0.47, holes, 0.025, i % 2 ? -0.27 : 0.27),
        "steel",
        [x, 1.14, 0],
        [0, Math.PI / 2, 0],
      );
    for (const x of [-1.02, 1.02])
      f.part(
        perforatedPlate(0.5, holes, 0.04),
        "steel",
        [x, 1.14, 0],
        [0, Math.PI / 2, 0],
      );
  }
}

function cooler(f: Fabricator, section: boolean) {
  f.skid(2.9, 1.7);
  for (const x of [-1.18, 1.18])
    for (const z of [-0.67, 0.67])
      f.box([x, 0.82, z], [0.1, 1.34, 0.1], "dark");
  for (const z of [-0.67, 0.67]) {
    f.rod([-1.18, 0.3, z], [1.18, 1.4, z], 0.025, "steel");
    f.rod([1.18, 0.3, z], [-1.18, 1.4, z], 0.025, "steel");
  }
  f.enclosure(() => {
    f.box([0, 1.52, -0.7], [2.6, 0.45, 0.07], "satin");
    if (!section || f.transparent)
      f.box([0, 1.52, 0.7], [2.6, 0.45, 0.07], "satin");
  });
  for (const x of [-1.3, 1.3])
    f.enclosure(() => f.box([x, 1.51, 0], [0.12, 0.48, 1.45], "blue"));
  for (let x = -1.15; x < 1.2; x += 0.075)
    f.box([x, 1.5, 0], [0.018, 0.3, 1.28], "steel");
  for (let z = -0.52; z < 0.6; z += 0.18)
    f.pipe(
      [
        [-1.275, 1.52, z],
        [1.275, 1.52, z],
      ],
      0.035,
      "copper",
      section,
    );
  for (const x of [-0.67, 0.67]) {
    f.shell([x, 1.91, 0], 0.57, 0.32, false, "satin");
    f.ring([x, 2.08, 0], 0.57, 0.028, "blue");
    f.rotor(`cooler-fan-${x}`, [x, 1.91, 0], 22, (rotor) => {
      rotor.cylinder([0, 0, 0], 0.115, 0.15, "dark");
      for (let i = 0; i < 5; i++)
        rotor.part(blade(0.52, 0.19), "dark", [0, 0, 0], [0, (i * TAU) / 5, 0]);
    });
    f.cylinder([x, 2.34, 0], 0.13, 0.27, "motor");
    f.cylinder([x, 2.09, 0], 0.025, 0.25, "steel");
    f.rod([x, 2.2, -0.56], [x, 2.2, 0.56], 0.028, "dark");
    for (const z of [-0.56, 0.56])
      f.rod([x, 2.04, z], [x, 2.2, z], 0.025, "dark");
    if (!section || f.transparent) {
      for (const radius of [0.16, 0.27, 0.38, 0.49])
        f.ring([x, 2.105, 0], radius, 0.008, "dark");
      for (let i = 0; i < 8; i++) {
        const a = (i * TAU) / 8;
        f.rod(
          [x + Math.cos(a) * 0.14, 2.105, Math.sin(a) * 0.14],
          [x + Math.cos(a) * 0.56, 2.105, Math.sin(a) * 0.56],
          0.008,
          "dark",
          6,
        );
      }
    }
  }
  for (const x of [-1.38, 1.38]) {
    f.enclosure(() => f.cylinder([x, 1.5, 0], 0.1, 1.28, "blue", "z"));
    f.nozzle([x, 1.5, 0.73], "z", 0.24, 0.09, "blue");
  }
  f.plate([0, 1.52, 0.742], 0.34);
}

function reactor(f: Fabricator, section: boolean) {
  f.cylinder([0, 0.06, 0], 0.78, 0.12, "dark");
  f.shell([0, 0.49, 0], 0.54, 0.7, false, "teal", "y", false);
  for (let i = 0; i < 10; i++) {
    const a = (i * TAU) / 10;
    f.cylinder(
      [Math.cos(a) * 0.69, 0.155, Math.sin(a) * 0.69],
      0.032,
      0.07,
      "steel",
      "y",
      0.032,
      6,
    );
  }
  // Hollow dished heads leave the inlet plenum and outlet sump open. A full
  // ellipsoid would occupy the distributor and hide the collecting liquid.
  const cutaway = section && !f.transparent;
  for (const [y, upper] of [
    [0.88, false],
    [3.36, true],
  ] as const)
    f.enclosure(() =>
      f.part(
        new SphereGeometry(
          1,
          64,
          20,
          cutaway ? Math.PI : 0,
          cutaway ? Math.PI * 1.5 : TAU,
          upper ? 0.125 : Math.PI / 2,
          Math.PI / 2 - 0.125,
        ).scale(0.66, 0.33, 0.66),
        "satin",
        [0, y, 0],
      ),
    );
  f.shell([0, 2.12, 0], packedBedLayout.shellRadius, 2.48, section, "satin");
  f.flange([0, 3.36, 0], 0.69, "y", "steel", 20);
  for (const y of [0.9, 2.08]) f.ring([0, y, 0], 0.663, 0.008, "steel");
  if (cutaway)
    for (const [x, z] of [
      [0.66, 0],
      [0, 0.66],
    ])
      f.rod([x, 0.88, z], [x, 3.36, z], 0.009, "steel");
  f.nozzle([0, 3.8, 0], "y", 0.32, 0.11);
  f.pipe(
    [
      [0, 3.94, 0],
      [0, 4.07, 0],
      [-0.99, 4.07, 0],
      [-0.99, 3.55, 0],
    ],
    0.08,
    "steel",
    section,
  );
  f.flange([-0.99, 3.55, 0], 0.15, "y");
  f.pipe(
    [
      [0, 0.75, 0],
      [0, 0.48, 0.08],
      [1.04, 0.48, 0.08],
    ],
    0.085,
    "steel",
    section,
  );
  f.valve([0.82, 0.48, 0.08]);
  for (const y of [1.5, 2.65]) {
    f.instrumentPlug([-packedBedLayout.shellRadius, y, 0]);
  }
  f.gauge([0.35, 3.96, 0.32], 3.55);
  for (const x of [-0.46, 0.46]) {
    f.annulus([x, 3.67, -0.2], 0.09, 0.045, 0.04, "steel", "z");
    f.box([x, 3.56, -0.2], [0.12, 0.16, 0.04], "steel");
  }
  if (section) {
    for (const bed of packedBedLayout.beds) {
      const base = bed.support;
      f.annulus([0, base, 0], 0.632, 0.588, 0.035, "dark");
      // Closely spaced wire screen, backed by deeper load-bearing beams.
      for (let z = -0.58; z <= 0.58; z += 0.022) {
        const span = Math.sqrt(0.59 ** 2 - z ** 2);
        f.rod([-span, base, z], [span, base, z], 0.004, "steel", 5);
      }
      for (const x of [-0.28, 0.28])
        f.box([x, base - 0.028, 0], [0.022, 0.048, 1.03], "dark");
      const y = bed.distributor;
      f.part(
        perforatedPlate(
          0.613,
          distributorBores.map(({ x, z, radius }) => ({ x, y: z, r: radius })),
          0.018,
        ),
        "steel",
        [0, y, 0],
        [-Math.PI / 2, 0, 0],
      );
      f.annulus([0, y + 0.012, 0], 0.63, 0.606, 0.045, "steel");
      for (const { x, z, radius } of distributorBores)
        f.annulus([x, y - 0.019, z], radius + 0.003, radius, 0.045, "steel");
    }
    // Inlet impingement diffuser spreads the incoming jet over the top tray.
    f.cylinder([0, 3.275, 0], 0.13, 0.012, "steel");
    for (const x of [-0.1, 0.1])
      f.rod([x, 3.21, 0], [x, 3.28, 0], 0.009, "dark");
    // Screened collector above the bottom nozzle; it remains open to drainage.
    for (const y of [0.77, 0.81, 0.85, 0.89])
      f.ring([0, y, 0], 0.112, 0.005, "steel");
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      f.rod(
        [Math.cos(a) * 0.112, 0.75, Math.sin(a) * 0.112],
        [Math.cos(a) * 0.112, 0.9, Math.sin(a) * 0.112],
        0.004,
        "steel",
        5,
      );
    }
  } else f.plate([0, 2.6, 0.665], 0.34);
}

function platform(f: Fabricator, y: number) {
  // Open steel grating with actual daylight between bars, clipped to the annulus.
  for (let z = -0.9; z <= 0.9; z += 0.055) {
    const edge = Math.sqrt(0.92 ** 2 - z ** 2);
    const inner = Math.abs(z) < 0.65 ? Math.sqrt(0.65 ** 2 - z ** 2) : 0;
    for (const sign of [-1, 1])
      f.box(
        [(sign * (edge + inner)) / 2, y, z],
        [edge - inner, 0.035, 0.012],
        "dark",
      );
  }
  for (const radius of [0.65, 0.79, 0.93])
    f.ring([0, y - 0.014, 0], radius, 0.012, "steel");
  f.shell([0, y + 0.04, 0], 0.935, 0.08, false, "steel", "y", false);
  for (const height of [0.28, 0.53])
    f.ring([0, y + height, 0], 0.93, 0.018, "steel");
  for (let i = 0; i < 12; i++) {
    const a = (i * TAU) / 12;
    f.rod(
      [Math.cos(a) * 0.93, y, Math.sin(a) * 0.93],
      [Math.cos(a) * 0.93, y + 0.55, Math.sin(a) * 0.93],
      0.018,
      "steel",
    );
    f.rod(
      [Math.cos(a) * 0.62, y - 0.28, Math.sin(a) * 0.62],
      [Math.cos(a) * 0.91, y, Math.sin(a) * 0.91],
      0.025,
      "dark",
    );
  }
}

/** Hollow 2:1 dished ends instead of a whole ellipsoid inside the vessel. */
function columnHead(
  f: Fabricator,
  position: Point,
  radius: number,
  depth: number,
  up: boolean,
  section: boolean,
) {
  const profile: Vector2[] = [];
  for (let i = 0; i <= 32; i++) {
    const a = ((i / 32) * Math.PI) / 2;
    profile.push(
      new Vector2(Math.sin(a) * radius, Math.cos(a) * depth * (up ? 1 : -1)),
    );
  }
  f.enclosure(() =>
    f.part(
      new LatheGeometry(
        profile,
        96,
        section && !f.transparent ? Math.PI / 2 : 0,
        section && !f.transparent ? Math.PI * 1.5 : TAU,
      ),
      "satin",
      position,
    ),
  );
  f.ring(position, radius + 0.002, 0.007, "steel");
}

/** Compact flanged globe valve. Its bore stays open in clear/section views;
 * bonnet, stem, yoke and operator retain their solid metal silhouettes. */
function columnValve(f: Fabricator, position: Point, automatic = false) {
  f.at(position, [0, 0, 0], () => {
    f.turned(
      [0, 0, 0],
      [
        [0.058, -0.13],
        [0.061, -0.09],
        [0.09, -0.05],
        [0.095, 0.03],
        [0.061, 0.09],
        [0.058, 0.13],
        [0.043, 0.13],
        [0.043, -0.13],
        [0.058, -0.13],
      ],
      false,
      "steel",
    );
    for (const x of [-0.145, 0.145])
      f.flange([x, 0, 0], 0.105, "x", "steel", 6);
    f.cylinder([0, 0.09, 0], 0.055, 0.065, "steel");
    f.cylinder([0, 0.19, 0], 0.012, 0.17, "steel", "y", 0.012, 16);
    for (const x of [-0.046, 0.046])
      f.box([x, 0.19, 0], [0.016, 0.16, 0.032], "dark");
    if (automatic) {
      f.cylinder([0, 0.285, 0], 0.09, 0.085, "teal");
      f.ring([0, 0.285, 0], 0.092, 0.008, "steel");
      f.box([0.09, 0.19, 0], [0.055, 0.09, 0.065], "dark");
      f.pipe(
        [
          [0.09, 0.19, 0.03],
          [0.13, 0.19, 0.03],
          [0.13, 0.28, 0.03],
          [0.06, 0.28, 0.03],
        ],
        0.006,
        "copper",
        false,
        false,
      );
    } else {
      f.ring([0, 0.29, 0], 0.085, 0.012, "teal");
      for (let i = 0; i < 3; i++) {
        const a = (i * TAU) / 3;
        f.rod(
          [0, 0.29, 0],
          [Math.cos(a) * 0.085, 0.29, Math.sin(a) * 0.085],
          0.007,
          "steel",
        );
      }
    }
  });
}

function distillation(
  f: Fabricator,
  section: boolean,
  options: EquipmentModelOptions = {},
) {
  const layout = columnLayout(options);
  f.cylinder([0, 0.1, 0], 0.87, 0.2, "dark");
  f.shell([0, 0.55, 0], 0.55, 0.88, false, "teal", "y", false);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const x = Math.cos(a),
      z = Math.sin(a);
    f.annulus([x * 0.75, 0.21, z * 0.75], 0.05, 0.023, 0.015, "steel");
    f.cylinder([x * 0.75, 0.3, z * 0.75], 0.019, 0.14, "steel", "y", 0.019, 16);
    f.box([x * 0.62, 0.3, z * 0.62], [0.19, 0.22, 0.025], "dark", [0, -a, 0]);
    f.cylinder(
      [Math.cos(a) * 0.75, 0.24, Math.sin(a) * 0.75],
      0.03,
      0.08,
      "steel",
      "y",
      0.03,
      6,
    );
  }
  columnHead(f, [0, 1.01, 0], 0.6, 0.3, false, section);
  f.shell(
    [0, (layout.shellBottom + layout.shellTop) / 2, 0],
    0.6,
    layout.shellTop - layout.shellBottom,
    section,
    "satin",
  );
  columnHead(f, [0, layout.shellTop, 0], 0.6, 0.3, true, section);
  for (let y = 1.12; y < layout.shellTop; y += 1.05)
    f.ring([0, y, 0], 0.602, 0.008, "steel");
  f.plate([0.18, 1.29, 0.575], 0.24);
  f.flange([0, 5.14 + layout.topOffset, 0], 0.64, "y", "steel", 16);
  for (const y of layout.platforms) platform(f, y);
  f.ladder(-0.54, 0.8, 0.2, 5.15 + layout.topOffset, 0.28);
  // Safety cage follows the ladder at fixed spacing as the tower grows.
  const cageTop = layout.shellTop - 0.1;
  for (let y = 1.85; y < cageTop; y += 0.72) {
    const hoop: Point[] = Array.from({ length: 25 }, (_, i) => {
      const a = (i / 24) * Math.PI;
      return [-0.54 + Math.cos(a) * 0.27, y, 0.8 + Math.sin(a) * 0.27];
    });
    f.pipe(hoop, 0.012, "steel", false, false);
  }
  if (cageTop > 1.85)
    for (const a of [0, Math.PI / 4, Math.PI / 2, (Math.PI * 3) / 4, Math.PI])
      f.rod(
        [-0.54 + Math.cos(a) * 0.27, 1.85, 0.8 + Math.sin(a) * 0.27],
        [-0.54 + Math.cos(a) * 0.27, cageTop, 0.8 + Math.sin(a) * 0.27],
        0.008,
        "steel",
      );
  for (let y = 1.5; y < layout.shellTop - 0.3; y += 1.15) {
    if (Math.abs(y - layout.feedY) < 0.34) continue;
    f.nozzle([-0.66, y, -0.04], "x", 0.24, 0.13, "steel", -1);
    f.flange([-0.79, y, -0.04], 0.205, "x", "steel", 8, 0.125);
    f.cylinder([-0.8, y, -0.04], 0.205, 0.04, "dark", "x");
    f.rod([-0.84, y - 0.06, -0.06], [-0.88, y - 0.06, -0.06], 0.012, "steel");
    f.rod([-0.88, y - 0.06, -0.06], [-0.88, y + 0.06, -0.06], 0.012, "steel");
    f.rod([-0.88, y + 0.06, -0.06], [-0.84, y + 0.06, -0.06], 0.012, "steel");
  }
  // The entire overhead assembly follows the top tray without deformation.
  const overhead = columnOverhead(options);
  f.assembly("overhead-piping", (part) => {
    part.pipe(overhead.vapor, 0.067, "steel", section);
    part.pipe(overhead.condensate, 0.055, "steel", section);
  });
  f.assembly("reflux-splitter", (part) => {
    const [x, y, z] = overhead.split;
    // Join pipes to the fitting mouths, leaving the tee's bore unobstructed.
    part.pipe([overhead.inlet[0], [x, y + 0.17, z]], 0.055, "steel", section);
    part.pipe([[x - 0.13, y, z], overhead.reflux[1]], 0.055, "steel", section);
    part.pipe(
      [[x + 0.13, y, z], overhead.distillate[1]],
      0.055,
      "steel",
      section,
    );
    part.enclosure(() =>
      part.part(refluxTeeGeometry(), "steel", overhead.split),
    );
    // Forged socket collars identify the fitting even in transparent mode.
    for (const dx of [-0.105, 0.105])
      part.annulus([x + dx, y, z], 0.069, 0.053, 0.055, "steel", "x");
    part.annulus([x, y + 0.115, z], 0.069, 0.053, 0.055, "steel", "y");
    part.ring([x, y + 0.14, z], 0.061, 0.008, "satin");
  });
  f.at([0, layout.topOffset, 0], [0, 0, 0], () => {
    f.assembly("overhead-condenser", (part) => {
      part.shell([1.52, 6.16, 0], 0.235, 0.5, section, "satin");
      columnHead(part, [1.52, 6.41, 0], 0.235, 0.09, true, section);
      columnHead(part, [1.52, 5.91, 0], 0.235, 0.09, false, section);
      for (const y of [5.93, 6.39])
        part.flange([1.52, y, 0], 0.28, "y", "steel", 12, 0.224);
      if (section) {
        // A continuous coolant coil, including both utility tails.
        const coil: Point[] = [
          [1.97, 6.02, 0],
          [1.66, 6.02, 0],
        ];
        for (let i = 0; i <= 192; i++) {
          const a = (i / 192) * TAU * 6;
          coil.push([
            1.52 + Math.cos(a) * 0.14,
            6.02 + (i / 192) * 0.27,
            Math.sin(a) * 0.14,
          ]);
        }
        coil.push([1.97, 6.29, 0]);
        part.pipe(coil, 0.018, "steel", false, false);
      }
      for (const y of [6.02, 6.29]) {
        part.pipe(
          [
            [1.73, y, 0],
            [1.97, y, 0],
          ],
          0.035,
          "steel",
          section,
        );
        part.flange([1.93, y, 0], 0.065, "x", "steel", 6, 0.027);
        part.ring([1.85, y, 0], 0.036, 0.005, "blue", "x");
      }
    });
    f.assembly("reflux-receiver", (part) => {
      part.shell([1.52, 5.52, 0], 0.225, 0.24, section, "satin");
      columnHead(part, [1.52, 5.64, 0], 0.225, 0.08, true, section);
      columnHead(part, [1.52, 5.4, 0], 0.225, 0.08, false, section);
      part.flange([1.52, 5.64, 0], 0.26, "y", "steel", 10, 0.214);
      // Local level glass, with a protective backplate and two isolation fittings.
      part.box([1.52, 5.52, 0.232], [0.065, 0.2, 0.016], "dark");
      part.pipe(
        [
          [1.52, 5.43, 0.255],
          [1.52, 5.61, 0.255],
        ],
        0.019,
        "steel",
      );
      for (const y of [5.43, 5.61])
        part.rod([1.52, y, 0.19], [1.52, y, 0.264], 0.025, "steel");
      part.plate([1.65, 5.52, 0.19], 0.12);
    });
    f.assembly("reflux-control-valve", (part) =>
      columnValve(part, [0.97, 5.06, 0], true),
    );
    f.assembly("distillate-control-valve", (part) =>
      columnValve(part, [1.83, 5.06, 0]),
    );
    f.nozzle([2, 5.06, 0], "x", 0.2, 0.055);
    f.flange([0.66, 5.06, 0], 0.1, "x", "steel", 6, 0.044);
    f.flange([0, 5.64, 0], 0.13, "y", "steel", 8, 0.058);
    // Braced shelf with saddles; supports stay behind the liquid split.
    for (const z of [-0.23, -0.35]) {
      f.box([1.05, 5.29, z], [1.08, 0.055, 0.045], "dark");
      f.rod([0.48, 4.75, z], [1.58, 5.29, z], 0.022, "dark");
    }
    for (const x of [1.35, 1.69])
      f.box([x, 5.29, -0.08], [0.045, 0.055, 0.58], "dark");
    for (const z of [-0.16, 0.16])
      f.box([1.52, 5.33, z], [0.2, 0.09, 0.045], "steel");
    for (const y of [5.97, 6.33]) {
      f.rod([0.62, 5.29, -0.23], [1.52, y, -0.24], 0.022, "dark");
      f.ring([1.52, y, 0], 0.239, 0.008, "steel");
    }
  });
  // The thermosiphon returns two-phase fluid BELOW the lowest tray (y=1.45).
  // Both utility connections join a separate coil inside the process shell.
  f.shell([1.25, 0.77, -0.12], 0.27, 0.62, section, "steel");
  if (section) {
    const coil: Point[] = [
      [1.82, 0.62, -0.12],
      [1.4, 0.62, -0.12],
    ];
    for (let i = 0; i <= 100; i++) {
      const angle = (i / 100) * TAU * 5;
      coil.push([
        1.25 + Math.cos(angle) * 0.15,
        0.62 + (i / 100) * 0.3,
        -0.12 + Math.sin(angle) * 0.15,
      ]);
    }
    coil.push([1.82, 0.92, -0.12]);
    f.pipe(coil, 0.018, "steel", false, false);
  }
  for (const y of [0.46, 1.08])
    f.flange([1.25, y, -0.12], 0.3, "y", "steel", 10);
  f.sphere([1.25, 0.45, -0.12], [0.27, 0.1, 0.27]);
  f.sphere([1.25, 1.09, -0.12], [0.27, 0.1, 0.27]);
  for (const y of [0.62, 0.92]) {
    f.pipe(
      [
        [1.48, y, -0.12],
        [1.82, y, -0.12],
      ],
      0.035,
      "steel",
    );
    f.flange([1.8, y, -0.12], 0.07, "x");
  }
  for (const z of [-0.32, 0.08])
    f.box([1.25, 0.22, z], [0.07, 0.36, 0.07], "dark");
  f.box([1.25, 0.045, -0.12], [0.48, 0.07, 0.62], "steel");
  f.pipe(
    [
      [0.42, 0.94, -0.12],
      [0.8, 0.94, -0.12],
      [0.8, 0.31, -0.12],
      [1.25, 0.31, -0.12],
      [1.25, 0.4, -0.12],
    ],
    0.06,
  );
  f.pipe(
    [
      [1.25, 1.16, -0.12],
      [1.25, 1.3, -0.12],
      [0.5, 1.3, -0.12],
    ],
    0.06,
  );
  f.pipe(
    [
      [0, 0.82, 0.1],
      [0, 0.42, 0.1],
      [1.95, 0.42, 0.1],
    ],
    0.07,
  );
  f.valve([1.7, 0.42, 0.1], "teal");
  f.pipe(
    [
      [-1.3, layout.feedY, 0],
      [-0.5, layout.feedY, 0],
    ],
    0.075,
  );
  f.flange([-1.2, layout.feedY, 0], 0.15);
  f.gauge([0.38, 5.79 + layout.topOffset, 0.27], 5.4 + layout.topOffset);
  if (section) {
    for (const [i, y] of layout.trays.entries()) {
      const holes: { x: number; y: number; r: number }[] = [];
      for (let dx = -0.27; dx <= 0.3; dx += 0.18)
        for (let dz = -0.27; dz <= 0.3; dz += 0.18)
          holes.push({ x: dx, y: dz, r: 0.028 });
      // Open tray ports and a chordal downcomer, alternating at every tray.
      f.annulus([0, y - 0.022, 0], 0.575, 0.52, 0.024, "steel");
      f.part(
        perforatedPlate(0.55, holes, 0.03, i % 2 ? -0.44 : 0.44),
        "satin",
        [0, y, 0],
        [-Math.PI / 2, 0, Math.PI / 2],
      );
      const x = i % 2 === 0 ? -0.39 : 0.39;
      f.box([x, y - 0.16, 0], [0.04, 0.3, 0.5], "steel");
      f.box([x, y + 0.045, 0], [0.025, 0.09, 0.5], "steel");
      for (const z of [-0.27, 0.27])
        f.box([0, y - 0.04, z], [0.88, 0.04, 0.018], "dark");
      for (let bolt = 0; bolt < 10; bolt++) {
        const a = (bolt / 10) * TAU;
        const bx = Math.cos(a) * 0.51;
        if (Math.sign(bx) === Math.sign(x) && Math.abs(bx) > 0.36) continue;
        f.cylinder(
          [bx, y + 0.023, Math.sin(a) * 0.51],
          0.012,
          0.014,
          "dark",
          "y",
          0.012,
          6,
        );
      }
      for (const hole of holes) {
        f.cylinder(
          [hole.x, y + 0.055, hole.y],
          0.037,
          0.012,
          "steel",
          "y",
          0.037,
          12,
        );
        f.rod(
          [hole.x, y, hole.y],
          [hole.x, y + 0.05, hole.y],
          0.009,
          "dark",
          6,
        );
      }
    }
  }
}

export function createEquipmentModel(
  kind: Kind,
  section = false,
  transparent = false,
  options: EquipmentModelOptions = {},
): Group {
  const f = new Fabricator(transparent);
  const builders: Record<Kind, (f: Fabricator, section: boolean) => void> = {
    Feed: feed,
    Product: product,
    Mixer: mixer,
    Splitter: splitter,
    Heater: heater,
    Cooler: cooler,
    PBR: reactor,
    Distillation: (fabricator, cutaway) =>
      distillation(fabricator, cutaway, options),
  };
  builders[kind](f, section || transparent);
  const model = f.build(kind);
  if (kind === "PBR" && (section || transparent))
    model.add(createCatalystPacking());
  if (kind === "Distillation") {
    model.userData.column = columnLayout(options);
    finishColumnSteel(model);
  }
  return model;
}

export function disposeEquipmentModel(group: Group) {
  const geometries = new Set<BufferGeometry>();
  const finishes = new Set<Material>();
  const textures = new Set<Texture>();
  group.traverse((object) => {
    if (object instanceof Mesh) {
      geometries.add(object.geometry);
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => {
        finishes.add(material);
        if (material instanceof MeshStandardMaterial) {
          if (material.roughnessMap) textures.add(material.roughnessMap);
          if (material.bumpMap) textures.add(material.bumpMap);
        }
      });
      if (object instanceof InstancedMesh) object.dispose();
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  finishes.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

/** Use the same route for the pipe wall and the liquid core. */
export function createSystemConnections(
  system: SystemExample,
  transparent: boolean,
  section = false,
): Group {
  const f = new Fabricator(transparent);
  for (const stream of system.streams) {
    f.pipe(stream.points, stream.radius, "teal", section);
    // A coupling on the first straight run makes the wall thickness legible.
    const a = new Vector3(...stream.points[0]);
    const b = new Vector3(...stream.points[1]);
    const direction = b.clone().sub(a).normalize();
    if (a.distanceTo(b) > 0.45) {
      const point = a.addScaledVector(direction, 0.24);
      const axis: Axis =
        Math.abs(direction.x) > 0.9
          ? "x"
          : Math.abs(direction.y) > 0.9
            ? "y"
            : "z";
      f.flange(point.toArray() as Point, stream.radius * 1.7, axis);
    }
  }
  const group = f.build("Heater");
  group.name = `system-pipes-${system.id}`;
  return group;
}

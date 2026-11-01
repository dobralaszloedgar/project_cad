import {
  Color,
  CylinderGeometry,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import { packedBedLayout, packingRandom } from "./packed-bed-layout";

/** Render the visible grain envelope, including the top and bottom of each bed.
 * Hidden central grains add no visible detail. Instancing keeps a whole bed at
 * two draw calls, including its inert ceramic grading layers. */
export function createCatalystPacking() {
  const group = new Group();
  group.name = "fixed-catalyst-packing";
  const radius = packedBedLayout.pelletRadius;
  const pellet = new CylinderGeometry(radius, radius, 0.036, 7);
  const ceramic = new SphereGeometry(1, 6, 4);
  const catalystMaterial = new MeshStandardMaterial({
    color: "#a69b86",
    metalness: 0,
    roughness: 0.88,
  });
  const supportMaterial = new MeshStandardMaterial({
    color: "#d1c8b2",
    metalness: 0,
    roughness: 0.76,
  });
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const color = new Color();

  for (const [bedIndex, bed] of packedBedLayout.beds.entries()) {
    const assembly = new Group();
    assembly.name = `catalyst-bed-${bedIndex + 1}`;
    assembly.position.y = bed.bottom;
    group.add(assembly);
    const transforms: { position: Vector3; seed: number }[] = [];
    const height = bed.top - bed.bottom;
    const pitch = 0.032;
    const layers = Math.floor(height / 0.027);
    for (let layer = 0; layer <= layers; layer++) {
      const angle = packingRandom(layer + bedIndex * 67) * Math.PI * 2;
      for (let row = -19; row <= 19; row++) {
        for (let col = -19; col <= 19; col++) {
          const seed =
            (layer * 1600 + (row + 19) * 40 + col + 20) * 3 + bedIndex * 100003;
          const x =
            (col + (Math.abs(row) % 2) * 0.5) * pitch +
            (packingRandom(seed) - 0.5) * 0.012;
          const z =
            row * pitch * 0.866 + (packingRandom(seed + 1) - 0.5) * 0.012;
          const r = Math.hypot(x, z);
          // Leave several grains of depth so neither orbiting nor looking down
          // reveals the omitted opaque interior.
          if (r > packedBedLayout.bedRadius - 0.024) continue;
          if (r < 0.525 && layer > 1 && layer < layers - 1) continue;
          transforms.push({
            position: new Vector3(
              x * Math.cos(angle) - z * Math.sin(angle),
              0.024 +
                (layer / layers) * (height - 0.048) +
                (packingRandom(seed + 2) - 0.5) * 0.007,
              x * Math.sin(angle) + z * Math.cos(angle),
            ),
            seed,
          });
        }
      }
    }
    const grains = new InstancedMesh(
      pellet,
      catalystMaterial,
      transforms.length,
    );
    grains.name = "ceramic-catalyst-pellets";
    grains.userData.pelletDiameter = radius * 2;
    transforms.forEach(({ position, seed }, i) => {
      rotation.setFromEuler(
        new Euler(
          packingRandom(seed + 5) * Math.PI,
          packingRandom(seed + 7) * Math.PI * 2,
          packingRandom(seed + 11) * Math.PI,
        ),
      );
      const size = 0.86 + packingRandom(seed + 17) * 0.22;
      scale.set(size, 0.78 + packingRandom(seed + 19) * 0.4, size);
      grains.setMatrixAt(i, matrix.compose(position, rotation, scale));
      color.setHSL(
        0.095 + packingRandom(seed + 23) * 0.025,
        0.12,
        0.57 + packingRandom(seed + 29) * 0.22,
      );
      grains.setColorAt(i, color);
    });
    grains.receiveShadow = true;
    grains.computeBoundingBox();
    grains.computeBoundingSphere();
    assembly.add(grains);

    const balls: { position: Vector3; radius: number; seed: number }[] = [];
    for (const [layer, y, r] of [
      [0, bed.support + 0.042, 0.025],
      [1, bed.support + 0.087, 0.019],
      [2, bed.top + 0.021, 0.018],
    ]) {
      const spacing = r * 1.94;
      for (let row = -18; row <= 18; row++) {
        for (let col = -18; col <= 18; col++) {
          const seed =
            (row + 18) * 37 + col + 19 + layer * 2003 + bedIndex * 7103;
          const x = (col + (Math.abs(row) % 2) * 0.5) * spacing;
          const z = row * spacing * 0.866;
          if (Math.hypot(x, z) > packedBedLayout.bedRadius - r) continue;
          balls.push({
            position: new Vector3(
              x,
              y - bed.bottom + (packingRandom(seed) - 0.5) * 0.004,
              z,
            ),
            radius: r * (0.94 + packingRandom(seed + 1) * 0.06),
            seed,
          });
        }
      }
    }
    const grading = new InstancedMesh(ceramic, supportMaterial, balls.length);
    grading.name = "inert-ceramic-grading";
    rotation.identity();
    balls.forEach(({ position, radius: r, seed }, i) => {
      grading.setMatrixAt(
        i,
        matrix.compose(position, rotation, scale.setScalar(r)),
      );
      grading.setColorAt(
        i,
        color.setScalar(0.74 + packingRandom(seed + 3) * 0.24),
      );
    });
    grading.receiveShadow = true;
    grading.computeBoundingBox();
    grading.computeBoundingSphere();
    assembly.add(grading);
  }
  return group;
}

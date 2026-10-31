import {
  BufferGeometry,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  RGBAFormat,
} from "three";

/** Open forged tee: cut the run's saddle out before joining the branch. This
 * avoids three intersecting tube walls closing off the visible splitter bore. */
export function refluxTeeGeometry() {
  const vertices: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const segments = 128;
  const band = (
    point: (angle: number, end: number) => number[],
    inward: boolean,
  ) => {
    const offset = vertices.length / 3;
    for (let i = 0; i <= segments; i++)
      for (let end = 0; end <= 1; end++) {
        vertices.push(...point((i / segments) * Math.PI * 2, end));
        uvs.push(end, i / segments);
      }
    for (let i = 0; i < segments; i++) {
      const a = offset + i * 2;
      const face = [a, a + 1, a + 2, a + 2, a + 1, a + 3];
      indices.push(...(inward ? face.reverse() : face));
    }
  };
  for (const [radius, branch, inward] of [
    [0.063, 0.056, false],
    [0.045, 0.042, true],
  ] as const) {
    for (const sign of [-1, 1])
      band(
        (a, end) => {
          const z = radius * Math.sin(a),
            y = radius * Math.cos(a);
          const cut = y > 0 ? Math.sqrt(Math.max(0, branch ** 2 - z ** 2)) : 0;
          return [sign * (end ? cut : 0.13), y, z];
        },
        inward !== sign > 0,
      );
    band((a, end) => {
      const x = branch * Math.cos(a),
        z = branch * Math.sin(a);
      return [x, end ? 0.17 : Math.sqrt(radius ** 2 - z ** 2), z];
    }, inward);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Subtle deterministic brushing, generated locally rather than an external
 * texture dependency. Each model owns its texture and releases it on disposal. */
export function finishColumnSteel(model: Group) {
  const size = 128,
    data = new Uint8Array(size * size * 4);
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
  const finishes = new Map<string, MeshStandardMaterial>();
  model.traverse((object) => {
    if (
      !(object instanceof Mesh) ||
      !(object.material instanceof MeshStandardMaterial) ||
      object.material.transparent
    )
      return;
    if (!/-(steel|satin)-(hardware|enclosure)$/.test(object.name)) return;
    const previous = object.material;
    const key = previous.color.getHexString();
    let material = finishes.get(key);
    if (!material) {
      material = new MeshStandardMaterial({
        color: previous.color,
        side: DoubleSide,
        metalness: 0.88,
        roughness: 0.36,
        roughnessMap: grain,
        bumpMap: grain,
        bumpScale: 0.0006,
        envMapIntensity: 1.05,
      });
      finishes.set(key, material);
    }
    object.material = material;
    previous.dispose();
  });
}

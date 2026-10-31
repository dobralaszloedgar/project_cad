import { Color, DoubleSide } from "three";
import {
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  type Node,
} from "three/webgpu";
import {
  Discard,
  Fn,
  If,
  float,
  mix,
  materialReference as threeMaterialReference,
  normalLocal,
  positionLocal,
  transformNormalToView,
  uv,
  vec2,
  vec3,
} from "three/tsl";
import type { OperationClock } from "./operation";

// @types/three has not yet made MaterialReferenceNode generic like ReferenceNode.
function materialReference<T extends "float" | "color">(
  property: string,
  type: T,
) {
  return threeMaterialReference(property, type) as unknown as Node<T>;
}

// TSL generates WGSL for WebGPU and GLSL for the WebGL 2 fallback. Keeping one
// material implementation preserves liquid motion and pause/speed on both APIs.
const hash21 = Fn(([p]: [Node<"vec2">]) =>
  p.dot(vec2(127.1, 311.7)).sin().mul(43758.5453).fract(),
);
const liquidNoise = Fn(([p]: [Node<"vec2">]) => {
  const i = p.floor();
  const f = p.fract();
  const weight = f.mul(f).mul(float(3).sub(f.mul(2)));
  return mix(
    mix(hash21(i), hash21(i.add(vec2(1, 0))), weight.x),
    mix(hash21(i.add(vec2(0, 1))), hash21(i.add(vec2(1, 1))), weight.x),
    weight.y,
  );
});
const waterNoise = Fn(([p]: [Node<"vec2">]) =>
  liquidNoise(p)
    .mul(0.57)
    .add(liquidNoise(p.mul(2.13)).mul(0.28))
    .add(liquidNoise(p.mul(4.27)).mul(0.15)),
);

type LiquidOptions = {
  mode?: "surface" | "fall" | "pipe" | "swirl";
  radius?: number;
  amplitude?: number;
  froth?: number;
  vortex?: number;
  color?: string;
  opacity?: number;
  endColor?: string;
  length?: number;
};

type LiquidMode = NonNullable<LiquidOptions["mode"]>;
type LiquidNodes = Pick<
  MeshPhysicalNodeMaterial,
  "positionNode" | "normalNode" | "colorNode" | "opacityNode"
>;
const liquidPrograms = new Map<LiquidMode, LiquidNodes>();

// Share one graph per flow mode. Dimensions, colors and clocks are per-material
// uniforms, so a plant with many trays/pipes reuses programs instead of compiling
// a different shader for every radius, color and route length.
function liquidNodes(mode: LiquidMode): LiquidNodes {
  const cached = liquidPrograms.get(mode);
  if (cached) return cached;
  const material: LiquidNodes = {
    positionNode: null,
    normalNode: null,
    colorNode: null,
    opacityNode: null,
  };
  const time = materialReference("userData.liquid.clock.value", "float");
  const radius = materialReference("userData.liquid.radius", "float");
  const amplitude = materialReference("userData.liquid.amplitude", "float");
  const froth = materialReference("userData.liquid.froth", "float");
  const vortex = materialReference("userData.liquid.vortex", "float");
  const length = materialReference("userData.liquid.length", "float");
  const startColor = materialReference("color", "color");
  const endColor = materialReference("userData.liquid.endColor", "color");
  const opacity = materialReference("opacity", "float");
  const wave = Fn(([p]: [Node<"vec2">]) => {
    const t = time.mul(2.4);
    return p.x
      .mul(15)
      .add(p.y.mul(9))
      .sub(t.mul(2.8))
      .sin()
      .mul(0.52)
      .add(p.x.mul(27).sub(p.y.mul(13)).add(t.mul(4.3)).sin().mul(0.3))
      .add(p.y.mul(38).add(p.x.mul(5)).sub(t.mul(6)).sin().mul(0.18))
      .mul(amplitude)
      .sub(p.dot(p).mul(-16).exp().mul(vortex));
  });
  if (mode === "surface") {
    material.positionNode = positionLocal.add(
      vec3(0, wave(positionLocal.xz), 0),
    );
    const h = wave(positionLocal.xz);
    const normal = vec3(
      h.sub(wave(positionLocal.xz.add(vec2(0.007, 0)))).div(0.007),
      1,
      h.sub(wave(positionLocal.xz.add(vec2(0, 0.007)))).div(0.007),
    ).normalize();
    material.normalNode = transformNormalToView(normal);
  } else if (mode === "fall") {
    const offset = uv()
      .x.mul(24)
      .add(uv().y.mul(17))
      .add(time.mul(15))
      .sin()
      .add(uv().y.mul(45).add(time.mul(23)).sin().mul(0.4))
      .mul(amplitude);
    material.positionNode = positionLocal.add(vec3(0, 0, offset));
  } else if (mode === "swirl") {
    const offset = uv()
      .x.mul(50.265)
      .add(uv().y.mul(15))
      .sub(time.mul(23))
      .sin()
      .mul(amplitude);
    material.positionNode = positionLocal.add(normalLocal.mul(offset));
  }
  const current =
    mode === "surface"
      ? positionLocal.xz.mul(26).add(vec2(time.mul(0.9), time.mul(-0.6)))
      : mode === "fall"
        ? uv()
            .mul(vec2(28, 7))
            .add(vec2(0, time.mul(5.4)))
        : mode === "swirl"
          ? uv()
              .mul(vec2(35, 4))
              .sub(vec2(time.mul(16).add(uv().y.mul(12)), time.mul(0.35)))
          : uv()
              .mul(vec2(28, 9))
              .sub(vec2(time.mul(5.4), 0));
  const ripple = waterNoise(current);
  material.colorNode = Fn(() => {
    if (mode === "surface") {
      If(
        radius
          .greaterThan(0)
          .and(positionLocal.xz.length().greaterThan(radius)),
        () => {
          Discard();
        },
      );
    }
    let foam = ripple.smoothstep(0.44, 0.76).mul(froth);
    let base: Node<"vec3"> = startColor.rgb;
    if (mode === "pipe") {
      const distance = uv().x.mul(length);
      const phase = distance.mul(17).sub(time.mul(13));
      const band = phase
        .add(uv().y.mul(18.85).add(phase.mul(0.33)).sin().mul(0.65))
        .sin()
        .mul(0.5)
        .add(0.5);
      const filament = uv()
        .y.mul(31.416)
        .add(distance.mul(5))
        .sub(time.mul(4))
        .sin()
        .mul(0.5)
        .add(0.5)
        .pow(10);
      base = mix(startColor, endColor, uv().x.smoothstep(0.05, 0.95)).mul(
        band.mul(0.7).add(0.42),
      );
      foam = foam
        .mul(0.25)
        .max(band.smoothstep(0.86, 1).mul(0.45).add(filament.mul(0.2)));
    }
    return mix(
      base.mul(ripple.mul(0.7).add(0.58)),
      vec3(0.79, 0.96, 0.91),
      foam,
    );
  })();
  if (mode === "fall")
    material.opacityNode = ripple.mul(0.38).add(0.62).mul(opacity);
  liquidPrograms.set(mode, material);
  return material;
}

/** Lit, depth-tested fluid with the same operation clock as the machinery. */
export function liquidMaterial(
  clock: OperationClock,
  options: LiquidOptions = {},
) {
  const {
    mode = "surface",
    radius = 0,
    amplitude = 0.009,
    froth = 0.1,
    vortex = 0,
    color = "#008f88",
    opacity = 0.9,
    endColor = color,
    length = 1,
  } = options;
  const material = new MeshPhysicalNodeMaterial({
    color,
    transparent: true,
    opacity,
    metalness: 0,
    roughness: 0.11,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    ior: 1.333,
    side: DoubleSide,
    depthWrite: false,
    envMapIntensity: 0.55,
  });
  material.userData.liquid = {
    clock: clock.uniform,
    radius,
    amplitude,
    froth,
    vortex,
    endColor: new Color(endColor),
    length,
  };
  Object.assign(material, liquidNodes(mode));
  return material;
}

const vaporOpacity = Fn(() => {
  const time = materialReference("userData.clock.value", "float");
  const p = uv()
    .mul(vec2(5, 7))
    .sub(vec2(time.mul(0.3).sin().mul(0.3), time.mul(0.65)));
  const density = waterNoise(p.add(vec2(waterNoise(p.mul(1.6)), 0)));
  const edge = uv()
    .x.smoothstep(0, 0.2)
    .mul(float(1).sub(uv().x.smoothstep(0.8, 1)))
    .mul(uv().y.smoothstep(0, 0.12))
    .mul(float(1).sub(uv().y.smoothstep(0.78, 1)));
  return density
    .smoothstep(0.3, 0.72)
    .mul(edge)
    .mul(materialReference("opacity", "float"));
})();
const vaporColor = vec3(0.87, 0.93, 0.92);

export function vaporMaterial(clock: OperationClock, opacity = 0.11) {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    opacity,
    depthWrite: false,
    side: DoubleSide,
  });
  material.userData.clock = clock.uniform;
  material.colorNode = vaporColor;
  material.opacityNode = vaporOpacity;
  return material;
}

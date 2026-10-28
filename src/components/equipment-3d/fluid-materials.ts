import { Color, DoubleSide, MeshPhysicalMaterial, ShaderMaterial } from "three";
import type { OperationClock } from "./operation";

const noise = `
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float liquidNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x), mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
}
float waterNoise(vec2 p) { return .57 * liquidNoise(p) + .28 * liquidNoise(p * 2.13) + .15 * liquidNoise(p * 4.27); }
`;

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

/** Displaced surfaces and changing normals use the equipment's studio lighting.
 * Liquid stays depth-tested against steel, including pipes and tray hardware. */
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
  const material = new MeshPhysicalMaterial({
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
  material.customProgramCacheKey = () => `liquid-${mode}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uLiquidTime: clock.uniform,
      uLiquidRadius: { value: radius },
      uLiquidAmplitude: { value: amplitude },
      uLiquidFroth: { value: froth },
      uLiquidVortex: { value: vortex },
      uLiquidEndColor: { value: new Color(endColor) },
      uLiquidStartColor: { value: new Color(color) },
      uLiquidLength: { value: length },
    });
    shader.vertexShader =
      `uniform float uLiquidTime, uLiquidAmplitude, uLiquidVortex;
varying vec3 vLiquidLocal; varying vec2 vLiquidUv;
float wave(vec2 p) {
  float t = uLiquidTime * 2.4;
  return uLiquidAmplitude * (.52*sin(p.x*15.0+p.y*9.0-t*2.8) + .3*sin(p.x*27.0-p.y*13.0+t*4.3) + .18*sin(p.y*38.0+p.x*5.0-t*6.0)) - uLiquidVortex * exp(-dot(p,p)*16.0);
}
` + shader.vertexShader;
    if (mode === "surface") {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
float e = .007; float h = wave(position.xz);
objectNormal = normalize(vec3((h-wave(position.xz+vec2(e,0)))/e, 1.0, (h-wave(position.xz+vec2(0,e)))/e));`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
transformed.y += wave(position.xz); vLiquidLocal = position; vLiquidUv = uv;`,
      );
    } else {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
${mode === "fall" ? "transformed.z += uLiquidAmplitude * (sin(uv.x*24.0 + uv.y*17.0 + uLiquidTime*15.0) + .4*sin(uv.y*45.0+uLiquidTime*23.0));" : mode === "swirl" ? "transformed += normal * uLiquidAmplitude * sin(uv.x*50.265 + uv.y*15.0-uLiquidTime*23.0);" : ""}
vLiquidLocal = position; vLiquidUv = uv;`,
      );
    }
    shader.fragmentShader =
      `uniform float uLiquidTime, uLiquidRadius, uLiquidFroth, uLiquidLength;
uniform vec3 uLiquidStartColor, uLiquidEndColor;
varying vec3 vLiquidLocal; varying vec2 vLiquidUv;
${noise}
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
${mode === "surface" ? "if (uLiquidRadius > 0.0 && length(vLiquidLocal.xz) > uLiquidRadius) discard;" : ""}
vec2 current = ${mode === "surface" ? "vLiquidLocal.xz * 26.0 + vec2(uLiquidTime*.9, -uLiquidTime*.6)" : mode === "fall" ? "vLiquidUv * vec2(28.0, 7.0) + vec2(0.0, uLiquidTime*5.4)" : mode === "swirl" ? "vLiquidUv * vec2(35.0, 4.0) - vec2(uLiquidTime*16.0+vLiquidUv.y*12.0, uLiquidTime*.35)" : "vLiquidUv * vec2(28.0, 9.0) - vec2(uLiquidTime*5.4, 0.0)"};
float ripple = waterNoise(current);
float foam = smoothstep(.44, .76, ripple) * uLiquidFroth;
${
  mode === "pipe"
    ? `
// TubeGeometry's U coordinate follows the route. World-length spacing keeps
// the visible current continuous through bends and across short/long pipes.
float distanceAlong = vLiquidUv.x * uLiquidLength;
float currentPhase = distanceAlong * 17.0 - uLiquidTime * 13.0;
float flowBand = .5 + .5*sin(currentPhase + .65*sin(vLiquidUv.y*18.85 + currentPhase*.33));
float filament = pow(.5+.5*sin(vLiquidUv.y*31.416 + distanceAlong*5.0-uLiquidTime*4.0), 10.0);
diffuseColor.rgb = mix(uLiquidStartColor, uLiquidEndColor, smoothstep(.05,.95,vLiquidUv.x));
diffuseColor.rgb *= .42 + .7*flowBand;
foam = max(foam*.25, smoothstep(.86,1.0,flowBand)*.45 + filament*.2);
`
    : ""
}
diffuseColor.rgb = mix(diffuseColor.rgb * (.58 + ripple*.7), vec3(.79,.96,.91), foam);
${mode === "fall" ? "diffuseColor.a *= .62 + .38*ripple;" : ""}`,
    );
  };
  return material;
}

export function vaporMaterial(clock: OperationClock, opacity = 0.11) {
  return new ShaderMaterial({
    uniforms: { uTime: clock.uniform, uOpacity: { value: opacity } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime, uOpacity; varying vec2 vUv; ${noise}
void main() {
  vec2 p=vUv*vec2(5.0,7.0)-vec2(sin(uTime*.3)*.3,uTime*.65);
  float density=waterNoise(p + vec2(waterNoise(p*1.6),0.0));
  float edge=smoothstep(0.0,.2,vUv.x)*(1.0-smoothstep(.8,1.0,vUv.x))*smoothstep(0.0,.12,vUv.y)*(1.0-smoothstep(.78,1.0,vUv.y));
  gl_FragColor=vec4(.87,.93,.92,smoothstep(.3,.72,density)*edge*uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}

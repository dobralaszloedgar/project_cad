"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  ShaderMaterial,
} from "three";
import type { MotionValue } from "motion/react";
import { reveal } from "./landing-system";

const vertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vEye;
  varying vec2 vUv;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vEye = normalize(cameraPosition - world.xyz);
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const fragment = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vEye;
  varying vec2 vUv;
  void main() {
    vec2 grid = vUv * vec2(28.0, 14.0);
    vec2 dist = abs(fract(grid - .5) - .5) / max(fwidth(grid), vec2(.0001));
    float line = 1.0 - smoothstep(.3, 1.25, min(dist.x, dist.y));
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vEye))), 3.0);
    float scan = pow(max(0.0, 1.0 - abs(vUv.y - (.5 + sin(uTime * .8) * .35)) * 18.0), 2.0);
    vec3 color = mix(vec3(.06,.3,.43), vec3(.35,.9,1.), line * .7 + rim * .3);
    gl_FragColor = vec4(color + scan * vec3(.25,.65,.7), line * .28 + rim * .55 + scan * .35);
    #include <colorspace_fragment>
  }
`;

function dialGeometry(radius: number, ticks = false) {
  const points: number[] = [];
  const line = (a: number, b: number, inner: number, outer: number) => {
    points.push(
      Math.cos(a) * inner,
      Math.sin(a) * inner,
      0,
      Math.cos(b) * outer,
      Math.sin(b) * outer,
      0,
    );
  };
  if (ticks) {
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      line(a, a, radius, radius + (i % 8 === 0 ? 0.12 : 0.035));
    }
  } else {
    for (let i = 0; i < 240; i++) {
      if (i % 60 > 46) continue;
      line(
        (i / 240) * Math.PI * 2,
        ((i + 1) / 240) * Math.PI * 2,
        radius,
        radius,
      );
    }
  }
  return new BufferGeometry().setAttribute(
    "position",
    new Float32BufferAttribute(points, 3),
  );
}

/** A precise holographic instrument, with independent segmented scanning rings. */
export default function ThinkingCore({
  progress,
  playing,
}: {
  progress: MotionValue<number>;
  playing: boolean;
}) {
  const root = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const outer = useRef<Group>(null);
  const core = useRef<Group>(null);
  const time = useRef(0);
  const material = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const geometry = useMemo(
    () => [dialGeometry(1.05), dialGeometry(1.28, true), dialGeometry(1.48)],
    [],
  );
  useEffect(() => () => geometry.forEach((item) => item.dispose()), [geometry]);
  useFrame((_, delta) => {
    if (!root.current) return;
    if (playing) time.current += Math.min(delta, 0.05);
    if (material.current) material.current.uniforms.uTime.value = time.current;
    const collapse = reveal(progress.get(), 0.13, 0.29);
    root.current.visible = progress.get() < 0.3;
    root.current.scale.setScalar(1.6 * (1 - collapse) + 0.001);
    root.current.position.set(
      -7 * collapse,
      4.6 * (1 - collapse) + 0.18 * collapse,
      1.3 - collapse * 6.8,
    );
    if (inner.current)
      inner.current.rotation.set(0.12, -0.15, time.current * 0.16);
    if (outer.current)
      outer.current.rotation.set(-0.08, 0.12, -time.current * 0.08);
    if (core.current)
      core.current.rotation.set(time.current * 0.06, time.current * 0.18, 0);
  });
  return (
    <group ref={root} position={[0, 4.6, 1.3]}>
      <group ref={core}>
        <mesh>
          <sphereGeometry args={[0.75, 64, 48]} />
          <shaderMaterial
            ref={material}
            vertexShader={vertex}
            fragmentShader={fragment}
            uniforms={uniforms}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
        <mesh>
          <icosahedronGeometry args={[0.5, 1]} />
          <meshBasicMaterial
            color="#7de6fa"
            wireframe
            transparent
            opacity={0.35}
            depthWrite={false}
          />
        </mesh>
        <mesh>
          <octahedronGeometry args={[0.12]} />
          <meshBasicMaterial color="#d2fbff" toneMapped={false} />
        </mesh>
      </group>
      <group ref={inner}>
        <lineSegments geometry={geometry[0]}>
          <lineBasicMaterial
            color="#91f0ff"
            transparent
            opacity={0.85}
            toneMapped={false}
          />
        </lineSegments>
        <lineSegments geometry={geometry[1]}>
          <lineBasicMaterial
            color="#a1e6ee"
            transparent
            opacity={0.5}
            toneMapped={false}
          />
        </lineSegments>
      </group>
      <group ref={outer}>
        <lineSegments geometry={geometry[2]}>
          <lineBasicMaterial
            color="#62b8cf"
            transparent
            opacity={0.6}
            toneMapped={false}
          />
        </lineSegments>
      </group>
    </group>
  );
}

"use client";
import { Component, useState, useRef, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Line } from "@react-three/drei";
import { type Project, type Unit } from "@/domain/schema";
import { Vector3, Quaternion } from "three";
import { streamColors } from "./ProcessCanvas";
const position = (n: Unit): [number, number, number] => [
  n.position.x / 100,
  0,
  n.position.y / 100,
];
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="empty-state">
        3D is unavailable on this device. Your 2D project is preserved.
      </div>
    ) : (
      this.props.children
    );
  }
}
function Vessel({
  unit,
  selected,
  onSelect,
}: {
  unit: Unit;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const tall = unit.kind === "PBR" || unit.kind === "Distillation",
    height = unit.kind === "Distillation" ? 2.4 : tall ? 1.8 : 0.85;
  return (
    <group position={position(unit)}>
      <mesh
        position={[0, height / 2, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(unit.id);
        }}
      >
        <cylinderGeometry args={[0.32, 0.32, height, 24]} />
        <meshStandardMaterial
          color={
            selected
              ? "#286f5d"
              : unit.kind === "Heater"
                ? "#e0ad62"
                : "#c9d6cf"
          }
          roughness={0.4}
          metalness={0.2}
        />
      </mesh>
      {tall &&
        [0.25, 0.7, 1.15, 1.6].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.325, 0.025, 8, 24]} />
            <meshStandardMaterial color="#69849d" />
          </mesh>
        ))}
    </group>
  );
}
function Direction({
  from,
  to,
  color,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
}) {
  const a = new Vector3(...from),
    b = new Vector3(...to),
    direction = b.clone().sub(a).normalize();
  const midpoint = a.clone().lerp(b, 0.7);
  const quaternion = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    direction,
  );
  return (
    <mesh position={midpoint} quaternion={quaternion}>
      <coneGeometry args={[0.1, 0.25, 12]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
function ProjectLabels({
  project,
  onProject,
}: {
  project: Project;
  onProject: (id: string, x: number, y: number, visible: boolean) => void;
}) {
  useFrame(({ camera, size }) => {
    for (const n of project.units) {
      const p = position(n);
      const projected = new Vector3(
        p[0],
        n.kind === "Distillation" ? 2.75 : n.kind === "PBR" ? 2.15 : 1.2,
        p[2],
      ).project(camera);
      onProject(
        n.id,
        ((projected.x + 1) * size.width) / 2,
        ((-projected.y + 1) * size.height) / 2,
        projected.z <= 1,
      );
    }
  });
  return null;
}
export default function Plant3D({
  project,
  selected,
  onSelect,
}: {
  project: Project;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const labels = useRef<Record<string, HTMLButtonElement | null>>({});
  const [camera, setCamera] = useState(0);
  const [lost, setLost] = useState(false);
  const center = project.units.length
    ? project.units.reduce((s, n) => s + n.position.x / 100, 0) /
      project.units.length
    : 4;
  return (
    <div className="plant-view">
      <button
        className="btn btn-sm camera-reset"
        onClick={() => setCamera((v) => v + 1)}
      >
        Reset camera
      </button>
      <Boundary>
        {lost ? (
          <div className="empty-state">
            WebGL context lost. Switch to 2D to continue.
          </div>
        ) : (
          <Canvas
            key={camera}
            camera={{ position: [center + 3, 9, 11], fov: 45 }}
            fallback={
              <div className="empty-state">
                WebGL unavailable. Use the 2D flowsheet.
              </div>
            }
            onCreated={({ gl }) =>
              gl.domElement.addEventListener(
                "webglcontextlost",
                (e) => {
                  e.preventDefault();
                  setLost(true);
                },
                { once: true },
              )
            }
          >
            <color attach="background" args={["#f5f7f5"]} />
            <ambientLight intensity={1.6} />
            <directionalLight position={[4, 10, 5]} intensity={2} />
            <Grid
              infiniteGrid
              cellSize={1}
              sectionSize={5}
              fadeDistance={30}
              cellColor="#d9e1db"
              sectionColor="#becac2"
            />
            {project.units.map((n) => (
              <Vessel
                key={n.id}
                unit={n}
                selected={selected === n.id}
                onSelect={onSelect}
              />
            ))}
            {project.edges.map((e) => {
              const source = project.units.find((n) => n.id === e.source),
                target = project.units.find((n) => n.id === e.target);
              if (!source || !target) return null;
              const a = position(source),
                b = position(target);
              a[1] = 0.45;
              b[1] = 0.45;
              const points: [number, number, number][] =
                e.targetPort === "in2"
                  ? [a, [a[0], 0.45, a[2] + 2], [b[0], 0.45, a[2] + 2], b]
                  : [
                      a,
                      [(a[0] + b[0]) / 2, 0.45, a[2]],
                      [(a[0] + b[0]) / 2, 0.45, b[2]],
                      b,
                    ];
              return (
                <group key={e.id}>
                  <Line
                    points={points}
                    color={streamColors[e.color]}
                    lineWidth={3}
                  />
                  <Direction
                    from={points[points.length - 2]}
                    to={b}
                    color={streamColors[e.color]}
                  />
                </group>
              );
            })}
            <ProjectLabels
              project={project}
              onProject={(id, x, y, visible) => {
                const el = labels.current[id];
                if (el) {
                  el.style.transform = `translate(-50%,-100%) translate(${x}px,${y}px)`;
                  el.style.visibility = visible ? "visible" : "hidden";
                }
              }}
            />
            <OrbitControls
              makeDefault
              target={[center, 0.5, 1]}
              minDistance={3}
              maxDistance={30}
            />
          </Canvas>
        )}
      </Boundary>
      <div className="plant-labels">
        {project.units.map((n) => (
          <button
            key={n.id}
            ref={(el) => {
              labels.current[n.id] = el;
            }}
            className={`plant-label ${selected === n.id ? "active" : ""}`}
            onClick={() => onSelect(n.id)}
          >
            {n.id}
            <small>{n.name}</small>
          </button>
        ))}
      </div>
      <div className="canvas-footnote">
        Illustrative geometry · orbit to explore · select a vessel to edit
      </div>
    </div>
  );
}

"use client";
import {
  Component,
  useState,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { ports, type Project, type Unit } from "@/domain/schema";
import { Vector3, Quaternion } from "three";
import { streamColors } from "./ProcessCanvas";
import {
  plantHeight,
  plantPort,
  plantPosition,
  plantStreamPath,
  type Point3,
} from "./flow-geometry";

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

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
    subtree: true,
  });
  return () => observer.disconnect();
}
const isDark = () =>
  document.querySelector(".workspace")?.getAttribute("data-theme") === "dark";

function Tube({
  from,
  to,
  color,
  radius = 0.055,
}: {
  from: Point3;
  to: Point3;
  color: string;
  radius?: number;
}) {
  const a = new Vector3(...from);
  const b = new Vector3(...to);
  const delta = b.clone().sub(a);
  const length = delta.length();
  if (length < 1e-9) return null;
  const rotation = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    delta.normalize(),
  );
  return (
    <mesh position={a.add(b).multiplyScalar(0.5)} quaternion={rotation}>
      <cylinderGeometry args={[radius, radius, length, 10]} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.2} />
    </mesh>
  );
}

function Ring({
  position,
  color,
  horizontal = false,
  radius = 0.32,
}: {
  position: Point3;
  color: string;
  horizontal?: boolean;
  radius?: number;
}) {
  return (
    <mesh
      position={position}
      rotation={horizontal ? [0, Math.PI / 2, 0] : [Math.PI / 2, 0, 0]}
    >
      <torusGeometry args={[radius, 0.025, 8, 24]} />
      <meshStandardMaterial color={color} roughness={0.65} metalness={0.2} />
    </mesh>
  );
}

function Vessel({
  unit,
  selected,
  dark,
  onSelect,
}: {
  unit: Unit;
  selected: boolean;
  dark: boolean;
  onSelect: (id: string) => void;
}) {
  const body = selected ? "#529b83" : dark ? "#839a90" : "#c9d5ce";
  const detail = dark ? "#b2c5bb" : "#6c8377";
  const thermal = unit.kind === "Heater" ? "#b68a50" : "#648c9b";
  const tall = unit.kind === "PBR" || unit.kind === "Distillation";
  const exchanger = unit.kind === "Heater" || unit.kind === "Cooler";
  const arrow = unit.kind === "Feed" || unit.kind === "Product";
  const unitPorts = ports(unit.kind);
  const origin = plantPosition(unit);
  return (
    <group
      position={origin}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(unit.id);
      }}
    >
      {arrow ? (
        <>
          <mesh position={[-0.2, 0.7, 0]}>
            <boxGeometry args={[0.65, 0.2, 0.25]} />
            <meshStandardMaterial color={body} roughness={0.65} />
          </mesh>
          <mesh position={[0.3, 0.7, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.29, 0.48, 4]} />
            <meshStandardMaterial color={body} roughness={0.65} />
          </mesh>
          {unit.kind === "Product" && (
            <Ring
              position={[0.61, 0.7, 0]}
              horizontal
              radius={0.28}
              color={detail}
            />
          )}
        </>
      ) : exchanger ? (
        <>
          <mesh position={[0, 0.7, 0]} rotation={[0, 0, Math.PI / 2]}>
            <capsuleGeometry args={[0.27, 0.55, 6, 20]} />
            <meshStandardMaterial
              color={body}
              roughness={0.5}
              metalness={0.25}
            />
          </mesh>
          {[-0.28, 0.28].map((x) => (
            <group key={x}>
              <Ring
                position={[x, 0.7, 0]}
                horizontal
                radius={0.275}
                color={thermal}
              />
              <mesh position={[x, 0.25, 0]}>
                <boxGeometry args={[0.1, 0.4, 0.45]} />
                <meshStandardMaterial color={detail} roughness={0.75} />
              </mesh>
            </group>
          ))}
          <Tube
            from={[-0.25, 0.98, 0]}
            to={[0.25, 0.98, 0]}
            radius={0.035}
            color={thermal}
          />
        </>
      ) : tall ? (
        <>
          <mesh position={[0, unit.kind === "PBR" ? 1.175 : 1.475, 0]}>
            <capsuleGeometry
              args={[0.32, unit.kind === "PBR" ? 1.1 : 1.7, 8, 24]}
            />
            <meshStandardMaterial
              color={body}
              roughness={0.5}
              metalness={0.2}
            />
          </mesh>
          {[-0.22, 0.22].map((x) => (
            <Tube
              key={x}
              from={[x, 0.05, 0]}
              to={[x, 0.5, 0]}
              radius={0.045}
              color={detail}
            />
          ))}
          {(unit.kind === "PBR"
            ? [0.62, 1.15, 1.7]
            : [0.65, 0.98, 1.31, 1.64, 1.97, 2.3]
          ).map((y) => (
            <Ring key={y} position={[0, y, 0]} color={detail} />
          ))}
          {unit.kind === "PBR" &&
            [0.85, 1.04, 1.39, 1.58].map((y, row) =>
              [-0.13, 0.13].map((x) => (
                <mesh key={`${row}-${x}`} position={[x, y, 0.295]}>
                  <sphereGeometry args={[0.055, 8, 6]} />
                  <meshStandardMaterial color={detail} roughness={0.8} />
                </mesh>
              )),
            )}
          {unit.kind === "Distillation" && (
            <Tube
              from={[0.34, 0.55, 0.1]}
              to={[0.34, 2.35, 0.1]}
              radius={0.025}
              color={detail}
            />
          )}
        </>
      ) : (
        <>
          <mesh position={[0, 0.7, 0]}>
            <boxGeometry args={[0.42, 0.38, 0.85]} />
            <meshStandardMaterial
              color={body}
              roughness={0.65}
              metalness={0.15}
            />
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[0.12, 0.4, 0.45]} />
            <meshStandardMaterial color={detail} roughness={0.75} />
          </mesh>
        </>
      )}
      {[...unitPorts.inputs, ...unitPorts.outputs].map((port) => {
        const anchor = plantPort(unit, port as "in" | "in2" | "out" | "out2");
        const end = anchor.point.map(
          (value, axis) => value - origin[axis],
        ) as Point3;
        const start = [...end] as Point3;
        if (anchor.direction[1])
          start[1] += anchor.direction[1] > 0 ? -0.15 : 0.2;
        else
          start[0] =
            Math.sign(end[0]) * (tall ? 0.3 : exchanger || arrow ? 0.48 : 0.2);
        return (
          <Tube
            key={port}
            from={start}
            to={end}
            color={detail}
            radius={0.065}
          />
        );
      })}
    </group>
  );
}

function Direction({
  from,
  to,
  color,
}: {
  from: Point3;
  to: Point3;
  color: string;
}) {
  const a = new Vector3(...from);
  const b = new Vector3(...to);
  const delta = b.clone().sub(a);
  if (delta.lengthSq() < 1e-12) return null;
  return (
    <mesh
      position={a.lerp(b, 0.5)}
      quaternion={new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        delta.normalize(),
      )}
    >
      <coneGeometry args={[0.09, 0.15, 12]} />
      <meshStandardMaterial color={color} roughness={0.6} />
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
      const p = plantPosition(n);
      const projected = new Vector3(
        p[0],
        plantHeight(n.kind) + 0.3,
        p[2],
      ).project(camera);
      onProject(
        n.id,
        ((projected.x + 1) * size.width) / 2,
        ((-projected.y + 1) * size.height) / 2,
        projected.z >= -1 && projected.z <= 1,
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
  const dark = useSyncExternalStore(subscribeTheme, isDark, () => false);
  const centerX = project.units.length
    ? project.units.reduce((sum, unit) => sum + unit.position.x / 100, 0) /
      project.units.length
    : 4;
  const centerZ = project.units.length
    ? project.units.reduce((sum, unit) => sum + unit.position.y / 100, 0) /
      project.units.length
    : 1;
  return (
    <div className="plant-view">
      <button
        className="btn btn-sm camera-reset"
        onClick={() => setCamera((value) => value + 1)}
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
            frameloop="demand"
            camera={{ position: [centerX + 3, 9, centerZ + 10], fov: 45 }}
            fallback={
              <div className="empty-state">
                WebGL unavailable. Use the 2D flowsheet.
              </div>
            }
            onCreated={({ gl }) =>
              gl.domElement.addEventListener(
                "webglcontextlost",
                (event) => {
                  event.preventDefault();
                  setLost(true);
                },
                { once: true },
              )
            }
          >
            <color attach="background" args={[dark ? "#18231e" : "#f5f7f5"]} />
            <ambientLight intensity={1.6} />
            <directionalLight position={[4, 10, 5]} intensity={2} />
            <Grid
              infiniteGrid
              cellSize={1}
              sectionSize={5}
              fadeDistance={30}
              cellColor={dark ? "#2d3d34" : "#d9e1db"}
              sectionColor={dark ? "#3d5145" : "#becac2"}
            />
            {project.units.map((unit) => (
              <Vessel
                key={unit.id}
                unit={unit}
                selected={selected === unit.id}
                dark={dark}
                onSelect={onSelect}
              />
            ))}
            {project.edges.map((edge) => {
              const source = project.units.find(
                (unit) => unit.id === edge.source,
              );
              const target = project.units.find(
                (unit) => unit.id === edge.target,
              );
              if (!source || !target) return null;
              const points = plantStreamPath(source, target, edge);
              const color = streamColors[edge.color];
              return (
                <group key={edge.id}>
                  {points.slice(1).map((point, index) => (
                    <Tube
                      key={index}
                      from={points[index]}
                      to={point}
                      color={color}
                      radius={0.035}
                    />
                  ))}
                  {points.slice(1, -1).map((point, index) => (
                    <mesh key={`joint-${index}`} position={point}>
                      <sphereGeometry args={[0.035, 8, 6]} />
                      <meshStandardMaterial color={color} roughness={0.6} />
                    </mesh>
                  ))}
                  <Direction
                    from={points[points.length - 2]}
                    to={points[points.length - 1]}
                    color={color}
                  />
                </group>
              );
            })}
            <ProjectLabels
              project={project}
              onProject={(id, x, y, visible) => {
                const element = labels.current[id];
                if (element) {
                  element.style.transform = `translate(-50%,-100%) translate(${x}px,${y}px)`;
                  element.style.visibility = visible ? "visible" : "hidden";
                }
              }}
            />
            <OrbitControls
              makeDefault
              target={[centerX, 0.7, centerZ]}
              minDistance={3}
              maxDistance={50}
            />
          </Canvas>
        )}
      </Boundary>
      <div className="plant-labels">
        {project.units.map((unit) => (
          <button
            key={unit.id}
            ref={(element) => {
              labels.current[unit.id] = element;
            }}
            className={`plant-label ${selected === unit.id ? "active" : ""}`}
            onClick={() => onSelect(unit.id)}
          >
            {unit.id}
            <small>{unit.name}</small>
          </button>
        ))}
      </div>
      <div className="canvas-footnote">
        Illustrative geometry · orbit to explore · select equipment to edit
      </div>
    </div>
  );
}

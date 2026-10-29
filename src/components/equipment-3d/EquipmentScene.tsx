"use client";

import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Environment,
  Grid,
  Lightformer,
  OrbitControls,
} from "@react-three/drei";
import { Box3, Group, MathUtils, PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import type { Kind } from "@/domain/schema";
import { displayKinds, equipmentCatalog } from "./catalog";
import { EquipmentModel, SystemConnections } from "./EquipmentModel";
import { PlantInfrastructure } from "./PlantInfrastructure";
import type { EquipmentInstance, SystemExample } from "./system-geometry";
import { equipmentEnvelope } from "./plant-routing";
import { rackMembers } from "./system-geometry";

export type SceneMode = "inspect" | "collection" | "process";
export type CameraView = "perspective" | "front" | "top";
export type SceneProps = {
  kind: Kind;
  mode: SceneMode;
  system?: SystemExample;
  trayCount: number;
  section: boolean;
  transparent: boolean;
  rotate: boolean;
  playing: boolean;
  speed: number;
  motionVisible: boolean;
  grid: boolean;
  view: CameraView;
  reset: number;
  onSelect: (kind: Kind, instanceId?: string) => void;
  selectedId?: string | null;
  dark?: boolean;
  workspace?: boolean;
};

class SceneBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="equipment-scene-error">
          <h2>The 3D preview is unavailable</h2>
          <p>
            Try again with hardware acceleration enabled. Your project is
            preserved.
          </p>
          <button onClick={this.props.onRetry}>Reload preview</button>
        </div>
      );
    return this.props.children;
  }
}

const collectionPositions: Record<Kind, [number, number, number]> = {
  Feed: [-6, 0, 3],
  Product: [-2, 0, 3],
  Mixer: [-6, 0, -2.5],
  Splitter: [6, 0, 3],
  Heater: [2, 0, 3],
  Cooler: [-2, 0, -2.5],
  PBR: [2, 0, -2.5],
  Distillation: [6, 0, -2.5],
};

function CameraRig({
  subject,
  mode,
  kind,
  view,
  reset,
  rotate,
  system,
  trayCount,
}: Pick<
  SceneProps,
  "mode" | "kind" | "view" | "reset" | "rotate" | "system" | "trayCount"
> & {
  subject: React.RefObject<Group | null>;
}) {
  const controls = useRef<OrbitControlsType>(null);
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    const object = subject.current;
    if (!object || !(camera instanceof PerspectiveCamera)) return;
    const largeSystem = mode === "process" && !!system?.site;
    const box = new Box3().setFromObject(object);
    if (box.isEmpty()) return;
    // Include room for the ground labels, independently of the canvas UI.
    box.min.y -= mode === "inspect" ? 0.05 : 0.35;
    const center = box.getCenter(new Vector3());
    const fitPoints: Vector3[] = [];
    const addCorners = (min: number[], max: number[]) => {
      for (const x of [min[0], max[0]])
        for (const y of [min[1], max[1]])
          for (const z of [min[2], max[2]])
            fitPoints.push(new Vector3(x, y, z));
    };
    if (largeSystem) {
      const plant = system!;
      for (const item of plant.equipment) {
        const bounds = equipmentEnvelope(item);
        addCorners(
          bounds.min.map((v) => v - 0.15),
          bounds.max.map((v) => v + 0.15),
        );
        fitPoints.push(
          new Vector3(item.position[0], -0.15, item.position[2] + 1.4),
        );
      }
      for (const stream of plant.streams)
        for (const point of stream.points)
          fitPoints.push(new Vector3(...point));
      if (plant.site)
        for (const { center, size } of rackMembers(plant.site.rack))
          addCorners(
            center.map((v, i) => v - size[i] / 2),
            center.map((v, i) => v + size[i] / 2),
          );
    } else addCorners(box.min.toArray(), box.max.toArray());
    // Fit the projected corners, rather than a sphere whose empty volume makes
    // wide multi-equipment scenes unnecessarily small.
    const verticalFov = MathUtils.degToRad(camera.fov);
    const horizontalFov =
      2 * Math.atan((Math.tan(verticalFov / 2) * size.width) / size.height);
    const direction =
      view === "front"
        ? new Vector3(0, 0.04, 1)
        : view === "top"
          ? new Vector3(0, 1, 0.001)
          : new Vector3(
              largeSystem
                ? 0.4
                : mode === "collection"
                  ? 0.3
                  : mode === "process"
                    ? 0.22
                    : 0.75,
              largeSystem
                ? 1.05
                : mode === "collection"
                  ? 0.85
                  : mode === "process"
                    ? 0.5
                    : 0.48,
              1,
            );
    direction.normalize();
    const right = new Vector3(0, 1, 0).cross(direction).normalize();
    const up = direction.clone().cross(right).normalize();
    if (largeSystem) {
      // Fit the occupied silhouette, rather than empty air above the low bays.
      // This also centers the tall rear vessels and low front skids together.
      for (const axis of [right, up]) {
        const projections = fitPoints.map((point) =>
          point.clone().sub(center).dot(axis),
        );
        center.addScaledVector(
          axis,
          (Math.min(...projections) + Math.max(...projections)) / 2,
        );
      }
    }
    let distance = 0;
    for (const point of fitPoints) {
      const corner = point.clone().sub(center);
      distance = Math.max(
        distance,
        corner.dot(direction) +
          Math.abs(corner.dot(right)) / Math.tan(horizontalFov / 2),
        corner.dot(direction) +
          Math.abs(corner.dot(up)) / Math.tan(verticalFov / 2),
      );
    }
    camera.position
      .copy(center)
      .add(direction.multiplyScalar(distance * (largeSystem ? 1.1 : 1.15)));
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    controls.current?.target.copy(center);
    controls.current?.update();
    invalidate();
  }, [
    camera,
    size.width,
    size.height,
    subject,
    mode,
    system,
    trayCount,
    kind,
    view,
    reset,
    invalidate,
  ]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      autoRotate={rotate}
      autoRotateSpeed={0.7}
      enableDamping
      dampingFactor={0.09}
      minDistance={1.5}
      maxDistance={250}
      maxPolarAngle={Math.PI * 0.49}
    />
  );
}

function Studio({
  kind,
  mode,
  system,
  trayCount,
  section,
  transparent,
  rotate,
  playing,
  speed,
  motionVisible,
  grid,
  view,
  reset,
  onSelect,
  dark = false,
}: SceneProps) {
  const subject = useRef<Group>(null);
  const motion = { playing, speed, motionVisible, transparent };
  return (
    <>
      <color attach="background" args={[dark ? "#000000" : "#f4f6f4"]} />
      <ambientLight intensity={0.65} />
      <directionalLight
        position={[5, 10, 6]}
        intensity={2.7}
        color="#fff8ee"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-far={75}
      />
      <directionalLight
        position={[-6, 4, -4]}
        intensity={1.8}
        color="#dcebf0"
      />
      <Environment resolution={128} frames={1} environmentIntensity={0.8}>
        <Lightformer
          position={[-4, 4, 2]}
          scale={[5, 9, 1]}
          intensity={3}
          color="#ffffff"
          target={[0, 1, 0]}
        />
        <Lightformer
          position={[6, 3, 4]}
          scale={[3, 7, 1]}
          intensity={4}
          color="#e8f3f1"
          target={[0, 1, 0]}
        />
        <Lightformer
          position={[0, 6, -4]}
          scale={[9, 4, 1]}
          intensity={3}
          color="#fff2dd"
          target={[0, 0, 0]}
        />
      </Environment>
      <group ref={subject}>
        {mode === "inspect" ? (
          <EquipmentModel
            kind={kind}
            section={section}
            trayCount={trayCount}
            {...motion}
          />
        ) : null}
        {mode === "collection"
          ? displayKinds.map((item) => (
              <group key={item} position={collectionPositions[item]}>
                <EquipmentModel
                  kind={item}
                  trayCount={trayCount}
                  section={section}
                  {...motion}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(item);
                  }}
                />
              </group>
            ))
          : null}
        {mode === "process" && system ? (
          <>
            {system.equipment.map((item) => (
              <EquipmentModel
                key={item.id}
                kind={item.kind}
                position={item.position}
                rotation={[0, ((item.turn ?? 0) * Math.PI) / 2, 0]}
                section={section}
                trayCount={item.trayCount ?? trayCount}
                liquidColor={item.color}
                {...motion}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(item.kind, item.id);
                }}
              />
            ))}
            <SystemConnections system={system} section={section} {...motion} />
            <PlantInfrastructure system={system} />
          </>
        ) : null}
      </group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        receiveShadow
      >
        <planeGeometry args={[160, 160]} />
        <shadowMaterial transparent opacity={0.12} />
      </mesh>
      {grid ? (
        <Grid
          position={[0, -0.03, 0]}
          infiniteGrid
          cellSize={0.5}
          sectionSize={2.5}
          cellThickness={0.5}
          sectionThickness={0.6}
          cellColor={dark ? "#242e29" : "#d8dfda"}
          sectionColor={dark ? "#3b4941" : "#c4cec7"}
          fadeDistance={mode === "inspect" ? 18 : 40}
          fadeStrength={2}
        />
      ) : null}
      <CameraRig
        subject={subject}
        mode={mode}
        system={system}
        trayCount={trayCount}
        kind={kind}
        view={view}
        reset={reset}
        rotate={rotate}
      />
    </>
  );
}

type LabelRefs = React.RefObject<Map<string, HTMLButtonElement>>;
function ProjectLabels({
  labels,
  elements,
}: {
  labels: EquipmentInstance[];
  elements: LabelRefs;
}) {
  const point = new Vector3();
  useFrame(({ camera, size }) => {
    const occupied: { x: number; y: number; width: number }[] = [];
    for (const item of labels) {
      const element = elements.current.get(item.id);
      if (!element) continue;
      point
        .set(item.position[0], -0.04, item.position[2] + 1.15)
        .project(camera);
      element.style.setProperty(
        "transform",
        `translate3d(${((point.x + 1) * size.width) / 2}px, ${((-point.y + 1) * size.height) / 2}px, 0) translate(-50%, -50%)`,
      );
      const x = ((point.x + 1) * size.width) / 2;
      const y = ((-point.y + 1) * size.height) / 2;
      const width = element.offsetWidth;
      const collision =
        labels.length > 10 &&
        occupied.some(
          (label) =>
            Math.abs(label.x - x) < (label.width + width) / 2 + 3 &&
            Math.abs(label.y - y) < 25,
        );
      const visible = point.z <= 1 && point.z >= -1 && !collision;
      element.style.setProperty("visibility", visible ? "visible" : "hidden");
      if (visible) occupied.push({ x, y, width });
    }
  });
  return null;
}

function RendererHealth({
  onLost,
  onVisible,
}: {
  onLost: (lost: boolean) => void;
  onVisible: (visible: boolean) => void;
}) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    let intersects = true;
    const reportVisibility = () => onVisible(intersects && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      intersects = entry.isIntersecting;
      reportVisibility();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", reportVisibility);
    const handleLoss = (event: Event) => {
      event.preventDefault();
      onLost(true);
    };
    canvas.setAttribute("aria-label", "Interactive 3D equipment model");
    canvas.addEventListener("webglcontextlost", handleLoss);
    return () => {
      canvas.removeEventListener("webglcontextlost", handleLoss);
      document.removeEventListener("visibilitychange", reportVisibility);
      observer.disconnect();
    };
  }, [gl, onLost, onVisible]);
  return null;
}

export default function EquipmentScene(props: SceneProps) {
  const [lost, setLost] = useState(false);
  const [recovery, setRecovery] = useState(0);
  const [visible, setVisible] = useState(true);
  const labelElements = useRef(new Map<string, HTMLButtonElement>());
  const labels = useMemo<EquipmentInstance[]>(
    () =>
      props.mode === "collection"
        ? displayKinds.map((kind) => ({
            id: kind,
            kind,
            position: collectionPositions[kind],
            tag: equipmentCatalog[kind].tag,
            title: equipmentCatalog[kind].title,
            color: equipmentCatalog[kind].color,
          }))
        : props.mode === "process"
          ? (props.system?.equipment ?? [])
          : [],
    [props.mode, props.system],
  );
  const retry = () => {
    setLost(false);
    setRecovery((v) => v + 1);
  };
  return (
    <SceneBoundary key={recovery} onRetry={retry}>
      {lost ? (
        <div className="equipment-scene-error">
          <h2>The 3D connection was interrupted</h2>
          <p>Reload the preview to reconnect to your graphics hardware.</p>
          <button onClick={retry}>Reload preview</button>
        </div>
      ) : (
        <Canvas
          shadows="percentage"
          dpr={[1, 1.75]}
          frameloop={
            visible && (props.rotate || props.playing) ? "always" : "demand"
          }
          camera={{ position: [7, 5, 10], fov: 36, near: 0.05, far: 600 }}
          gl={{ antialias: true, alpha: false }}
          fallback={
            <div className="equipment-scene-error">
              <h2>WebGL is unavailable</h2>
              <p>
                Open this view in a browser with hardware acceleration enabled.
              </p>
            </div>
          }
        >
          <RendererHealth onLost={setLost} onVisible={setVisible} />
          <Studio
            {...props}
            playing={props.playing && visible}
            rotate={props.rotate && visible}
          />
          <ProjectLabels labels={labels} elements={labelElements} />
        </Canvas>
      )}
      {!lost && labels.length ? (
        <div
          className={`equipment-label-layer${props.workspace ? " plant-labels" : ""}`}
        >
          {labels.map((item) => (
            <button
              key={item.id}
              ref={(element) => {
                if (element) labelElements.current.set(item.id, element);
                else labelElements.current.delete(item.id);
              }}
              className={`equipment-world-label${props.mode === "process" ? " has-tag" : ""}${labels.length > 10 ? " compact-label" : ""}${props.workspace ? " plant-label" : ""}${props.selectedId === item.id ? " active" : ""}`}
              title={`${item.tag} · ${item.title}`}
              aria-label={`${item.tag} ${item.title}`}
              aria-pressed={
                props.workspace ? props.selectedId === item.id : undefined
              }
              onClick={() => props.onSelect(item.kind, item.id)}
            >
              {props.mode === "process" ? <span>{item.tag}</span> : null}
              <span className="equipment-label-title">{item.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </SceneBoundary>
  );
}

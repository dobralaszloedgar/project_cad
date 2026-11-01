"use client";

import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Lightformer,
  CameraControls,
  CameraControlsImpl,
} from "@react-three/drei";
import {
  Box3,
  DirectionalLight,
  Group,
  MathUtils,
  PerspectiveCamera,
  Vector3,
} from "three";
import { FloorGrid } from "../graphics/FloorGrid";
import { GraphicsSettings } from "../graphics/GraphicsSettings";
import { AccelerationHelp } from "../graphics/AccelerationHelp";
import { RendererRuntime } from "../graphics/RendererRuntime";
import { StudioEnvironment } from "../graphics/StudioEnvironment";
import {
  createSceneRenderer,
  readGraphicsPreference,
  saveGraphicsPreference,
  type GraphicsInfo,
  type GraphicsPreference,
} from "../graphics/renderer";
import type { Kind } from "@/domain/schema";
import { shortcutsBlocked } from "@/lib/keyboard";
import { keyboardPan, wheelNavigation, ZOOM_STEP } from "../canvas-navigation";
import {
  cameraDistanceLimits,
  MIN_CAMERA_DISTANCE,
  orbitAround,
  panCamera,
  updateCameraClipping,
  zoomCamera,
} from "./camera-navigation";
import { displayKinds, equipmentCatalog } from "./catalog";
import { EquipmentModel, SystemConnections } from "./EquipmentModel";
import { PlantInfrastructure } from "./PlantInfrastructure";
import type { EquipmentInstance, SystemExample } from "./system-geometry";
import { equipmentEnvelope } from "./plant-routing";
import { rackMembers } from "./system-geometry";
import type { PlantCompositionColors } from "./composition-colors";
import type { TrayHydraulicsResult } from "@/domain/equipment/tray-hydraulics";

export type SceneMode = "inspect" | "collection" | "process";
export type CameraView = "perspective" | "front" | "top";
export type SceneProps = {
  kind: Kind;
  mode: SceneMode;
  system?: SystemExample;
  compositionColors?: PlantCompositionColors;
  columnHydraulics?: Record<string, TrayHydraulicsResult>;
  trayCount: number;
  section: boolean;
  transparent: boolean;
  rotate: boolean;
  playing: boolean;
  speed: number;
  motionVisible: boolean;
  grid: boolean;
  onToggleGrid?: () => void;
  view: CameraView;
  reset: number;
  focus?: number;
  onSelect: (kind: Kind, instanceId?: string) => void;
  selectedId?: string | null;
  dark?: boolean;
  canvasColor?: string;
  workspace?: boolean;
  graphicsSettingsContainer?: HTMLElement | null;
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
          <AccelerationHelp />
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
  selectedId,
  focus = 0,
  onToggleGrid,
  onToggleLabels,
}: Pick<
  SceneProps,
  | "mode"
  | "kind"
  | "view"
  | "reset"
  | "rotate"
  | "system"
  | "trayCount"
  | "selectedId"
  | "focus"
  | "onToggleGrid"
> & {
  subject: React.RefObject<Group | null>;
  onToggleLabels: () => void;
}) {
  const controls = useRef<CameraControlsImpl>(null);
  const { camera, get, gl, invalidate } = useThree();
  const hasFitted = useRef(false);
  const keys = useRef(new Set<string>());
  const panMode = useRef(false);
  const autoOrbitAnchored = useRef(false);
  const interacting = useRef(false);
  const previousFocus = useRef(focus);
  const reducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fitView = useCallback(
    (animate: boolean) => {
      const size = get().size;
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
      const fitDistance = distance * (largeSystem ? 1.1 : 1.15);
      const limits = cameraDistanceLimits(fitDistance);
      const control = controls.current;
      if (control) {
        control.minDistance = limits.min;
        control.maxDistance = limits.max;
      }
      updateCameraClipping(
        camera,
        fitDistance,
        Math.max(100, limits.max + box.getSize(new Vector3()).length() * 2),
      );
      const position = new Vector3()
        .copy(center)
        .add(direction.multiplyScalar(fitDistance));
      controls.current?.stop();
      void controls.current?.setFocalOffset(0, 0, 0, false);
      void controls.current?.setLookAt(
        ...position.toArray(),
        ...center.toArray(),
        animate && !reducedMotion(),
      );
      invalidate();
    },
    [camera, get, subject, mode, system, view, invalidate],
  );
  useEffect(() => {
    fitView(hasFitted.current);
    hasFitted.current = true;
  }, [fitView, reset, kind, trayCount]);

  const focusSelection = useCallback(() => {
    const control = controls.current;
    const item = system?.equipment.find((item) => item.id === selectedId);
    if (!control || !item || !(camera instanceof PerspectiveCamera)) {
      fitView(true);
      return;
    }
    const bounds = equipmentEnvelope(item);
    const box = new Box3(
      new Vector3(...bounds.min),
      new Vector3(...bounds.max),
    );
    const center = box.getCenter(new Vector3());
    const radius = box.getSize(new Vector3()).length() / 2;
    const halfFov = Math.min(
      MathUtils.degToRad(camera.fov) / 2,
      Math.atan(Math.tan(MathUtils.degToRad(camera.fov) / 2) * camera.aspect),
    );
    const direction = camera.position
      .clone()
      .sub(control.getTarget(new Vector3()))
      .normalize();
    const position = center
      .clone()
      .addScaledVector(direction, (radius / Math.sin(halfFov)) * 1.2);
    control.stop();
    void control.setFocalOffset(0, 0, 0, false);
    void control.setLookAt(
      ...position.toArray(),
      ...center.toArray(),
      !reducedMotion(),
    );
    invalidate();
  }, [camera, system, selectedId, fitView, invalidate]);
  useEffect(() => {
    if (focus === previousFocus.current) return;
    previousFocus.current = focus;
    focusSelection();
  }, [focus, focusSelection]);

  const anchorOrbit = () => {
    const control = controls.current;
    const object = subject.current;
    if (!control) return;
    const item = system?.equipment.find((item) => item.id === selectedId);
    if (item) {
      const bounds = equipmentEnvelope(item);
      orbitAround(
        control,
        new Box3(
          new Vector3(...bounds.min),
          new Vector3(...bounds.max),
        ).getCenter(new Vector3()),
      );
    } else if (mode === "inspect" && object) {
      orbitAround(
        control,
        new Box3().setFromObject(object).getCenter(new Vector3()),
      );
    }
    invalidate();
  };

  useEffect(() => {
    autoOrbitAnchored.current = false;
  }, [system, selectedId, mode, rotate, reset, view, kind]);

  useEffect(() => {
    const canvas = gl.domElement;
    const pressed = keys.current;
    const surface =
      canvas.closest(".plant-view") ?? canvas.parentElement?.parentElement;
    const updateMode = () => {
      const panning = panMode.current || pressed.has("Space");
      canvas.setAttribute("data-navigation-mode", panning ? "pan" : "orbit");
      canvas.style.setProperty(
        "cursor",
        panning ? "move" : "var(--cursor-grab, grab)",
      );
    };
    canvas.setAttribute("tabindex", "0");
    canvas.setAttribute(
      "aria-keyshortcuts",
      "P V Space ArrowUp ArrowDown ArrowLeft ArrowRight + - F Shift+F G L Home",
    );
    updateMode();
    const pointerDown = (event: PointerEvent) => {
      canvas.focus({ preventScroll: true });
      if (controls.current)
        controls.current.mouseButtons.left =
          panMode.current || event.shiftKey || pressed.has("Space")
            ? CameraControlsImpl.ACTION.TRUCK
            : CameraControlsImpl.ACTION.ROTATE;
    };
    const keyDown = (event: KeyboardEvent) => {
      if (
        shortcutsBlocked(event) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      // Include labels and the viewport toolbar. Space may be held before the
      // initial pointer-down, as it is on the 2D canvas.
      if (
        !(event.target instanceof Node) ||
        (!surface?.contains(event.target) && !canvas.matches(":hover"))
      )
        return;
      const control = controls.current;
      if (!control || !(camera instanceof PerspectiveCamera)) return;
      const key = event.key.toLowerCase();
      const pan = keyboardPan(key, event.shiftKey);
      let handled = true;
      if (pan) panCamera(control, camera, pan[0], pan[1], get().size.height);
      else if (["+", "=", "-"].includes(key))
        zoomCamera(control, camera, key === "-" ? 1 / ZOOM_STEP : ZOOM_STEP);
      else if (key === " ") {
        if (event.target instanceof Element && event.target.closest("button"))
          return;
        pressed.add("Space");
        updateMode();
      } else if (key === "p" || key === "v") {
        panMode.current = key === "p";
        updateMode();
      } else if ((key === "f" || key === "home") && !event.repeat) {
        if (key === "f" && event.shiftKey) focusSelection();
        else fitView(true);
      } else if (key === "g" && !event.repeat) onToggleGrid?.();
      else if (key === "l" && !event.repeat) onToggleLabels();
      else handled = false;
      if (handled) {
        event.preventDefault();
        autoOrbitAnchored.current = false;
        invalidate();
      }
    };
    const wheel = (event: WheelEvent) => {
      const control = controls.current;
      if (
        !control ||
        !(camera instanceof PerspectiveCamera) ||
        event.defaultPrevented ||
        !(event.target instanceof Element) ||
        !event.target.closest("canvas, .equipment-label-layer") ||
        document.querySelector("dialog[open]")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      autoOrbitAnchored.current = false;
      const gesture = wheelNavigation(event, /Mac/.test(navigator.userAgent));
      if (event.ctrlKey || event.metaKey) {
        const bounds = canvas.getBoundingClientRect();
        zoomCamera(control, camera, gesture.zoom, {
          x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          y: 1 - ((event.clientY - bounds.top) / bounds.height) * 2,
        });
      } else
        panCamera(control, camera, gesture.x, gesture.y, get().size.height);
      invalidate();
    };
    const keyUp = (event: KeyboardEvent) => {
      pressed.delete(event.code);
      updateMode();
    };
    const clear = () => {
      pressed.clear();
      interacting.current = false;
      controls.current?.cancel();
      controls.current?.stop();
      updateMode();
    };
    canvas.addEventListener("pointerdown", pointerDown, true);
    // CameraControls connects to the Canvas wrapper; capture the wheel before
    // its native pinch handler can also apply a lens zoom.
    surface?.addEventListener("wheel", wheel as EventListener, {
      capture: true,
      passive: false,
    });
    window.addEventListener("keydown", keyDown, true);
    window.addEventListener("keyup", keyUp);
    canvas.addEventListener("blur", clear);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      clear();
      canvas.removeEventListener("pointerdown", pointerDown, true);
      window.removeEventListener("keydown", keyDown, true);
      surface?.removeEventListener("wheel", wheel as EventListener, true);
      window.removeEventListener("keyup", keyUp);
      canvas.removeEventListener("blur", clear);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, [
    gl,
    camera,
    get,
    invalidate,
    fitView,
    focusSelection,
    onToggleGrid,
    onToggleLabels,
  ]);

  useFrame((_, delta) => {
    const control = controls.current;
    if (!control) return;
    if (camera instanceof PerspectiveCamera) {
      // Preserve depth precision across a whole plant, then move the near plane
      // inward for inspecting fittings and individual catalyst grains.
      updateCameraClipping(camera, control.distance);
    }
    const dt = Math.min(delta, 0.05);
    if (rotate && !interacting.current) {
      if (!autoOrbitAnchored.current) {
        if (control.active) return;
        anchorOrbit();
        autoOrbitAnchored.current = true;
      }
      void control.rotate(-dt * 0.073, 0, false);
    }
  });
  return (
    <CameraControls
      ref={controls}
      makeDefault
      regress
      smoothTime={0.18}
      draggingSmoothTime={0.06}
      dollyToCursor
      dollySpeed={0.65}
      azimuthRotateSpeed={0.8}
      polarRotateSpeed={0.8}
      truckSpeed={1}
      minDistance={MIN_CAMERA_DISTANCE}
      minPolarAngle={0.001}
      maxPolarAngle={Math.PI * 0.495}
      mouseButtons={{
        left: CameraControlsImpl.ACTION.ROTATE,
        middle: CameraControlsImpl.ACTION.TRUCK,
        right: CameraControlsImpl.ACTION.TRUCK,
        wheel: CameraControlsImpl.ACTION.NONE,
      }}
      touches={{
        one: CameraControlsImpl.ACTION.TOUCH_ROTATE,
        two: CameraControlsImpl.ACTION.TOUCH_DOLLY_TRUCK,
        three: CameraControlsImpl.ACTION.TOUCH_TRUCK,
      }}
      onControlStart={() => {
        interacting.current = true;
        autoOrbitAnchored.current = false;
        const action = controls.current?.currentAction;
        if (
          action === CameraControlsImpl.ACTION.ROTATE ||
          action === CameraControlsImpl.ACTION.TOUCH_ROTATE
        )
          anchorOrbit();
        gl.domElement.style.setProperty(
          "cursor",
          "var(--cursor-grabbing, grabbing)",
        );
      }}
      onControlEnd={() => {
        interacting.current = false;
        gl.domElement.style.setProperty("cursor", "var(--cursor-grab, grab)");
      }}
    />
  );
}

function Studio({
  kind,
  mode,
  system,
  compositionColors,
  columnHydraulics,
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
  focus,
  selectedId,
  onToggleGrid,
  onToggleLabels,
  onSelect,
  dark = false,
  canvasColor,
}: SceneProps & { onToggleLabels: () => void }) {
  const subject = useRef<Group>(null);
  const keyLight = useRef<DirectionalLight>(null);
  const get = useThree((state) => state.get);
  useEffect(() => {
    const { invalidate } = get();
    const shadow = keyLight.current?.shadow;
    if (!shadow) return;
    // Camera movement does not change the equipment's shadows. Rebuild them
    // after geometry edits, or each frame when equipment is actually animated.
    shadow.autoUpdate = playing;
    shadow.needsUpdate = true;
    invalidate();
    return () => {
      shadow.autoUpdate = true;
    };
  }, [get, kind, mode, system, trayCount, section, transparent, playing]);
  const motion = { playing, speed, motionVisible, transparent };
  return (
    <>
      <color
        attach="background"
        args={[canvasColor ?? (dark ? "#000000" : "#f4f6f4")]}
      />
      <ambientLight intensity={0.65} />
      <directionalLight
        ref={keyLight}
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
      <StudioEnvironment resolution={128} intensity={0.8}>
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
      </StudioEnvironment>
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
                    if (event.delta > 4 || event.button !== 0) return;
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
                column={item.column}
                hydraulics={columnHydraulics?.[item.id]}
                liquidColor={
                  compositionColors?.equipment[item.id]?.color ?? item.color
                }
                compositionColors={compositionColors?.equipment[item.id]}
                {...motion}
                onClick={(event) => {
                  if (event.delta > 4 || event.button !== 0) return;
                  event.stopPropagation();
                  onSelect(item.kind, item.id);
                }}
              />
            ))}
            <SystemConnections
              system={system}
              streamColors={compositionColors?.streams}
              section={section}
              {...motion}
            />
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
        <FloorGrid
          position={[0, -0.03, 0]}
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
        focus={focus}
        selectedId={selectedId}
        onToggleGrid={onToggleGrid}
        onToggleLabels={onToggleLabels}
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
  const point = useMemo(() => new Vector3(), []);
  const widths = useRef(new Map<string, number>());
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    // Measure labels outside the render loop: interleaved width reads and
    // transform writes otherwise force layout once per label while navigating.
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.labelId;
        if (id)
          widths.current.set(id, (entry.target as HTMLElement).offsetWidth);
      }
      invalidate();
    });
    widths.current.clear();
    for (const item of labels) {
      const element = elements.current.get(item.id);
      if (element) {
        widths.current.set(item.id, element.offsetWidth);
        observer.observe(element);
      }
    }
    return () => observer.disconnect();
  }, [labels, elements, invalidate]);
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
      const width = widths.current.get(item.id) ?? 80;
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

export default function EquipmentScene(props: SceneProps) {
  const [labelsVisible, setLabelsVisible] = useState(true);
  const toggleLabels = useCallback(
    () => setLabelsVisible((value) => !value),
    [],
  );
  const [lost, setLost] = useState(false);
  const [recovery, setRecovery] = useState(0);
  const [visible, setVisible] = useState(true);
  const [preference, setPreference] = useState(readGraphicsPreference);
  const [info, setInfo] = useState<GraphicsInfo | null>(null);
  const [recoverWithWebGL, setRecoverWithWebGL] = useState(false);
  const handleLost = useCallback(() => setLost(true), []);
  const createRenderer = useCallback(
    ({ canvas }: { canvas: EventTarget }) =>
      createSceneRenderer({
        canvas: canvas as HTMLCanvasElement,
        preference: recoverWithWebGL ? "webgl" : preference,
      }),
    [preference, recoverWithWebGL],
  );
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
    // A lost WebGPU device may be the OS switching GPUs. Retry on the broadly
    // supported backend with a fresh canvas; never reuse a lost GPU context.
    setRecoverWithWebGL(info?.backend === "webgpu");
    setInfo(null);
    setLost(false);
    setRecovery((v) => v + 1);
  };
  const changePreference = (value: GraphicsPreference) => {
    saveGraphicsPreference(value);
    setPreference(value);
    setRecoverWithWebGL(false);
    setInfo(null);
    setLost(false);
    setRecovery((v) => v + 1);
  };
  return (
    <>
      <GraphicsSettings
        info={info}
        preference={preference}
        onChange={changePreference}
        container={props.graphicsSettingsContainer}
      />
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
            gl={createRenderer}
            fallback={
              <div className="equipment-scene-error">
                <h2>3D graphics are unavailable</h2>
                <AccelerationHelp />
              </div>
            }
          >
            <RendererRuntime
              onLost={handleLost}
              onVisible={setVisible}
              onInfo={setInfo}
              label="Interactive 3D equipment model"
            />
            <Studio
              {...props}
              playing={props.playing && visible}
              rotate={props.rotate && visible}
              onToggleLabels={toggleLabels}
            />
            <ProjectLabels labels={labels} elements={labelElements} />
          </Canvas>
        )}
        {!lost && labels.length ? (
          <div
            className={`equipment-label-layer${props.workspace ? " plant-labels" : ""}`}
            style={{ display: labelsVisible ? undefined : "none" }}
          >
            {labels.map((item) => (
              <button
                key={item.id}
                data-label-id={item.id}
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
    </>
  );
}

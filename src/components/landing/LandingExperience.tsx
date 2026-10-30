"use client";

import {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import {
  CatmullRomCurve3,
  Group,
  MathUtils,
  PerspectiveCamera,
  Vector3,
} from "three";
import type { MotionValue } from "motion/react";
import { EquipmentModel } from "@/components/equipment-3d/EquipmentModel";
import { equipmentEnvelope } from "@/components/equipment-3d/plant-routing";
import type { SystemExample } from "@/components/equipment-3d/system-geometry";
import SceneBoundary from "./SceneBoundary";
import ThinkingCore from "./AiOrb";
import MorphingProcess from "./MorphingProcess";
import IndustrialBackdrop from "./IndustrialBackdrop";
import CadProjection from "./CadProjection";
import type { CadBridge } from "./CadWorkbench";
import {
  CAD_WIDTH,
  CAD_HEIGHT,
  CAD_SCALE,
  CAD_CENTER_Z,
} from "./landing-construction";
import { makeLandingSystem, reveal } from "./landing-system";
import styles from "./LandingPage.module.css";

export type ExperienceProps = {
  onReady: () => void;
  onUnavailable: () => void;
  progress: MotionValue<number>;
  cadBridge: CadBridge;
  construction: MotionValue<number>;
  pointerX: MotionValue<number>;
  pointerY: MotionValue<number>;
  playing: boolean;
  transparent: boolean;
  reduced: boolean;
};

function PlaybackTelemetry({ progress, construction }: ExperienceProps) {
  const gl = useThree((state) => state.gl);
  useFrame(() => {
    gl.domElement.setAttribute(
      "data-construction",
      construction.get().toFixed(4),
    );
    gl.domElement.setAttribute(
      "data-story-progress",
      progress.get().toFixed(4),
    );
  }, -2);
  return null;
}

function CameraRig({
  progress,
  construction,
  pointerX,
  pointerY,
  reduced,
  system,
}: ExperienceProps & { system: SystemExample }) {
  const { camera, size, invalidate, gl } = useThree();
  const vectors = useMemo(
    () => ({
      target: new Vector3(),
      direction: new Vector3(),
      right: new Vector3(),
      up: new Vector3(),
      offset: new Vector3(),
      tourTarget: new Vector3(),
    }),
    [],
  );
  const tour = useMemo(
    () => ({
      camera: new CatmullRomCurve3([
        new Vector3(),
        new Vector3(-0.7, 3.8, 10.2),
        new Vector3(-11, 4.5, -10.5),
        new Vector3(10.2, 6.4, -14.8),
      ]),
      target: new CatmullRomCurve3([
        new Vector3(),
        new Vector3(-4, 1.2, 3.7),
        new Vector3(-3.9, 1.8, -6),
        new Vector3(3.1, 3.9, -6),
      ]),
    }),
    [],
  );
  const bounds = useMemo(() => {
    const points: Vector3[] = [];
    for (const item of system.equipment) {
      const box = equipmentEnvelope(item);
      for (const x of [box.min[0], box.max[0]])
        for (const y of [box.min[1], box.max[1]])
          for (const z of [box.min[2], box.max[2]])
            points.push(new Vector3(x, y, z));
    }
    for (const x of [-CAD_WIDTH / CAD_SCALE / 2, CAD_WIDTH / CAD_SCALE / 2])
      for (const z of [-CAD_HEIGHT / CAD_SCALE / 2, CAD_HEIGHT / CAD_SCALE / 2])
        points.push(new Vector3(x, 0, z + CAD_CENTER_Z));
    return points;
  }, [system]);
  useEffect(() => {
    const unsub = [progress, construction, pointerX, pointerY].map((value) =>
      value.on("change", invalidate),
    );
    return () => unsub.forEach((fn) => fn());
  }, [progress, construction, pointerX, pointerY, invalidate]);
  useFrame(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const p = progress.get();
    const intoDrawing = reveal(p, 0.1, 0.34);
    const unfold = reveal(p, 0.55, 0.87);
    const orbit = reveal(p, 0.55, 0.94);
    const portrait = size.width / size.height < 0.85;
    const { target, direction, right, up, offset } = vectors;
    const pointer = reduced ? 0 : pointerX.get() * 0.14 * (1 - intoDrawing);
    const angle = 0.32 * orbit + pointer;
    const elevation =
      MathUtils.lerp(-0.1, Math.PI / 2 - 0.001, intoDrawing) - orbit * 1.08;
    direction.set(
      Math.sin(angle) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(angle) * Math.cos(elevation),
    );
    target.set(
      0.3 * intoDrawing,
      4.1 * (1 - intoDrawing) + 2.15 * unfold,
      MathUtils.lerp(CAD_CENTER_Z + (portrait ? 2.6 : 1.1), -1.3, unfold) *
        intoDrawing,
    );
    if (!reduced)
      target.setY(target.y + pointerY.get() * 0.2 * (1 - intoDrawing));
    right.set(0, 1, 0).cross(direction).normalize();
    up.copy(direction).cross(right).normalize();
    const vertical = Math.tan(MathUtils.degToRad(camera.fov) / 2);
    const horizontal = (vertical * size.width) / size.height;
    let fit = 0;
    for (const point of bounds) {
      offset.set(point.x, point.y * unfold, point.z).sub(target);
      fit = Math.max(
        fit,
        offset.dot(direction) + Math.abs(offset.dot(right)) / horizontal,
        offset.dot(direction) + Math.abs(offset.dot(up)) / vertical,
      );
    }
    const introDistance = portrait ? 29 : 24;
    const margin = portrait
      ? MathUtils.lerp(
          size.width > 600 ? 1.38 : size.height < 780 ? 1.24 : 1.03,
          1.02,
          unfold,
        )
      : MathUtils.lerp(1.38, 1.12, unfold);
    const distance = MathUtils.lerp(introDistance, fit * margin, intoDrawing);
    camera.position.copy(target).addScaledVector(direction, distance);
    // Continue past the overview along a single, tangent-continuous camera path.
    // Both position and look-at travel together, keeping each component in view.
    tour.camera.points[0].copy(camera.position);
    tour.target.points[0].copy(target);
    const tourProgress = reveal(p, 1, 1.65);
    if (tourProgress > 0) {
      tour.camera.getPoint(tourProgress, camera.position);
      tour.target.getPoint(tourProgress, vectors.tourTarget);
      if (portrait) {
        camera.position
          .sub(vectors.tourTarget)
          .multiplyScalar(1 + 0.5 * reveal(p, 1, 1.12))
          .add(vectors.tourTarget);
      }
      target.copy(vectors.tourTarget);
    }
    camera.lookAt(target);
    // DOM projection reads this in the same frame, before WebGL renders.
    camera.updateMatrixWorld();
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    gl.domElement.setAttribute("data-unfold", unfold.toFixed(4));
    gl.domElement.setAttribute("data-tour", tourProgress.toFixed(4));
    gl.domElement.setAttribute(
      "data-focus",
      p < 1.07
        ? "overview"
        : p < 1.29
          ? "heater"
          : p < 1.49
            ? "reactor"
            : "column",
    );
    gl.domElement.setAttribute(
      "data-camera-pose",
      camera.position
        .toArray()
        .map((n) => n.toFixed(3))
        .join(","),
    );
    gl.domElement.setAttribute(
      "data-process-phase",
      p < 0.25
        ? "imagine"
        : p < 0.55
          ? "blueprint"
          : p < 0.87
            ? "unfolding"
            : "plant",
    );
  }, -1);
  return null;
}

/** Real catalog models frame the opening, including live liquid and internal parts. */
function LiveWorkshop({ progress, playing, transparent }: ExperienceProps) {
  const left = useRef<Group>(null);
  const right = useRef<Group>(null);
  const heater = useRef<Group>(null);
  const { size } = useThree();
  useFrame(() => {
    const exit = reveal(progress.get(), 0.1, 0.32);
    const mobile = size.width / size.height < 0.85;
    if (left.current) {
      left.current.visible = exit < 0.999;
      left.current.position.x = (mobile ? -4.6 : -11.5) - exit * 25;
      left.current.position.z = 3 + exit * 6;
    }
    if (right.current) {
      right.current.visible = exit < 0.999;
      right.current.position.x = (mobile ? 4.8 : 11.2) + exit * 25;
      right.current.position.z = -1 + exit * 6;
    }
    if (heater.current) {
      heater.current.visible = exit < 0.999 && !mobile;
      heater.current.position.x = -6 - exit * 25;
    }
  });
  const props = {
    transparent,
    section: false,
    playing,
    speed: 1.5,
    motionVisible: true,
  };
  return (
    <>
      <group
        ref={left}
        position={[-11.5, 0, 3]}
        scale={3.8}
        rotation={[0, 0.45, 0]}
      >
        <EquipmentModel kind="Feed" liquidColor="#3cd9c4" {...props} />
      </group>
      <group
        ref={right}
        position={[11.2, 0, -1]}
        scale={2.3}
        rotation={[0, -0.7, 0]}
      >
        <EquipmentModel
          kind="Distillation"
          trayCount={8}
          liquidColor="#50c7d8"
          {...props}
        />
      </group>
      <group
        ref={heater}
        position={[-6, -0.1, 5.5]}
        scale={2.3}
        rotation={[0, -0.3, 0]}
      >
        <EquipmentModel kind="Heater" liquidColor="#e8a66c" {...props} />
      </group>
    </>
  );
}

function Experience(props: ExperienceProps) {
  const system = useMemo(() => makeLandingSystem(), []);
  return (
    <>
      <PlaybackTelemetry {...props} />
      <CameraRig {...props} system={system} />
      <CadProjection bridge={props.cadBridge} />
      <color attach="background" args={["#05131f"]} />
      <fog attach="fog" args={["#0a2433", 32, 100]} />
      <ambientLight intensity={0.32} />
      <directionalLight
        position={[2, 15, 12]}
        intensity={1.25}
        color="#a8d4df"
      />
      <directionalLight
        position={[-12, 9, 4]}
        intensity={0.75}
        color="#6eabc5"
      />
      <directionalLight
        position={[12, 8, -6]}
        intensity={1.45}
        color="#ffd09a"
      />
      <Environment resolution={64} frames={1} environmentIntensity={0.5}>
        <Lightformer
          position={[-6, 8, 5]}
          scale={[8, 15, 1]}
          intensity={4}
          color="#d8faff"
          target={[0, 3, 0]}
        />
        <Lightformer
          position={[8, 6, 3]}
          scale={[8, 12, 1]}
          intensity={5}
          color="#ffe8ca"
          target={[0, 3, 0]}
        />
        <Lightformer
          position={[0, 13, -5]}
          scale={[20, 7, 1]}
          intensity={5}
          color="#e6f7ff"
          target={[0, 2, 0]}
        />
      </Environment>
      <IndustrialBackdrop progress={props.progress} playing={props.playing} />
      <LiveWorkshop {...props} />
      <ThinkingCore progress={props.progress} playing={props.playing} />
      <MorphingProcess
        system={system}
        progress={props.progress}
        bridge={props.cadBridge}
        transparent={props.transparent}
        playing={props.playing}
      />
      <ShaderWarmup
        transparent={props.transparent}
        onReady={props.onReady}
        onUnavailable={props.onUnavailable}
      />
    </>
  );
}

function ShaderWarmup({
  transparent,
  onReady,
  onUnavailable,
}: {
  transparent: boolean;
  onReady: () => void;
  onUnavailable: () => void;
}) {
  const { gl, scene, camera, invalidate } = useThree();
  const warmup = useRef({ compiled: false, frames: 0, reported: false });
  const readyFrame = useRef<number | null>(null);
  const fence = useRef<WebGLSync | null>(null);
  useFrame(() => {
    const state = warmup.current;
    if (!state.compiled || state.reported) return;
    // Shader compilation alone doesn't mean pixels have reached the screen.
    // Present two complete frames, including the environment and camera pose,
    // beneath the opening preview before allowing the composited handoff.
    if (++state.frames < 3) {
      invalidate();
      return;
    }
    state.reported = true;
    readyFrame.current = requestAnimationFrame(() => {
      // This Three.js renderer requires WebGL 2; its type still includes WebGL 1.
      const gpu = gl.getContext() as WebGL2RenderingContext;
      const sync = gpu.fenceSync(gpu.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!sync) {
        onUnavailable();
        return;
      }
      fence.current = sync;
      gpu.flush();
      const check = () => {
        // A zero timeout polls the GPU without blocking the page. Submitted
        // draw calls aren't necessarily complete, especially on a cold GPU.
        const result = gpu.clientWaitSync(sync, 0, 0);
        if (result === gpu.TIMEOUT_EXPIRED) {
          readyFrame.current = requestAnimationFrame(check);
          return;
        }
        gpu.deleteSync(sync);
        fence.current = null;
        readyFrame.current = null;
        if (result === gpu.WAIT_FAILED) {
          onUnavailable();
          return;
        }
        gl.domElement.setAttribute("data-ready", "true");
        onReady();
      };
      readyFrame.current = requestAnimationFrame(check);
    });
  });
  useEffect(() => {
    let active = true;
    warmup.current = { compiled: false, frames: 0, reported: false };
    const frame = requestAnimationFrame(() => {
      // Compile hidden equipment too, before scrolling reveals its materials.
      void gl
        .compileAsync(scene, camera)
        .then(() => {
          if (!active) return;
          warmup.current.compiled = true;
          invalidate();
        })
        .catch(() => {
          if (active) onUnavailable();
        });
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      if (readyFrame.current !== null) cancelAnimationFrame(readyFrame.current);
      if (fence.current)
        (gl.getContext() as WebGL2RenderingContext).deleteSync(fence.current);
      fence.current = null;
    };
  }, [gl, scene, camera, invalidate, transparent, onReady, onUnavailable]);
  return null;
}

function Fallback({ onUnavailable }: { onUnavailable?: () => void }) {
  useEffect(() => onUnavailable?.(), [onUnavailable]);
  return (
    <div className={styles.plantFallback}>
      <span>Explore the equipment collection</span>
      <a href="/sandbox/equipment">Open the 3D sandbox ↗</a>
    </div>
  );
}

/** One renderer, one camera, one coordinate system for the entire story. */
// Readiness only changes the DOM crossfade. Avoid reconciling the full WebGL
// tree during that handoff; start its animation after the entrance settles.
export default memo(function LandingExperience(props: ExperienceProps) {
  const [lost, setLost] = useState(false);
  const handleUnavailable = useCallback(() => setLost(true), []);
  const fallback = <Fallback onUnavailable={props.onUnavailable} />;
  return (
    <SceneBoundary fallback={fallback}>
      {lost ? (
        fallback
      ) : (
        <Canvas
          aria-label="Live equipment, a flowsheet and a continuously unfolding 3D process plant"
          dpr={[1, 2]}
          frameloop={props.playing ? "always" : "demand"}
          camera={{ position: [0, 8, 24], fov: 38, near: 0.1, far: 220 }}
          gl={{
            alpha: true,
            antialias: true,
            powerPreference: "high-performance",
          }}
          // Canvas fallback children are mounted even when WebGL is supported.
          // Only the error boundary/context-loss view reports unavailability.
          fallback={<Fallback />}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener(
              "webglcontextlost",
              (event) => {
                event.preventDefault();
                setLost(true);
              },
              { once: true },
            );
          }}
        >
          <Suspense fallback={null}>
            <Experience {...props} onUnavailable={handleUnavailable} />
          </Suspense>
        </Canvas>
      )}
    </SceneBoundary>
  );
});

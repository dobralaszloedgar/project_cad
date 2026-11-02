// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  GridHelper,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Scene,
  Vector3,
  type BufferGeometry,
  type Texture,
} from "three";
import {
  PMREMGenerator,
  Line2NodeMaterial,
  type WebGPURenderer,
} from "three/webgpu";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Line2 } from "three/addons/lines/webgpu/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  createEquipmentModel,
  createSystemConnections,
  disposeEquipmentModel,
} from "../equipment-3d/models";
import { packedBedLayout } from "../equipment-3d/packed-bed-layout";
import { rackMembers } from "../equipment-3d/system-geometry";
import { OperationClock, pipeCurve } from "../equipment-3d/operation";
import {
  createProcessContents,
  createSystemFlow,
} from "../equipment-3d/process-contents";
import { makeLandingSystem } from "./landing-system";
import { createProcessCamera } from "./landing-camera";
import {
  CAD_WIDTH,
  CAD_HEIGHT,
  CAD_HEADER,
  CAD_SCALE,
  CAD_CENTER_Z,
  ROUTE_SAMPLES,
  unitUnfold,
} from "./landing-construction";
import { reveal } from "./landing-motion";
import drawing from "./landing-drawing.json";
import {
  addCatalystCores,
  landingComposition,
  prepareLandingLiquid,
} from "./landing-appearance";

/** Preserve the full equipment assemblies, with cheaper subpixel grain shapes
 * only in this distant landing view. The editor keeps its detailed geometry. */
function prepareModel(model: Group) {
  const replaced = new Set<BufferGeometry>();
  const textures = new Set<Texture>();
  const pellet = new OctahedronGeometry(1).scale(
    packedBedLayout.pelletRadius,
    0.018,
    packedBedLayout.pelletRadius,
  );
  const ceramic = new OctahedronGeometry(1);
  let packing = false;
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if (object instanceof InstancedMesh) {
      if (object.name === "ceramic-catalyst-pellets") {
        replaced.add(object.geometry);
        object.geometry = pellet;
        packing = true;
      } else if (object.name === "inert-ceramic-grading") {
        replaced.add(object.geometry);
        object.geometry = ceramic;
      }
    }
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      // Keep the program's clear shell materials, including depthWrite=false.
      if (material instanceof MeshStandardMaterial && !material.transparent) {
        material.roughness = Math.max(0.42, material.roughness);
        material.envMapIntensity = 0.75;
        if (material.bumpMap) textures.add(material.bumpMap);
        if (material.roughnessMap) textures.add(material.roughnessMap);
        material.bumpMap = material.roughnessMap = null;
      }
    }
  });
  replaced.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
  if (!packing) {
    pellet.dispose();
    ceramic.dispose();
  }
}

/** Built once on entry to Build. Only transforms and route buffers change while
 * scrolling; no routing, model construction, or React updates happen per frame. */
export async function createLandingScene(
  renderer: WebGPURenderer,
  signal: AbortSignal,
) {
  const system = makeLandingSystem();
  const colors = landingComposition(system);
  const scene = new Scene();
  const content = new Group();
  scene.add(content);
  const machinery = new Group();
  content.add(machinery);
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04, 0.1, 100, { size: 128 });
  room.dispose();
  pmrem.dispose();
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.6;
  scene.add(new AmbientLight("#ffffff", 1.2));
  for (const [position, color, intensity] of [
    [[5, 10, 6], "#fff5e9", 2.4],
    [[-6, 4, -4], "#dcebf0", 1.5],
    [[12, 8, -6], "#ffd09a", 0.65],
  ] as const) {
    const light = new DirectionalLight(color, intensity);
    light.position.fromArray(position);
    scene.add(light);
  }
  const grid = new GridHelper(28, 56, "#d2dcd3", "#e1e7e0");
  const dispose = () => {
    disposeEquipmentModel(content);
    grid.dispose();
    environment.dispose();
    scene.clear();
  };
  try {
    const equipment: Group[] = [];
    const liquids: ReturnType<typeof createProcessContents>[] = [];
    const clock = new OperationClock();
    for (const item of system.equipment) {
      // Let input and the worksheet paint between expensive model assemblies.
      await new Promise<void>((resolve) => {
        if (typeof requestIdleCallback === "function")
          requestIdleCallback(() => resolve(), { timeout: 250 });
        else setTimeout(resolve, 0);
      });
      signal.throwIfAborted();
      const group = new Group();
      group.position.fromArray(item.position);
      group.rotation.y = ((item.turn ?? 0) * Math.PI) / 2;
      machinery.add(group);
      const model = createEquipmentModel(item.kind, false, true, {
        trayCount: 8,
      });
      group.add(model);
      prepareModel(model);
      if (item.kind === "PBR") addCatalystCores(model);
      const contents = createProcessContents(
        item.kind,
        true,
        clock,
        colors.equipment[item.id].color,
        { trayCount: 8 },
        colors.equipment[item.id],
      );
      // At this viewing distance both faces can share a pass; keep the actual
      // liquid shaders and volumes without drawing each transparent mesh twice.
      prepareLandingLiquid(contents.group);
      group.add(contents.group);
      liquids.push(contents);
      equipment.push(group);
    }
    const pipes = createSystemConnections(system, true, false);
    const pipeContents = createSystemFlow(system, clock, colors.streams);
    prepareLandingLiquid(pipeContents);
    pipes.add(pipeContents);
    machinery.add(pipes);
    // One draw call for the entire rack instead of one per steel member.
    const members = rackMembers(system.site!.rack).map(({ center, size }) => {
      const longest = size.indexOf(Math.max(...size));
      return new BoxGeometry(
        ...(size.map((n, axis) => (axis === longest ? n : n * 0.4)) as [
          number,
          number,
          number,
        ]),
      ).translate(...center);
    });
    const rack = new Mesh(
      mergeGeometries(members),
      new MeshStandardMaterial({
        color: "#75969d",
        metalness: 0.35,
        roughness: 0.6,
      }),
    );
    members.forEach((geometry) => geometry.dispose());
    machinery.add(rack);
    const ground = new Group();
    content.add(ground);
    const floor = new Mesh(
      new PlaneGeometry(28, 16),
      new MeshBasicMaterial({ color: "#f0f3ef", toneMapped: false }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0.3, -0.16, -1.3);
    ground.add(floor);
    grid.scale.z = 16 / 28;
    grid.position.set(0.3, -0.12, -1.3);
    ground.add(grid);
    const routes = system.streams.map((stream) => {
      const source = drawing.streams.find((item) => item.id === stream.id)!;
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute("d", source.path);
      const length = path.getTotalLength();
      const flat = Array.from({ length: ROUTE_SAMPLES + 1 }, (_, index) => {
        const point = path.getPointAtLength((length * index) / ROUTE_SAMPLES);
        return new Vector3(
          (point.x - CAD_WIDTH / 2) / CAD_SCALE,
          0.18,
          (point.y + CAD_HEADER - CAD_HEIGHT / 2) / CAD_SCALE + CAD_CENTER_Z,
        );
      });
      const physical = pipeCurve(stream.points).getSpacedPoints(ROUTE_SAMPLES);
      const line = new Line2(
        new LineGeometry().setPositions(
          flat.flatMap((point) => point.toArray()),
        ),
        new Line2NodeMaterial({
          color: stream.color,
          linewidth: 1.8,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      line.frustumCulled = false;
      content.add(line);
      return { line, flat, physical };
    });
    content.traverse((object) => {
      object.updateMatrix();
      object.matrixAutoUpdate = false;
    });
    const cameraRig = createProcessCamera(system);
    const update = (progress: number, width: number, height: number) => {
      // Flow follows the tour and rests with it; an idle page spends no GPU time.
      clock.uniform.value = progress * 8;
      for (const liquid of liquids) liquid.update(true);
      const lift = reveal(progress, 0.55, 0.87);
      cameraRig.update(width, height, progress);
      machinery.visible = lift > 0.001;
      machinery.scale.y = Math.max(0.001, lift);
      machinery.updateMatrix();
      ground.visible = lift > 0.001;
      equipment.forEach((group, unit) => {
        const height = unitUnfold(progress, unit).height;
        group.visible = height > 0.001;
        group.scale.y = Math.max(0.001, height) / Math.max(0.001, lift);
        group.updateMatrix();
      });
      pipes.visible = progress >= 0.8;
      rack.visible = progress >= 0.68;
      for (const { line, flat, physical } of routes) {
        line.visible = progress > 0.55 && progress < 0.83;
        if (!line.visible) continue;
        const blend = reveal(progress, 0.57, 0.8);
        const buffer = line.geometry.attributes.instanceStart;
        // LineGeometry shares the start/end attributes in one interleaved buffer.
        for (let i = 0; i < ROUTE_SAMPLES; i++) {
          for (let end = 0; end < 2; end++) {
            const a = flat[i + end],
              b = physical[i + end];
            const offset = i * 6 + end * 3;
            buffer.array[offset] = a.x + (b.x - a.x) * blend;
            buffer.array[offset + 1] = a.y + (b.y * lift - a.y) * blend;
            buffer.array[offset + 2] = a.z + (b.z - a.z) * blend;
          }
        }
        buffer.needsUpdate = true;
        line.material.opacity =
          reveal(progress, 0.56, 0.62) * (1 - reveal(progress, 0.8, 0.83));
      }
    };
    return { scene, camera: cameraRig.camera, update, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

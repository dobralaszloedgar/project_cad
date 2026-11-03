// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import {
  AmbientLight,
  DirectionalLight,
  Group,
  Mesh,
  PlaneGeometry,
  ShadowMaterial,
  PCFShadowMap,
  Scene,
  Vector3,
} from "three";
import { Line2NodeMaterial, type WebGPURenderer } from "three/webgpu";
import { Line2 } from "three/addons/lines/webgpu/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import {
  createEquipmentModel,
  createSystemConnections,
  disposeEquipmentModel,
} from "../equipment-3d/models";
import { createPlantInfrastructure } from "../equipment-3d/plant-infrastructure";
import { createFloorGridMaterial } from "../graphics/FloorGrid";
import {
  createStudioEnvironment,
  STUDIO_AMBIENT,
  STUDIO_LIGHTS,
} from "../graphics/studio-lighting";
import { landingExample } from "./landing-example";
import type { CadRoutes } from "./landing-bridge";
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
import { landingComposition } from "./landing-appearance";

/** Built once on entry to Build. Only transforms and route buffers change while
 * scrolling; no routing, model construction, or React updates happen per frame. */
export async function createLandingScene(
  renderer: WebGPURenderer,
  signal: AbortSignal,
  capturedRoutes?: CadRoutes,
) {
  const system = makeLandingSystem();
  const colors = landingComposition(system);
  const scene = new Scene();
  const content = new Group();
  scene.add(content);
  const machinery = new Group();
  content.add(machinery);
  const environment = createStudioEnvironment(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.8;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  scene.add(new AmbientLight("#ffffff", STUDIO_AMBIENT));
  for (const [index, spec] of STUDIO_LIGHTS.entries()) {
    const light = new DirectionalLight(spec.color, spec.intensity);
    light.position.fromArray(spec.position);
    if (index === 0) {
      light.castShadow = true;
      light.shadow.mapSize.set(2048, 2048);
      light.shadow.bias = -0.0004;
      light.shadow.normalBias = 0.025;
      Object.assign(light.shadow.camera, {
        left: -24,
        right: 24,
        top: 24,
        bottom: -24,
        far: 75,
      });
    }
    scene.add(light);
  }
  const dispose = () => {
    disposeEquipmentModel(content);
    environment.dispose();
    scene.clear();
  };
  try {
    const equipment: Group[] = [];
    const liquids: ReturnType<typeof createProcessContents>[] = [];
    const clock = new OperationClock();
    const rotors: Group[] = [];
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
      const source = landingExample.project.units.find(
        (unit) => unit.id === item.tag,
      )!;
      const options = {
        trayCount: source.params.trayCount,
        branchCount: source.params.branchCount,
        condenserType: source.params.distillation?.condenserType,
        column: source.params.distillation?.hydraulics
          ? {
              diameter: source.params.distillation.hydraulics.diameter,
              traySpacing: source.params.distillation.hydraulics.traySpacing,
              trayType: "sieve" as const,
              feedTray:
                source.params.distillation.method === "mesh"
                  ? source.params.distillation.feedTray
                  : undefined,
            }
          : undefined,
      };
      const model = createEquipmentModel(item.kind, false, true, options);
      group.add(model);
      model.traverse((part) => {
        if (
          part instanceof Group &&
          typeof part.userData.angularSpeed === "number"
        )
          rotors.push(part);
      });
      const contents = createProcessContents(
        item.kind,
        true,
        clock,
        colors.equipment[item.id].color,
        options,
        colors.equipment[item.id],
      );
      group.add(contents.group);
      liquids.push(contents);
      equipment.push(group);
    }
    const pipes = createSystemConnections(system, true, false);
    const pipeContents = createSystemFlow(system, clock, colors.streams);
    pipes.add(pipeContents);
    machinery.add(pipes);
    const rack = createPlantInfrastructure(system);
    machinery.add(rack);
    const ground = new Group();
    content.add(ground);
    const floor = new Mesh(
      new PlaneGeometry(160, 160),
      new ShadowMaterial({ transparent: true, opacity: 0.12 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    ground.add(floor);
    const grid = new Mesh(
      new PlaneGeometry(160, 160),
      createFloorGridMaterial(),
    );
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = -0.03;
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
      const drawn = capturedRoutes?.get(stream.id);
      if (drawn?.length === flat.length)
        drawn.forEach((point, index) =>
          flat[index].set(point.x, point.y, point.z),
        );
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
      for (const rotor of rotors) {
        const angle = clock.uniform.value * rotor.userData.angularSpeed;
        rotor.rotation.set(
          rotor.userData.angularAxis === "x" ? angle : 0,
          rotor.userData.angularAxis === "x" ? 0 : angle,
          0,
        );
        rotor.updateMatrix();
      }
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

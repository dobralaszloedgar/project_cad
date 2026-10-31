import { describe, expect, it } from "vitest";
import { Box3, InstancedMesh, Matrix4, Raycaster, Vector3 } from "three";
import { createProcessContents } from "../src/components/equipment-3d/process-contents";
import { OperationClock } from "../src/components/equipment-3d/operation";
import {
  createEquipmentModel,
  disposeEquipmentModel,
} from "../src/components/equipment-3d/models";
import { createCatalystPacking } from "../src/components/equipment-3d/packed-bed-packing";
import {
  bedRivulets,
  bedDrainage,
  distributorBores,
  packedBedLayout,
} from "../src/components/equipment-3d/packed-bed-layout";

describe("packed-bed visual clearances", () => {
  it("merges local drainage into three streams and lets pendant drops grow before accelerating downward", () => {
    for (const index of [0, 1]) {
      const drainage = bedDrainage(index);
      expect(drainage.streams).toHaveLength(3);
      for (const branch of drainage.branches) {
        expect(
          drainage.streams.some((stream) =>
            stream[0].every((v, axis) => v === branch.at(-1)![axis]),
          ),
        ).toBe(true);
      }
      for (const path of [
        ...drainage.branches,
        ...drainage.streams,
        ...drainage.drips,
      ]) {
        for (let step = 1; step < path.length; step++) {
          expect(path[step][1]).toBeLessThan(path[step - 1][1]);
          expect(Math.hypot(path[step][0], path[step][2]) + 0.025).toBeLessThan(
            packedBedLayout.bedRadius,
          );
        }
      }
    }
    const clock = new OperationClock();
    const fluid = createProcessContents("PBR", true, clock);
    const drops = fluid.group.getObjectByName(
      "bed-1-pendant-drops",
    ) as InstancedMesh;
    const sample = (time: number) => {
      clock.uniform.value = time;
      fluid.update(true);
      const matrix = new Matrix4();
      drops.getMatrixAt(0, matrix);
      return {
        position: new Vector3().setFromMatrixPosition(matrix),
        radius: new Vector3().setFromMatrixScale(matrix).x,
      };
    };
    // Find a growing period followed by a fall over a full independent cycle.
    const frames = Array.from({ length: 100 }, (_, i) => sample(i * 0.025));
    expect(
      frames.some(
        (frame, i) =>
          i > 0 &&
          frame.radius > frames[i - 1].radius &&
          Math.abs(frame.position.y - frames[i - 1].position.y) < 0.003,
      ),
    ).toBe(true);
    expect(
      frames.some(
        (frame, i) =>
          i > 1 &&
          frames[i - 1].position.y - frame.position.y > 0.01 &&
          frames[i - 1].position.y - frame.position.y >
            frames[i - 2].position.y - frames[i - 1].position.y,
      ),
    ).toBe(true);
    disposeEquipmentModel(fluid.group);
  });

  it("keeps the capped instrument ports compact, opaque and joined to the shell", () => {
    const model = createEquipmentModel("PBR", false, true);
    const ports = model.children.filter(
      (part) => part.name === "capped-instrument-port",
    );
    expect(ports).toHaveLength(2);
    model.updateMatrixWorld(true);
    const ray = new Raycaster();
    for (const port of ports) {
      const bounds = new Box3().setFromObject(port);
      expect(bounds.max.x).toBeGreaterThan(-packedBedLayout.shellRadius);
      expect(bounds.min.x).toBeGreaterThan(-0.85);
      expect(bounds.max.y - bounds.min.y).toBeLessThan(0.14);
      // The cap must close the centerline bore instead of exposing a dark hole.
      ray.set(new Vector3(-1, port.position.y, 0), new Vector3(1, 0, 0));
      const hits = ray.intersectObject(port, true);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].distance).toBeLessThan(0.2);
    }
    disposeEquipmentModel(model);
  });

  it("moves droplets down both catalyst beds, preserves pause, and stays inside the packing envelope", () => {
    const clock = new OperationClock();
    const fluid = createProcessContents("PBR", true, clock);
    fluid.update(true);
    const drops = fluid.group.children.filter((part) =>
      part.name.endsWith("descending-droplets"),
    ) as InstancedMesh[];
    expect(drops).toHaveLength(2);
    const before = drops.map((mesh) => Array.from(mesh.instanceMatrix.array));
    clock.advance(0.05, true, 2);
    fluid.update(true);
    for (const [bedIndex, mesh] of drops.entries()) {
      const bed = packedBedLayout.beds[bedIndex];
      let descending = 0;
      for (let i = 0; i < mesh.count; i++) {
        const matrix = new Matrix4();
        mesh.getMatrixAt(i, matrix);
        const point = new Vector3().setFromMatrixPosition(matrix);
        if (point.y < before[bedIndex][i * 16 + 13]) descending++;
        expect(Math.hypot(point.x, point.z) + 0.007).toBeLessThan(
          packedBedLayout.bedRadius,
        );
        expect(point.y).toBeGreaterThanOrEqual(bed.support);
        expect(point.y).toBeLessThanOrEqual(bed.top + 0.025);
      }
      expect(descending / mesh.count).toBeGreaterThan(0.9);
    }
    const paused = drops.map((mesh) => Array.from(mesh.instanceMatrix.array));
    clock.advance(5, false, 4);
    fluid.update(true);
    expect(drops.map((mesh) => Array.from(mesh.instanceMatrix.array))).toEqual(
      paused,
    );
    fluid.update(false);
    expect(drops.every((mesh) => !mesh.visible)).toBe(true);
    disposeEquipmentModel(fluid.group);
  });

  it("keeps the fine stationary packing inside its supports and vessel with a bounded render cost", () => {
    const packing = createCatalystPacking();
    packing.updateMatrixWorld(true);
    const matrix = new Matrix4();
    const point = new Vector3();
    let triangles = 0;
    let drawCalls = 0;
    let outside = 0;
    for (const [index, assembly] of packing.children.entries()) {
      const bed = packedBedLayout.beds[index];
      for (const mesh of assembly.children) {
        if (!(mesh instanceof InstancedMesh)) continue;
        drawCalls++;
        triangles += (mesh.count * mesh.geometry.index!.count) / 3;
        const vertices = mesh.geometry.getAttribute("position");
        for (let instance = 0; instance < mesh.count; instance++) {
          mesh.getMatrixAt(instance, matrix);
          matrix.premultiply(mesh.matrixWorld);
          for (let v = 0; v < vertices.count; v++) {
            point.fromBufferAttribute(vertices, v).applyMatrix4(matrix);
            if (
              Math.hypot(point.x, point.z) >= 0.63 ||
              point.y < bed.support + 0.01 ||
              point.y > bed.top + 0.045
            )
              outside++;
          }
        }
      }
    }
    expect(outside).toBe(0);
    expect(drawCalls).toBeLessThanOrEqual(4);
    expect(triangles).toBeLessThan(800000);
    disposeEquipmentModel(packing);
  });

  it("leaves the feed nozzle and every distributor bore physically open", () => {
    const model = createEquipmentModel("PBR", false, true);
    model.updateMatrixWorld(true);
    const ray = new Raycaster();
    const down = new Vector3(0, -1, 0);
    for (const bed of packedBedLayout.beds) {
      ray.far = 0.07;
      for (const bore of distributorBores) {
        ray.set(new Vector3(bore.x, bed.distributor + 0.011, bore.z), down);
        expect(ray.intersectObject(model, true)).toHaveLength(0);
      }
    }
    ray.far = 0.39;
    ray.set(new Vector3(0, 3.7, 0), down);
    expect(ray.intersectObject(model, true)).toHaveLength(0);
    disposeEquipmentModel(model);
  });

  it("distributes descending rivulets over both beds without leaking beyond the vessel", () => {
    for (const [index, bed] of packedBedLayout.beds.entries()) {
      const paths = bedRivulets(index);
      for (const points of paths) {
        expect(points[0][1]).toBeCloseTo(bed.top + 0.025);
        expect(points.at(-1)![1]).toBeCloseTo(bed.support);
        for (let i = 0; i < points.length; i++) {
          const [x, y, z] = points[i];
          expect(Math.hypot(x, z) + 0.005).toBeLessThan(
            packedBedLayout.bedRadius,
          );
          if (i) expect(y).toBeLessThan(points[i - 1][1]);
        }
      }
      expect(paths.some(([p]) => p[0] < -0.5)).toBe(true);
      expect(paths.some(([p]) => p[0] > 0.5)).toBe(true);
      expect(paths.some(([p]) => p[2] < -0.5)).toBe(true);
      expect(paths.some(([p]) => p[2] > 0.5)).toBe(true);
    }
  });
});

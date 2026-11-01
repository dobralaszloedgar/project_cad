import { describe, expect, it, vi } from "vitest";
import { Box3, Group, InstancedMesh, Mesh, MeshStandardMaterial } from "three";
import { acquireEquipmentModel } from "../src/components/equipment-3d/model-resources";
import {
  createEquipmentModel,
  disposeEquipmentModel,
} from "../src/components/equipment-3d/models";
import { createProcessContents } from "../src/components/equipment-3d/process-contents";
import { OperationClock } from "../src/components/equipment-3d/operation";

function meshes(group: Group) {
  const result: Mesh[] = [];
  group.traverse((part) => {
    if (part instanceof Mesh) result.push(part);
  });
  return result;
}

describe("shared equipment geometry", () => {
  it("preserves dimensions while keeping fades and machinery independent", () => {
    const first = acquireEquipmentModel("Mixer", true);
    const second = acquireEquipmentModel("Mixer", true);
    const reference = createEquipmentModel("Mixer", true);
    try {
      expect(new Box3().setFromObject(first.model)).toEqual(
        new Box3().setFromObject(reference),
      );
      const firstParts = meshes(first.model);
      const secondParts = meshes(second.model);
      for (let i = 0; i < firstParts.length; i++) {
        expect(firstParts[i].geometry).toBe(secondParts[i].geometry);
        expect(firstParts[i].material).not.toBe(secondParts[i].material);
        expect(firstParts[i].castShadow).toBe(secondParts[i].castShadow);
      }
      const material = firstParts[0].material as MeshStandardMaterial;
      material.opacity = 0.1;
      expect((secondParts[0].material as MeshStandardMaterial).opacity).toBe(1);
      let rotor!: Group;
      first.model.traverse((part) => {
        if (part instanceof Group && part.userData.angularSpeed) rotor = part;
      });
      rotor.rotation.x = 1;
      expect(second.model.getObjectByName(rotor.name)!.rotation.x).toBeCloseTo(
        0,
      );
    } finally {
      first.release();
      second.release();
      disposeEquipmentModel(reference);
    }
  });

  it("retains shared buffers and textures until the last copy unmounts, then frees them once", () => {
    const first = acquireEquipmentModel("Distillation", false, true);
    const second = acquireEquipmentModel("Distillation", false, true);
    const steel = meshes(first.model).find(
      (part) =>
        part.material instanceof MeshStandardMaterial &&
        part.material.roughnessMap,
    )!;
    const geometryDisposed = vi.fn();
    const textureDisposed = vi.fn();
    const materialDisposed = vi.fn();
    steel.geometry.addEventListener("dispose", geometryDisposed);
    const material = steel.material as MeshStandardMaterial;
    material.roughnessMap!.addEventListener("dispose", textureDisposed);
    material.addEventListener("dispose", materialDisposed);
    first.release();
    expect(materialDisposed).toHaveBeenCalledTimes(1);
    expect(geometryDisposed).not.toHaveBeenCalled();
    expect(textureDisposed).not.toHaveBeenCalled();
    const third = acquireEquipmentModel("Distillation", false, true);
    expect((third.model.getObjectByName(steel.name) as Mesh).geometry).toBe(
      steel.geometry,
    );
    first.release();
    second.release();
    expect(geometryDisposed).not.toHaveBeenCalled();
    third.release();
    expect(geometryDisposed).toHaveBeenCalledTimes(1);
    expect(textureDisposed).toHaveBeenCalledTimes(1);
    const remounted = acquireEquipmentModel("Distillation", false, true);
    expect(
      (remounted.model.getObjectByName(steel.name) as Mesh).geometry,
    ).not.toBe(steel.geometry);
    remounted.release();
  });

  it("separates geometry variants, including column internals and dimensions", () => {
    const options = {
      trayCount: 8,
      column: {
        diameter: 1.2,
        traySpacing: 0.46,
        feedTray: 4,
        trayType: "sieve" as const,
      },
    };
    const copies = [
      acquireEquipmentModel("Distillation", false, true, options),
      acquireEquipmentModel("Distillation", false, true, {
        ...options,
        column: { ...options.column },
      }),
      acquireEquipmentModel("Distillation", false, true, {
        ...options,
        trayCount: 12,
      }),
      acquireEquipmentModel("Distillation", false, true, {
        ...options,
        column: { ...options.column, diameter: 1.8 },
      }),
      acquireEquipmentModel("Distillation", false, true, {
        ...options,
        column: { ...options.column, traySpacing: 0.6 },
      }),
      acquireEquipmentModel("Distillation", false, true, {
        ...options,
        column: { ...options.column, feedTray: 2 },
      }),
      acquireEquipmentModel("Distillation", false, true, { trayCount: 8 }),
      acquireEquipmentModel("Distillation", true, false, options),
      acquireEquipmentModel("Distillation", false, false, options),
    ];
    try {
      const geometry = meshes(copies[0].model)[0].geometry;
      expect(meshes(copies[1].model)[0].geometry).toBe(geometry);
      for (const variant of copies.slice(2))
        expect(meshes(variant.model)[0].geometry).not.toBe(geometry);
      expect(new Box3().setFromObject(copies[2].model).max.y).toBeGreaterThan(
        new Box3().setFromObject(copies[0].model).max.y,
      );
    } finally {
      copies.forEach((copy) => copy.release());
    }
  });

  it("releases each packed bed's instance buffers without disposing another bed's geometry", () => {
    const first = acquireEquipmentModel("PBR", false, true);
    const second = acquireEquipmentModel("PBR", false, true);
    const a = first.model.getObjectByName(
      "ceramic-catalyst-pellets",
    ) as InstancedMesh;
    const b = second.model.getObjectByName(
      "ceramic-catalyst-pellets",
    ) as InstancedMesh;
    expect(a.geometry).toBe(b.geometry);
    expect(a.instanceMatrix.array).not.toBe(b.instanceMatrix.array);
    expect(a.instanceMatrix.array).toEqual(b.instanceMatrix.array);
    expect(a.instanceColor!.array).not.toBe(b.instanceColor!.array);
    const instanceDisposed = vi.fn();
    const geometryDisposed = vi.fn();
    a.addEventListener("dispose", instanceDisposed);
    a.geometry.addEventListener("dispose", geometryDisposed);
    first.release();
    expect(instanceDisposed).toHaveBeenCalledTimes(1);
    expect(geometryDisposed).not.toHaveBeenCalled();
    second.release();
    expect(geometryDisposed).toHaveBeenCalledTimes(1);
  });
});

describe("particle buffer updates", () => {
  it.each(["PBR", "Distillation"] as const)(
    "%s only uploads changed motion and resumes correctly after hiding",
    (kind) => {
      const clock = new OperationClock();
      const fluid = createProcessContents(kind, true, clock);
      const particles = meshes(fluid.group).filter(
        (part): part is InstancedMesh => part instanceof InstancedMesh,
      );
      try {
        expect(particles.length).toBeGreaterThan(0);
        fluid.update(true);
        const versions = () =>
          particles.map((part) => part.instanceMatrix.version);
        const initial = versions();
        for (let frame = 0; frame < 60; frame++) fluid.update(true);
        expect(versions()).toEqual(initial);
        fluid.update(false);
        expect(particles.every((part) => !part.visible)).toBe(true);
        fluid.update(true);
        expect(particles.every((part) => part.visible)).toBe(true);
        expect(versions()).toEqual(initial);
        fluid.update(false);
        clock.advance(0.05, true, 1);
        fluid.update(false);
        expect(versions()).toEqual(initial);
        fluid.update(true);
        expect(versions()).toEqual(initial.map((version) => version + 1));
        expect(
          particles.every(
            (part) =>
              part.visible &&
              part.frustumCulled &&
              part.boundingSphere !== null,
          ),
        ).toBe(true);
      } finally {
        disposeEquipmentModel(fluid.group);
      }
    },
  );
});

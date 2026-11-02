// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { afterEach, describe, expect, it, vi } from "vitest";
import { Group, Mesh, PerspectiveCamera, Scene } from "three";
import { compileHiddenMaterials } from "../src/components/graphics/compile-scene";
import { withGraphicsDeadline } from "../src/components/graphics/deadline";

afterEach(() => vi.useRealTimers());

describe("3D preparation", () => {
  it("prepares hidden and off-camera objects without exposing them during an async compile", async () => {
    const scene = new Scene();
    const group = new Group();
    const mesh = new Mesh();
    group.visible = false;
    mesh.visible = false;
    group.add(mesh);
    scene.add(group);
    let complete!: () => void;
    const work = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const renderer = {
      initialized: true,
      compileAsync: vi.fn(() => {
        expect(group.visible).toBe(true);
        expect(mesh.visible).toBe(true);
        expect(mesh.frustumCulled).toBe(false);
        return work;
      }),
    };
    const preparing = compileHiddenMaterials(
      renderer,
      scene,
      new PerspectiveCamera(),
    );
    expect(group.visible).toBe(false);
    expect(mesh.visible).toBe(false);
    expect(mesh.frustumCulled).toBe(true);
    complete();
    await preparing;
    expect(renderer.compileAsync).toHaveBeenCalledTimes(1);
  });
  it("restores visibility even if preparation throws synchronously", () => {
    const scene = new Scene();
    scene.visible = false;
    expect(() =>
      compileHiddenMaterials(
        {
          initialized: true,
          compileAsync: () => {
            throw new Error("Device lost");
          },
        },
        scene,
        new PerspectiveCamera(),
      ),
    ).toThrow("Device lost");
    expect(scene.visible).toBe(false);
    expect(scene.frustumCulled).toBe(true);
  });
});

describe("graphics deadlines", () => {
  it("preserves a rejection even when the driver provides no reason", async () => {
    await expect(
      withGraphicsDeadline(Promise.reject(), 1000, "Timeout"),
    ).rejects.toBeUndefined();
  });
  it("times out an unresolved driver promise and handles its eventual rejection", async () => {
    vi.useFakeTimers();
    let fail!: (error: Error) => void;
    const pending = new Promise<void>((_, reject) => {
      fail = reject;
    });
    const result = withGraphicsDeadline(
      pending,
      1000,
      "Graphics timed out",
    ).catch((error) => error);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toEqual(new Error("Graphics timed out"));
    fail(new Error("Driver stopped"));
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("clears its timer on success and aborts immediately when the scene unmounts", async () => {
    vi.useFakeTimers();
    expect(
      await withGraphicsDeadline(Promise.resolve(42), 1000, "Timeout"),
    ).toBe(42);
    expect(vi.getTimerCount()).toBe(0);
    const controller = new AbortController();
    const result = withGraphicsDeadline(
      new Promise(() => {}),
      1000,
      "Timeout",
      controller.signal,
    ).catch((error) => error);
    controller.abort();
    expect(await result).toHaveProperty("name", "AbortError");
    expect(vi.getTimerCount()).toBe(0);
  });
});

import { afterAll, describe, expect, it, vi } from "vitest";
import CameraControls from "camera-controls";
import * as THREE from "three";
import {
  keyboardPan,
  wheelNavigation,
  ZOOM_STEP,
} from "../src/components/canvas-navigation";
import {
  orbitAround,
  panCamera,
  zoomCamera,
  cameraDistanceLimits,
} from "../src/components/equipment-3d/camera-navigation";

CameraControls.install({ THREE });
// CameraControls allocates a rectangle even when used without a DOM element.
vi.stubGlobal(
  "DOMRect",
  class {
    constructor(
      public x = 0,
      public y = 0,
      public width = 0,
      public height = 0,
    ) {}
  },
);
afterAll(() => vi.unstubAllGlobals());

function scene() {
  const camera = new THREE.PerspectiveCamera(36, 1.5, 0.05, 600);
  const control = new CameraControls(camera);
  control.minDistance = 0.6;
  control.maxDistance = 500;
  void control.setLookAt(12, 8, 16, 0, 2, 0, false);
  control.update(0);
  camera.updateMatrixWorld();
  return { camera, control };
}

describe("shared viewport navigation", () => {
  it("allows close inspection while bounding zoom-out relative to small and massive plants", () => {
    for (const fitDistance of [3, 20, 400, 2000]) {
      const { camera, control } = scene();
      const limits = cameraDistanceLimits(fitDistance);
      control.minDistance = limits.min;
      control.maxDistance = limits.max;
      void control.setLookAt(0, 2, fitDistance, 0, 2, 0, false);
      control.update(0);
      zoomCamera(control, camera, 1e-20);
      expect(control.distance).toBeCloseTo(fitDistance * 2.5);
      zoomCamera(control, camera, 1e-20);
      expect(control.distance).toBeCloseTo(fitDistance * 2.5);
      zoomCamera(control, camera, 1e20);
      expect(control.distance).toBeCloseTo(0.025);
      control.dispose();
    }
  });

  it("uses identical scroll, pinch, line-wheel and arrow gestures in both views", () => {
    const wheel = {
      deltaX: 90,
      deltaY: 70,
      deltaMode: 0,
      ctrlKey: false,
      metaKey: false,
    };
    expect(wheelNavigation(wheel)).toEqual({ x: 45, y: 35, zoom: 1 });
    expect(wheelNavigation({ ...wheel, deltaMode: 1, deltaY: 2 }).y).toBe(20);
    expect(
      wheelNavigation({ ...wheel, ctrlKey: true, deltaY: -120 }).zoom,
    ).toBeGreaterThan(1);
    expect(
      wheelNavigation({ ...wheel, metaKey: true, deltaY: -120 }).zoom,
    ).toBe(wheelNavigation({ ...wheel, ctrlKey: true, deltaY: -120 }).zoom);
    expect(keyboardPan("arrowup", false)).toEqual([0, -64]);
    expect(keyboardPan("arrowleft", true)).toEqual([-256, 0]);
  });

  it("changes the orbit pivot without jumping, and keeps selection fixed on screen during rotation after pan/zoom", () => {
    const { camera, control } = scene();
    const selection = new THREE.Vector3(-4, 2.3, 1);
    panCamera(control, camera, 90, -50, 800);
    zoomCamera(control, camera, 1.2, { x: -0.3, y: 0.2 });
    const before = selection.clone().project(camera);
    const position = camera.position.clone();
    const quaternion = camera.quaternion.clone();
    orbitAround(control, selection);
    expect(camera.position.distanceTo(position)).toBeLessThan(1e-8);
    expect(camera.quaternion.angleTo(quaternion)).toBeLessThan(1e-7);
    const radius = camera.position.distanceTo(selection);
    void control.rotate(0.6, 0.15, false);
    control.update(0);
    camera.updateMatrixWorld();
    const after = selection.clone().project(camera);
    expect(
      control.getTarget(new THREE.Vector3()).distanceTo(selection),
    ).toBeLessThan(1e-8);
    expect(camera.position.distanceTo(selection)).toBeCloseTo(radius, 8);
    expect(after.x).toBeCloseTo(before.x, 8);
    expect(after.y).toBeCloseTo(before.y, 8);
    control.dispose();
  });

  it("pans by the same number of screen pixels and zooms at the pointer without changing the lens", () => {
    const { camera, control } = scene();
    const center = control.getTarget(new THREE.Vector3());
    panCamera(control, camera, 45, 35, 800);
    camera.updateMatrixWorld();
    const moved = center.clone().project(camera);
    expect((moved.x * 1200) / 2).toBeCloseTo(-45, 8);
    expect((-moved.y * 800) / 2).toBeCloseTo(-35, 8);
    const targetDepth = control
      .getTarget(new THREE.Vector3())
      .project(camera).z;
    const cursor = { x: 0.35, y: -0.25 };
    const anchor = new THREE.Vector3(cursor.x, cursor.y, targetDepth).unproject(
      camera,
    );
    const beforeDistance = control.distance;
    zoomCamera(control, camera, ZOOM_STEP, cursor);
    camera.updateMatrixWorld();
    const after = anchor.clone().project(camera);
    expect(after.x).toBeCloseTo(cursor.x, 8);
    expect(after.y).toBeCloseTo(cursor.y, 8);
    expect(control.distance).toBeCloseTo(beforeDistance / ZOOM_STEP, 8);
    expect(camera.zoom).toBe(1);
    zoomCamera(control, camera, 1e20);
    expect(control.distance).toBeCloseTo(0.6);
    zoomCamera(control, camera, 1e-20);
    expect(control.distance).toBeCloseTo(500);
    control.dispose();
  });
});

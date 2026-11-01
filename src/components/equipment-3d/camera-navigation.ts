import type CameraControls from "camera-controls";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";

export const MIN_CAMERA_DISTANCE = 0.025;

/** Leave room around the fitted plant, without letting it become a distant dot. */
export function cameraDistanceLimits(fitDistance: number) {
  return { min: MIN_CAMERA_DISTANCE, max: Math.max(4, fitDistance * 2.5) };
}

export function updateCameraClipping(
  camera: PerspectiveCamera,
  distance: number,
  far = camera.far,
) {
  const near = MathUtils.clamp(distance / 1000, 0.002, 0.05);
  if (Math.abs(camera.near - near) > 0.00001 || camera.far !== far) {
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }
}

function viewDepth(control: CameraControls, camera: PerspectiveCamera) {
  return Math.max(
    control.minDistance,
    control
      .getTarget(new Vector3())
      .sub(camera.position)
      .dot(camera.getWorldDirection(new Vector3())),
  );
}

/** Pixel-based movement gives a trackpad and the arrow keys the same feel in 2D and 3D. */
export function panCamera(
  control: CameraControls,
  camera: PerspectiveCamera,
  x: number,
  y: number,
  height: number,
) {
  control.update(0);
  const scale =
    (2 *
      viewDepth(control, camera) *
      Math.tan(MathUtils.degToRad(camera.getEffectiveFOV()) / 2)) /
    Math.max(1, height);
  void control.truck(x * scale, y * scale, false);
  control.update(0);
}

/** Dolly toward a point on the view plane, keeping the cursor's world point fixed. */
export function zoomCamera(
  control: CameraControls,
  camera: PerspectiveCamera,
  zoom: number,
  cursor = { x: 0, y: 0 },
) {
  control.update(0);
  const depth = viewDepth(control, camera);
  const distance = MathUtils.clamp(
    depth / zoom,
    control.minDistance,
    control.maxDistance,
  );
  const ratio = distance / depth;
  const direction = camera.getWorldDirection(new Vector3());
  const target = camera.position.clone().addScaledVector(direction, depth);
  const halfHeight =
    depth * Math.tan(MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
  const anchor = target
    .clone()
    .addScaledVector(
      new Vector3().setFromMatrixColumn(camera.matrixWorld, 0),
      cursor.x * halfHeight * camera.aspect,
    )
    .addScaledVector(
      new Vector3().setFromMatrixColumn(camera.matrixWorld, 1),
      cursor.y * halfHeight,
    );
  const position = camera.position
    .clone()
    .sub(anchor)
    .multiplyScalar(ratio)
    .add(anchor);
  target.sub(anchor).multiplyScalar(ratio).add(anchor);
  // Orbit offsets preserve framing on selection. Clear them for a cursor dolly;
  // the selected object's pivot is restored before the next rotation.
  void control.setFocalOffset(0, 0, 0, false);
  void control.setLookAt(...position.toArray(), ...target.toArray(), false);
  control.update(0);
}

export function orbitAround(control: CameraControls, center: Vector3) {
  control.stop();
  control.update(0);
  control.setOrbitPoint(...center.toArray());
  control.update(0);
}

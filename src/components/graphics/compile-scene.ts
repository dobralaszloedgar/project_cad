// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import type { Camera, Object3D, Scene } from "three";
import type { WebGPURenderer } from "three/webgpu";

/** Include future reveals without changing a single displayed frame. */
export function compileHiddenMaterials(
  renderer: Pick<WebGPURenderer, "compileAsync" | "initialized">,
  scene: Scene,
  camera: Camera,
) {
  if (!renderer.initialized) throw new Error("The renderer is not initialized");
  const visibility: [Object3D, boolean, boolean][] = [];
  scene.traverse((object) => {
    visibility.push([object, object.visible, object.frustumCulled]);
    object.visible = true;
    object.frustumCulled = false;
  });
  try {
    // The initialized renderer collects its render list synchronously, then
    // compiles that list asynchronously. Restore visibility before yielding so
    // the camera, drawing and equipment keep their current story pose.
    return renderer.compileAsync(scene, camera);
  } finally {
    for (const [object, visible, culled] of visibility) {
      object.visible = visible;
      object.frustumCulled = culled;
    }
  }
}

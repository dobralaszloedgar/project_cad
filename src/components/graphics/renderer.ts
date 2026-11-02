// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { WebGPURenderer } from "three/webgpu";
import { isSoftwareRenderer } from "./diagnostics";
import { withGraphicsDeadline } from "./deadline";

export type GraphicsPreference = "auto" | "webgl";
export type GraphicsInfo = {
  backend: "webgpu" | "webgl";
  gpu: string;
  software: boolean;
};

const preferenceKey = "project-cad.graphics-backend";

export function readGraphicsPreference(): GraphicsPreference {
  try {
    return localStorage.getItem(preferenceKey) === "webgl" ? "webgl" : "auto";
  } catch {
    return "auto";
  }
}

export function saveGraphicsPreference(value: GraphicsPreference) {
  try {
    localStorage.setItem(preferenceKey, value);
  } catch {
    // Rendering also works when browser storage is disabled.
  }
}

type BackendDetails = {
  isWebGPUBackend?: boolean;
  getContext(): unknown;
  device?: {
    adapterInfo?: {
      description?: string;
      vendor?: string;
      architecture?: string;
      isFallbackAdapter?: boolean;
    };
    queue: { onSubmittedWorkDone(): Promise<void> };
  };
};

// R3F accepts async renderer factories, but its RootState.gl type still names
// WebGLRenderer. Both canvases in this app are created by createSceneRenderer.
export function sceneRenderer(gl: unknown): WebGPURenderer {
  return gl as WebGPURenderer;
}

export function graphicsInfo(renderer: WebGPURenderer): GraphicsInfo {
  const backend = renderer.backend as typeof renderer.backend & BackendDetails;
  if (backend.isWebGPUBackend) {
    const info = backend.device?.adapterInfo;
    const gpu =
      info?.description ||
      [info?.vendor, info?.architecture].filter(Boolean).join(" ") ||
      "GPU name unavailable";
    return {
      backend: "webgpu",
      gpu,
      software: isSoftwareRenderer(gpu, info?.isFallbackAdapter),
    };
  }
  const context = backend.getContext() as WebGL2RenderingContext;
  const debug = context.getExtension("WEBGL_debug_renderer_info");
  const gpu = debug
    ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL))
    : "GPU name unavailable";
  return {
    backend: "webgl",
    gpu,
    software: isSoftwareRenderer(gpu),
  };
}

export async function createSceneRenderer({
  canvas,
  alpha = false,
  preference = readGraphicsPreference(),
}: {
  canvas: HTMLCanvasElement;
  alpha?: boolean;
  preference?: GraphicsPreference;
}) {
  const renderer = new WebGPURenderer({
    canvas,
    alpha,
    antialias: true,
    powerPreference: "high-performance",
    // Avoid even attempting WebGPU on insecure origins or unsupported browsers.
    // Three also falls back if adapter/device initialization is rejected.
    forceWebGL:
      preference === "webgl" || !window.isSecureContext || !navigator.gpu,
  });
  const initialization = renderer.init();
  try {
    await withGraphicsDeadline(
      initialization,
      10_000,
      "Graphics initialization timed out",
    );
  } catch (error) {
    // If a slow driver finishes after the fallback has mounted, release the
    // abandoned context instead of leaking it behind the page.
    void initialization.then(
      () => renderer.dispose(),
      () => {},
    );
    throw error;
  }
  const info = graphicsInfo(renderer);
  canvas.dataset.graphicsBackend = info.backend;
  canvas.dataset.graphicsGpu = info.gpu;
  canvas.dataset.graphicsSoftware = String(info.software);
  renderer.onDeviceLost = () => {
    canvas.dispatchEvent(new Event("graphicsdevicelost"));
  };
  renderer.onError = (error) => {
    console.warn("3D renderer error", error);
    canvas.dispatchEvent(new Event("graphicsdevicelost"));
  };
  return renderer;
}

/** Wait for submitted pixels without blocking the UI, on either backend. */
export async function waitForSceneFrame(
  renderer: WebGPURenderer,
  signal: AbortSignal,
  milliseconds = 5_000,
) {
  if (signal.aborted) return;
  const backend = renderer.backend as typeof renderer.backend & BackendDetails;
  if (backend.isWebGPUBackend && backend.device) {
    await withGraphicsDeadline(
      backend.device.queue.onSubmittedWorkDone(),
      milliseconds,
      "The 3D preview did not finish rendering",
      signal,
    );
    return;
  }
  const gl = backend.getContext() as WebGL2RenderingContext;
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!sync) throw new Error("Could not synchronize the 3D preview");
  gl.flush();
  await new Promise<void>((resolve, reject) => {
    let frame = 0;
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      gl.deleteSync(sync);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish();
    const timeout = setTimeout(
      () => finish(new Error("The 3D preview did not finish rendering")),
      milliseconds,
    );
    const check = () => {
      if (signal.aborted) return finish();
      const result = gl.clientWaitSync(sync, 0, 0);
      if (result === gl.TIMEOUT_EXPIRED) frame = requestAnimationFrame(check);
      else if (result === gl.WAIT_FAILED)
        finish(new Error("The 3D connection was interrupted"));
      else finish();
    };
    signal.addEventListener("abort", abort, { once: true });
    frame = requestAnimationFrame(check);
  });
}

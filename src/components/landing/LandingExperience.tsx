// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import { memo, useEffect, useRef } from "react";
import { ACESFilmicToneMapping } from "three";
import type { MotionValue } from "motion/react";
import type { CadBridge } from "./CadWorkbench";
import { createSceneRenderer, waitForSceneFrame } from "../graphics/renderer";
import { compileHiddenMaterials } from "../graphics/compile-scene";
import { maximumDpr, ResolutionController } from "../graphics/performance";
import { withGraphicsDeadline } from "../graphics/deadline";
import { createLandingScene } from "./landing-scene";
import { worksheetProjection, worksheetTransform } from "./landing-camera";
import { reveal, tourStopAt } from "./landing-motion";

export type ExperienceProps = {
  onReady: () => void;
  onUnavailable: () => void;
  progress: MotionValue<number>;
  cadBridge: CadBridge;
  construction: MotionValue<number>;
  simulation: MotionValue<number>;
};

/** One persistent scene, rendered only for input, resize, or active playback. */
export default memo(function LandingExperience({
  progress,
  cadBridge,
  construction,
  simulation,
  onReady,
  onUnavailable,
}: ExperienceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Each effect owns its canvas, including overlapping async initialization
    // during development's Strict Mode remount. Disposing one cannot lose another.
    const canvas = document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      "A connected process plant viewed from different camera angles as you scroll",
    );
    canvas.dataset.renderMode = "live-3d";
    canvas.dataset.renderLoop = "demand";
    canvas.dataset.ready = "false";
    canvas.style.width = canvas.style.height = "100%";
    hostRef.current!.append(canvas);
    const controller = new AbortController();
    const resolution = new ResolutionController();
    let renderer: Awaited<ReturnType<typeof createSceneRenderer>> | undefined;
    let view: Awaited<ReturnType<typeof createLandingScene>> | undefined;
    let ready = false,
      disposed = false,
      failed = false;
    let width = 1,
      height = 1,
      ratio = 1,
      maximum = 1;
    let raf = 0,
      draws = 0,
      previousFrame = 0,
      lastDrawEnd = 0;
    let idle = true,
      resized = true,
      drawnProgress = NaN;
    let software = false;
    const fail = (error?: unknown) => {
      if (disposed || failed) return;
      if (error) console.warn("Landing scene unavailable", error);
      failed = true;
      controller.abort();
      cancelAnimationFrame(raf);
      onUnavailable();
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      fail();
    };
    const wake = () => {
      if (disposed || failed || !ready || raf || document.hidden) return;
      idle = performance.now() - lastDrawEnd > 120;
      raf = requestAnimationFrame(update);
    };
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height || !renderer) return;
      width = bounds.width;
      height = bounds.height;
      maximum = Math.min(
        software ? 1 : 1.5,
        maximumDpr(width, height, devicePixelRatio),
      );
      ratio = Math.min(ratio, maximum);
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      canvas.dataset.renderDpr = ratio.toFixed(2);
      resolution.reset();
      resized = true;
      wake();
    };
    function update(time: number) {
      raf = 0;
      if (!view || !renderer || disposed || failed || document.hidden) return;
      try {
        const p = progress.get();
        canvas.dataset.storyProgress = p.toFixed(4);
        canvas.dataset.construction = construction.get().toFixed(4);
        canvas.dataset.simulation = simulation.get().toFixed(4);
        canvas.dataset.unfold = reveal(p, 0.55, 0.87).toFixed(4);
        canvas.dataset.tour = reveal(p, 1, 1.65).toFixed(4);
        canvas.dataset.focus = ["overview", "heater", "reactor", "column"][
          tourStopAt(p)
        ];
        canvas.dataset.processPhase =
          p < 0.25
            ? "design"
            : p < 0.55
              ? "blueprint"
              : p < 0.87
                ? "unfolding"
                : "plant";
        // The worksheet animates in the DOM; its blank 3D backdrop can rest.
        const pose = Math.max(0.55, p);
        if (!resized && pose === drawnProgress) return;
        if (idle) resolution.reset();
        else if (previousFrame && p > 0.55) {
          const next = resolution.sample(
            (time - previousFrame) / 1000,
            ratio,
            maximum,
          );
          if (next !== ratio) {
            ratio = next;
            renderer.setPixelRatio(ratio);
            canvas.dataset.renderDpr = ratio.toFixed(2);
          }
        }
        previousFrame = time;
        view.update(pose, width, height);
        if (p < 0.87) {
          const viewport = cadBridge.viewport.current;
          const layer = cadBridge.camera.current;
          const surface = cadBridge.surface.current;
          if (viewport && layer && surface) {
            viewport.style.perspective = "none";
            layer.style.transform = "none";
            surface.style.transformOrigin = "0 0";
            surface.style.left = surface.style.top = "0";
            surface.style.transform = worksheetTransform(
              worksheetProjection(view.camera, width, height),
            );
          }
        }
        renderer.info.reset();
        renderer.render(view.scene, view.camera);
        drawnProgress = pose;
        resized = false;
        lastDrawEnd = performance.now();
        canvas.dataset.cameraPose = view.camera.position
          .toArray()
          .map((value) => value.toFixed(4))
          .join(",");
        canvas.dataset.drawCount = String(++draws);
        canvas.dataset.drawCalls = String(renderer.info.render.drawCalls);
        canvas.dataset.triangles = String(renderer.info.render.triangles);
        canvas.dataset.programs = String(renderer.info.memory.programs);
      } catch (error) {
        fail(error);
      }
    }
    const observer = new ResizeObserver(resize);
    const stops = [progress, construction, simulation].map((value) =>
      value.on("change", wake),
    );
    document.addEventListener("visibilitychange", wake);
    canvas.addEventListener("webglcontextlost", contextLost);
    canvas.addEventListener("graphicsdevicelost", contextLost);
    void (async () => {
      try {
        renderer = await createSceneRenderer({ canvas, alpha: true });
        if (disposed || failed) {
          renderer.dispose();
          return;
        }
        renderer.info.autoReset = false;
        // Match the editor's R3F color pipeline, which applies filmic tone mapping.
        renderer.toneMapping = ACESFilmicToneMapping;
        software = canvas.dataset.graphicsSoftware === "true";
        ratio = software ? 1 : Math.min(1.5, devicePixelRatio || 1);
        resize();
        observer.observe(canvas);
        view = await createLandingScene(renderer, controller.signal);
        if (disposed) {
          view.dispose();
          return;
        }
        // Precompile future reveals and upload geometry before showing the scene.
        view.update(0.7, width, height);
        await withGraphicsDeadline(
          compileHiddenMaterials(renderer, view.scene, view.camera),
          15_000,
          "Scene preparation timed out",
          controller.signal,
        );
        if (disposed || failed) return;
        renderer.render(view.scene, view.camera);
        view.update(0.95, width, height);
        renderer.render(view.scene, view.camera);
        await waitForSceneFrame(renderer, controller.signal);
        if (disposed || failed) return;
        ready = true;
        update(performance.now());
        if (failed) return;
        canvas.dataset.ready = "true";
        onReady();
      } catch (error) {
        fail(error);
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
      cancelAnimationFrame(raf);
      observer.disconnect();
      stops.forEach((stop) => stop());
      document.removeEventListener("visibilitychange", wake);
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("graphicsdevicelost", contextLost);
      view?.dispose();
      renderer?.dispose();
      canvas.remove();
    };
  }, [progress, cadBridge, construction, simulation, onReady, onUnavailable]);
  return <div ref={hostRef} style={{ width: "100%", height: "100%" }} />;
});

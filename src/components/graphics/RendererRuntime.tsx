// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import { useCallback, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { maximumDpr, ResolutionController } from "./performance";
import { graphicsInfo, sceneRenderer, type GraphicsInfo } from "./renderer";

export function RendererRuntime({
  onLost,
  onVisible,
  onInfo,
  onReady,
  onDprChange,
  label,
  dprLimit = Infinity,
}: {
  onLost: () => void;
  onVisible: (visible: boolean) => void;
  onInfo?: (info: GraphicsInfo) => void;
  onReady?: () => void;
  onDprChange: (dpr: number) => void;
  label?: string;
  dprLimit?: number;
}) {
  const { gl, size, setDpr, get } = useThree();
  const controller = useRef(new ResolutionController());
  const maximum = useRef(1);
  const applyDpr = useCallback(
    (dpr: number) => {
      setDpr(dpr);
      // Keep Canvas's declarative configuration in sync with adaptive rendering.
      // Otherwise any parent update restores its original high-DPI setting.
      onDprChange(dpr);
    },
    [setDpr, onDprChange],
  );
  useEffect(() => {
    if (!onReady) return;
    const { scene, invalidate } = get();
    const previous = scene.onAfterRender;
    let frame: number | undefined;
    // Renderer creation precedes geometry and shader setup. Keep the loading
    // indicator until the scene has rendered and the browser can present it.
    scene.onAfterRender = (...args) => {
      previous.apply(scene, args);
      if (frame === undefined) frame = requestAnimationFrame(onReady);
    };
    invalidate();
    return () => {
      scene.onAfterRender = previous;
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [get, onReady]);
  useEffect(() => {
    maximum.current = Math.min(
      dprLimit,
      maximumDpr(size.width, size.height, window.devicePixelRatio),
    );
    if (gl.domElement.dataset.graphicsSoftware === "true") {
      maximum.current = Math.min(1, maximum.current);
    }
    applyDpr(maximum.current);
    controller.current.reset();
  }, [gl, size.width, size.height, applyDpr, dprLimit]);
  useFrame((state, delta) => {
    // Demand rendering includes intentional pauses; these are not slow frames.
    if (state.frameloop !== "always") {
      controller.current.reset();
      const current = get().viewport.dpr;
      if (current > maximum.current) applyDpr(maximum.current);
      return;
    }
    const current = get().viewport.dpr;
    const next = controller.current.sample(delta, current, maximum.current);
    if (next !== current) applyDpr(next);
    const scale = next.toFixed(2);
    if (state.gl.domElement.dataset.renderScale !== scale)
      state.gl.domElement.dataset.renderScale = scale;
  });
  useEffect(() => {
    const canvas = gl.domElement;
    if (label) canvas.setAttribute("aria-label", label);
    onInfo?.(graphicsInfo(sceneRenderer(gl)));
    let intersects = true;
    const reportVisibility = () => {
      controller.current.reset();
      onVisible(intersects && !document.hidden);
    };
    const observer = new IntersectionObserver(([entry]) => {
      intersects = entry.isIntersecting;
      reportVisibility();
    });
    observer.observe(canvas);
    reportVisibility();
    const handleLoss = (event: Event) => {
      event.preventDefault();
      onLost();
    };
    canvas.addEventListener("webglcontextlost", handleLoss);
    canvas.addEventListener("graphicsdevicelost", handleLoss);
    document.addEventListener("visibilitychange", reportVisibility);
    return () => {
      canvas.removeEventListener("webglcontextlost", handleLoss);
      canvas.removeEventListener("graphicsdevicelost", handleLoss);
      document.removeEventListener("visibilitychange", reportVisibility);
      observer.disconnect();
    };
  }, [gl, label, onInfo, onLost, onVisible]);
  return null;
}

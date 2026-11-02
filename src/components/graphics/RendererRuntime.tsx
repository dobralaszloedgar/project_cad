"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { maximumDpr, ResolutionController } from "./performance";
import { graphicsInfo, sceneRenderer, type GraphicsInfo } from "./renderer";

export function RendererRuntime({
  onLost,
  onVisible,
  onInfo,
  onReady,
  label,
}: {
  onLost: () => void;
  onVisible: (visible: boolean) => void;
  onInfo?: (info: GraphicsInfo) => void;
  onReady?: () => void;
  label?: string;
}) {
  const { gl, size, setDpr, get } = useThree();
  const controller = useRef(new ResolutionController());
  const maximum = useRef(1);
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
    maximum.current = maximumDpr(
      size.width,
      size.height,
      window.devicePixelRatio,
    );
    if (gl.domElement.dataset.graphicsSoftware === "true") {
      maximum.current = Math.min(1, maximum.current);
    }
    setDpr(maximum.current);
    controller.current.reset();
  }, [gl, size.width, size.height, setDpr]);
  useFrame((state, delta) => {
    // Demand rendering includes intentional pauses; these are not slow frames.
    if (state.frameloop !== "always") {
      controller.current.reset();
      return;
    }
    const current = get().viewport.dpr;
    const next = controller.current.sample(delta, current, maximum.current);
    if (next !== current) setDpr(next);
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

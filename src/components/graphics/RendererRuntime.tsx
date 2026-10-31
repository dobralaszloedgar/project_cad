"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { maximumDpr, ResolutionController } from "./performance";
import { graphicsInfo, sceneRenderer, type GraphicsInfo } from "./renderer";

export function RendererRuntime({
  onLost,
  onVisible,
  onInfo,
  label,
}: {
  onLost: () => void;
  onVisible: (visible: boolean) => void;
  onInfo?: (info: GraphicsInfo) => void;
  label?: string;
}) {
  const { gl, size, setDpr, get } = useThree();
  const controller = useRef(new ResolutionController());
  const maximum = useRef(1);
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
    state.gl.domElement.setAttribute("data-render-scale", next.toFixed(2));
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

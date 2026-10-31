"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function fullscreenElement() {
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function useCanvasFullscreen(
  canvasRef: RefObject<HTMLElement | null>,
  onError: (message: string) => void,
) {
  const [mode, setMode] = useState<"native" | "viewport" | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    function onFullscreenChange() {
      const active = fullscreenElement();
      setMode((current) =>
        active && active === canvasRef.current
          ? "native"
          : current === "native"
            ? null
            : current,
      );
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        onFullscreenChange,
      );
    };
  }, [canvasRef]);

  useEffect(() => {
    if (mode !== "viewport") return;
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        event.isComposing ||
        document.querySelector("dialog[open]")
      )
        return;
      event.preventDefault();
      setMode(null);
      canvasRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canvasRef, mode]);

  async function toggleFullscreen() {
    const canvas = canvasRef.current as FullscreenElement | null;
    if (!canvas || pending.current) return;
    if (mode === "viewport") {
      setMode(null);
      return;
    }

    const doc = document as FullscreenDocument;
    if (fullscreenElement() === canvas) {
      pending.current = true;
      try {
        const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
        if (!exit) throw new Error("Fullscreen exit is unavailable");
        await exit.call(doc);
      } catch {
        onError("Could not exit full screen. Press Esc to exit.");
      } finally {
        pending.current = false;
      }
      return;
    }

    const request = canvas.requestFullscreen ?? canvas.webkitRequestFullscreen;
    const enabled =
      typeof canvas.requestFullscreen === "function"
        ? doc.fullscreenEnabled
        : doc.webkitFullscreenEnabled;
    if (!request || enabled === false) {
      setMode("viewport");
      return;
    }

    pending.current = true;
    try {
      // Keep this call in the click/key event so it retains user activation.
      await request.call(canvas);
    } catch {
      // Embedded browsers may expose the API but refuse the request.
      if (canvas.isConnected && canvasRef.current === canvas)
        setMode("viewport");
    } finally {
      pending.current = false;
    }
  }

  return {
    isFullscreen: mode !== null,
    isViewportFullscreen: mode === "viewport",
    toggleFullscreen,
  };
}

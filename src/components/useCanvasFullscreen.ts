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
type FullscreenKeyboard = {
  lock: (keys: string[]) => Promise<void>;
  unlock: () => void;
};

const ESCAPE_HOLD_MS = 2000;

function fullscreenKeyboard() {
  const keyboard = (navigator as Navigator & { keyboard?: FullscreenKeyboard })
    .keyboard;
  return typeof keyboard?.lock === "function" &&
    typeof keyboard.unlock === "function"
    ? keyboard
    : null;
}

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
  const lockedKeyboard = useRef<FullscreenKeyboard | null>(null);

  useEffect(() => {
    function onFullscreenChange() {
      const active = fullscreenElement();
      if (active !== canvasRef.current) {
        lockedKeyboard.current?.unlock();
        lockedKeyboard.current = null;
      }
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
      lockedKeyboard.current?.unlock();
      lockedKeyboard.current = null;
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        onFullscreenChange,
      );
    };
  }, [canvasRef]);

  useEffect(() => {
    if (!mode) return;
    let holdTimer: number | undefined;

    function cancelHold() {
      window.clearTimeout(holdTimer);
      holdTimer = undefined;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "Escape" ||
        event.repeat ||
        event.isComposing ||
        holdTimer !== undefined
      )
        return;
      // Let a tap dismiss panels and dialogs while a continuous hold exits.
      holdTimer = window.setTimeout(async () => {
        if (mode === "viewport") {
          setMode(null);
          canvasRef.current?.focus();
          return;
        }
        if (fullscreenElement() !== canvasRef.current) return;
        const doc = document as FullscreenDocument;
        try {
          const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
          if (!exit) throw new Error("Fullscreen exit is unavailable");
          await exit.call(doc);
        } catch {
          if (fullscreenElement() === canvasRef.current)
            onError(
              "Could not exit full screen. Use the Exit full screen button.",
            );
        }
      }, ESCAPE_HOLD_MS);
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.key === "Escape") cancelHold();
    }
    function onVisibilityChange() {
      if (document.hidden) cancelHold();
    }
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", cancelHold);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelHold();
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", cancelHold);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [canvasRef, mode, onError]);

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
        onError("Could not exit full screen. Hold Esc to exit.");
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
    const keyboard = fullscreenKeyboard();
    // Native fullscreen reserves a single Esc unless keyboard lock is active.
    if (!request || enabled === false || !keyboard) {
      setMode("viewport");
      return;
    }

    pending.current = true;
    try {
      // Keep this call in the click/key event so it retains user activation.
      await request.call(canvas);
      if (
        !canvas.isConnected ||
        canvasRef.current !== canvas ||
        fullscreenElement() !== canvas
      )
        return;
      lockedKeyboard.current = keyboard;
      try {
        // The browser keeps its two-second Esc escape hatch while taps reach
        // the app's normal panel/dialog shortcuts.
        await keyboard.lock(["Escape"]);
      } catch {
        // Keep hold-to-exit available if permission is denied. Do not re-enter
        // fullscreen if the user already exited while permission was pending.
        if (
          !canvas.isConnected ||
          canvasRef.current !== canvas ||
          fullscreenElement() !== canvas
        )
          return;
        const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
        if (!exit) throw new Error("Fullscreen exit is unavailable");
        await exit.call(doc);
        if (
          canvas.isConnected &&
          canvasRef.current === canvas &&
          !fullscreenElement()
        )
          setMode("viewport");
      }
    } catch {
      // Embedded browsers may expose the API but refuse the request.
      if (canvas.isConnected && canvasRef.current === canvas) {
        if (fullscreenElement() === canvas)
          onError(
            "Could not enable hold-to-exit. Use the Exit full screen button.",
          );
        else if (!fullscreenElement()) setMode("viewport");
      }
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

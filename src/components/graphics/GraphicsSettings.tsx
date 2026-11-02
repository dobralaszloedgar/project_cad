"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Monitor } from "lucide-react";
import type { GraphicsInfo, GraphicsPreference } from "./renderer";
import styles from "./graphics.module.css";
import { AccelerationNotice } from "./AccelerationHelp";
import { isSelectPickerOpen } from "@/lib/keyboard";

export function GraphicsSettings({
  info,
  preference,
  onChange,
  container,
}: {
  info: GraphicsInfo | null;
  preference: GraphicsPreference;
  onChange: (value: GraphicsPreference) => void;
  container?: HTMLElement | null;
}) {
  const settingsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const settings = settingsRef.current;
      if (settings?.open && !settings.contains(event.target as Node))
        settings.open = false;
    };
    document.addEventListener("pointerdown", closeOutside, true);
    return () =>
      document.removeEventListener("pointerdown", closeOutside, true);
  }, []);
  const settings = (
    <details
      ref={settingsRef}
      className={`${styles.settings}${container ? ` ${styles.inlineSettings}` : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isSelectPickerOpen(event)) {
          event.preventDefault();
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label="Graphics settings" title="3D graphics">
        <Monitor className={styles.icon} size={16} aria-hidden="true" />
        <span className={styles.backend}>
          {info
            ? info.backend === "webgpu"
              ? "WebGPU"
              : "WebGL 2"
            : "Graphics"}
        </span>
        <ChevronDown className={styles.chevron} size={12} aria-hidden="true" />
      </summary>
      <div className={styles.panel}>
        <label>
          Graphics mode
          <select
            aria-label="Graphics mode"
            value={preference}
            onChange={(event) =>
              onChange(event.target.value as GraphicsPreference)
            }
          >
            <option value="auto">Automatic (recommended)</option>
            <option value="webgl">Compatibility</option>
          </select>
        </label>
        <p>Try Compatibility if 3D isn’t displaying correctly.</p>
        <p>
          <strong>Graphics card</strong>
          <span>{info?.gpu ?? "Connecting…"}</span>
        </p>
      </div>
    </details>
  );
  return (
    <>
      {info?.software ? <AccelerationNotice /> : null}
      {container ? createPortal(settings, container) : settings}
    </>
  );
}

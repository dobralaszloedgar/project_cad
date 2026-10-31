"use client";

import type { GraphicsInfo, GraphicsPreference } from "./renderer";
import styles from "./graphics.module.css";
import { AccelerationNotice } from "./AccelerationHelp";

export function GraphicsSettings({
  info,
  preference,
  onChange,
}: {
  info: GraphicsInfo | null;
  preference: GraphicsPreference;
  onChange: (value: GraphicsPreference) => void;
}) {
  return (
    <>
      {info?.software ? <AccelerationNotice /> : null}
      <details className={styles.settings}>
        <summary aria-label="Graphics settings">
          {info
            ? info.backend === "webgpu"
              ? "WebGPU"
              : "WebGL 2"
            : "Graphics"}
        </summary>
        <div className={styles.panel}>
          <label>
            Renderer
            <select
              aria-label="3D renderer"
              value={preference}
              onChange={(event) =>
                onChange(event.target.value as GraphicsPreference)
              }
            >
              <option value="auto">Automatic (prefer WebGPU)</option>
              <option value="webgl">WebGL 2 compatibility</option>
            </select>
          </label>
          <p>
            <strong>Active GPU</strong>
            <span>{info?.gpu ?? "Connecting…"}</span>
          </p>
          <p>
            High-performance graphics requested. Resolution adjusts
            automatically to keep movement smooth.
          </p>
          <p>
            On a laptop, Windows and your browser choose the GPU. To prefer
            NVIDIA, set your browser to High performance in Windows Settings →
            System → Display → Graphics, then restart it.
          </p>
        </div>
      </details>
    </>
  );
}

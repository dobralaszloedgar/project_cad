import { Play, Volume2, VolumeX } from "lucide-react";
import type { CanvasSound } from "./useCanvasSound";
import styles from "./CanvasSoundControls.module.css";

export function CanvasSoundToggle({ sound }: { sound: CanvasSound }) {
  return (
    <button
      type="button"
      className={`icon-button ${styles.quickToggle}`}
      aria-label={sound.enabled ? "Mute canvas sounds" : "Enable canvas sounds"}
      aria-pressed={sound.enabled}
      title={
        sound.error ||
        (sound.enabled
          ? "Soft tactile sounds on · Click to mute"
          : "Enable Soft tactile sounds")
      }
      onClick={() => sound.setEnabled(!sound.enabled)}
    >
      {sound.enabled && sound.volume > 0 ? (
        <Volume2 size={17} />
      ) : (
        <VolumeX size={17} />
      )}
    </button>
  );
}

export default function CanvasSoundSettings({ sound }: { sound: CanvasSound }) {
  return (
    <section
      className={`preference-section ${styles.settings}`}
      aria-labelledby="canvas-sound-heading"
    >
      <div className={styles.heading}>
        <h3 id="canvas-sound-heading">Canvas sounds</h3>
        <button
          type="button"
          role="switch"
          aria-label="Canvas sounds"
          aria-checked={sound.enabled}
          className={styles.switch}
          onClick={() => sound.setEnabled(!sound.enabled)}
        >
          <span />
        </button>
      </div>
      <p>
        <strong>Soft tactile</strong>
        <br />
        Gentle taps when you place equipment, connect streams, or remove items.
      </p>
      <div className={styles.volume}>
        <label htmlFor="canvas-sound-volume">Volume</label>
        <input
          id="canvas-sound-volume"
          type="range"
          min="0"
          max="100"
          step="1"
          value={sound.volume}
          onChange={(event) => sound.setVolume(Number(event.target.value))}
        />
        <output htmlFor="canvas-sound-volume">{sound.volume}%</output>
      </div>
      <div className={styles.preview}>
        <button
          type="button"
          className="btn"
          disabled={!sound.enabled || sound.volume === 0}
          onClick={() => sound.play("connect")}
        >
          <Play size={13} />
          Preview sound
        </button>
        <span>Saved on this browser</span>
      </div>
      {sound.error && (
        <p className={styles.error} role="alert">
          {sound.error}
        </p>
      )}
    </section>
  );
}

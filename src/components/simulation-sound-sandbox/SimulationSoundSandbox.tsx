"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Check,
  CheckCheck,
  FlaskConical,
  LoaderCircle,
  Play,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
  Waves,
} from "lucide-react";
import {
  completionSounds,
  createCompletionSamples,
  soundDetails,
  soundFamilies,
  type CompletionSound,
  type SimulationOutcome,
  type SoundFamily,
} from "@/lib/audio/completion-sounds";
import { SoundPlayer } from "@/lib/audio/sound-player";
import styles from "./SimulationSoundSandbox.module.css";

const waveforms = Object.fromEntries(
  (["complete", "attention"] as const).map((outcome) => [
    outcome,
    Object.fromEntries(
      completionSounds.map(({ id }) => {
        const samples = createCompletionSamples(id, 8000, outcome);
        const bars = Array.from({ length: 48 }, (_, index) => {
          const from = Math.floor((index * samples.length) / 48);
          const to = Math.floor(((index + 1) * samples.length) / 48);
          let peak = 0;
          for (let i = from; i < to; i++)
            peak = Math.max(peak, Math.abs(samples[i]));
          return Math.max(2, peak * 88);
        });
        return [id, bars];
      }),
    ),
  ]),
) as Record<SimulationOutcome, Record<CompletionSound, number[]>>;

export default function SimulationSoundSandbox() {
  const [selected, setSelected] = useState<CompletionSound>("music-box");
  const [outcome, setOutcome] = useState<SimulationOutcome>("complete");
  const [family, setFamily] = useState<SoundFamily | "All">("Music box");
  const [enabled, setEnabled] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [volume, setVolume] = useState(35);
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [lastHeard, setLastHeard] = useState("");
  const [error, setError] = useState("");
  const player = useRef<SoundPlayer | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef(0);
  const latest = useRef({ selected, enabled, volume, outcome });
  const current = soundDetails(selected, outcome);
  const visibleSounds = completionSounds.filter(
    (sound) => family === "All" || sound.family === family,
  );

  useEffect(
    () => () => {
      request.current++;
      if (timer.current) clearTimeout(timer.current);
      player.current?.dispose();
      player.current = null;
    },
    [],
  );

  function failed() {
    latest.current.enabled = false;
    player.current?.mute();
    setEnabled(false);
    setError("Audio is unavailable. You can still try the visual preview.");
  }

  async function toggleSound() {
    const id = ++request.current;
    setError("");
    if (enabled) {
      latest.current.enabled = false;
      setEnabled(false);
      player.current?.mute();
      return;
    }
    setEnabling(true);
    try {
      const audio = (player.current ??= new SoundPlayer());
      const ready = await audio.enable(latest.current.volume / 100);
      if (id !== request.current) return;
      if (!ready) failed();
      else {
        latest.current.enabled = true;
        setEnabled(true);
      }
    } catch {
      if (id === request.current) failed();
    } finally {
      if (id === request.current) setEnabling(false);
    }
  }

  function hear(sound: CompletionSound) {
    if (!latest.current.enabled || latest.current.volume === 0) return;
    try {
      const audio = player.current;
      audio?.stop();
      if (
        !audio?.playGenerated(
          `simulation:${latest.current.outcome}:${sound}`,
          (rate) =>
            createCompletionSamples(sound, rate, latest.current.outcome),
        )
      ) {
        failed();
        return;
      }
      setLastHeard(soundDetails(sound, latest.current.outcome).name);
    } catch {
      failed();
    }
  }

  function select(sound: CompletionSound) {
    latest.current.selected = sound;
    setSelected(sound);
    if (status !== "running") hear(sound);
  }

  function previewRun() {
    player.current?.stop();
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      setStatus("idle");
      return;
    }
    setStatus("running");
    timer.current = setTimeout(() => {
      timer.current = null;
      setStatus("done");
      hear(latest.current.selected);
    }, 2000);
  }

  function chooseOutcome(next: SimulationOutcome) {
    if (status === "running" || outcome === next) return;
    player.current?.stop();
    latest.current.outcome = next;
    setOutcome(next);
    setStatus("idle");
    setLastHeard("");
  }

  return (
    <main className={styles.page} data-outcome={outcome}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link
            href="/workspace"
            className={styles.brand}
            aria-label="Project CAD workspace"
          >
            <span className={styles.brandIcon}>
              <Waves size={22} aria-hidden="true" />
            </span>
            Project CAD
          </Link>
          <span className={styles.breadcrumb}>
            / <span>Sound studio</span>
          </span>
          <Link href="/workspace" className={styles.back}>
            <ArrowLeft size={15} aria-hidden="true" />
            <span>Back to workspace</span>
          </Link>
        </header>

        <section className={styles.intro}>
          <div className={styles.eyebrow}>
            <span /> SIMULATION FEEDBACK
          </div>
          <h1>
            A sound for <span>every outcome.</span>
          </h1>
          <p>
            10 music-box versions. Success melodies and two-note cues for failed
            runs.
          </p>
        </section>

        <div className={styles.toolbar}>
          <div
            className={styles.outcomes}
            role="group"
            aria-label="Simulation outcome"
          >
            <button
              type="button"
              aria-pressed={outcome === "complete"}
              disabled={status === "running"}
              onClick={() => chooseOutcome("complete")}
            >
              <Check size={16} aria-hidden="true" />
              Complete
            </button>
            <button
              type="button"
              aria-pressed={outcome === "attention"}
              disabled={status === "running"}
              onClick={() => chooseOutcome("attention")}
            >
              <CircleAlert size={16} aria-hidden="true" />
              Needs attention
            </button>
          </div>
          <div className={styles.audioControls}>
            <div className={styles.volume}>
              <label htmlFor="preview-volume">Volume</label>
              <input
                id="preview-volume"
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  latest.current.volume = next;
                  setVolume(next);
                  player.current?.setVolume(next / 100);
                }}
              />
              <output htmlFor="preview-volume">{volume}%</output>
            </div>
            <button
              type="button"
              className={styles.soundToggle}
              onClick={toggleSound}
              disabled={enabling}
              aria-pressed={enabled}
            >
              {enabled ? (
                <Volume2 size={17} aria-hidden="true" />
              ) : (
                <VolumeX size={17} aria-hidden="true" />
              )}
              {enabling
                ? "Enabling…"
                : enabled
                  ? "Mute preview"
                  : "Enable sound"}
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <div className={styles.layout}>
          <section
            className={styles.candidates}
            aria-labelledby="candidate-heading"
          >
            <div className={styles.sectionHeading}>
              <h2 id="candidate-heading">
                {family === "Music box"
                  ? "Choose a music box"
                  : "Choose a sound"}
              </h2>
              <span>
                {family === "Music box"
                  ? `${visibleSounds.length} versions`
                  : `${visibleSounds.length} of ${completionSounds.length} sounds`}
              </span>
            </div>
            <div
              className={styles.filters}
              role="group"
              aria-label="Sound family"
            >
              {(["All", ...soundFamilies] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={family === value}
                  onClick={() => setFamily(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className={styles.grid}>
              {visibleSounds.map((sound) => {
                const details = soundDetails(sound.id, outcome);
                const number =
                  "variant" in sound
                    ? sound.variant
                    : completionSounds.indexOf(sound) + 1;
                return (
                  <button
                    key={sound.id}
                    data-sound={sound.id}
                    type="button"
                    className={`${styles.card} ${selected === sound.id ? styles.selected : ""}`}
                    aria-pressed={selected === sound.id}
                    aria-label={details.name}
                    onClick={() => select(sound.id)}
                  >
                    <span className={styles.cardTop}>
                      <span className={styles.number}>
                        {String(number).padStart(2, "0")}
                      </span>
                      {sound.family === "Music box" &&
                      outcome === "attention" ? (
                        <span className={styles.noteCount}>2 notes</span>
                      ) : (
                        sound.recommended && (
                          <span className={styles.recommended}>
                            Pairs with Felt keys
                          </span>
                        )
                      )}
                      <span className={styles.selection}>
                        {selected === sound.id && (
                          <Check
                            size={13}
                            strokeWidth={2.6}
                            aria-hidden="true"
                          />
                        )}
                      </span>
                    </span>
                    <svg
                      className={styles.waveform}
                      viewBox="0 0 240 56"
                      aria-hidden="true"
                    >
                      {waveforms[outcome][sound.id].map((height, bar) => (
                        <rect
                          key={bar}
                          x={bar * 5 + 1}
                          y={(56 - height) / 2}
                          width="2.5"
                          height={height}
                          rx="1.25"
                        />
                      ))}
                    </svg>
                    <span className={styles.cardTitle}>{details.name}</span>
                    <span className={styles.description}>
                      {details.description}
                    </span>
                    <span className={styles.cardBottom}>
                      <span>{sound.character}</span>
                      <span>
                        {details.duration.toFixed(2)}s{" "}
                        <Play
                          size={12}
                          fill="currentColor"
                          aria-hidden="true"
                        />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className={styles.hint}>
              {status === "running"
                ? "Choose a sound to hear when this preview finishes."
                : enabled
                  ? "Select a card to listen. Each sound plays at the same volume."
                  : "Enable sound, then select a card to listen."}
            </p>
          </section>

          <section className={styles.preview} aria-labelledby="preview-heading">
            <div className={styles.previewHeading}>
              <FlaskConical size={18} aria-hidden="true" />
              <span>IN CONTEXT</span>
              <span className={styles.previewBadge}>Preview only</span>
            </div>
            <h2 id="preview-heading">Hear it at the finish.</h2>
            <p className={styles.previewDescription}>
              {outcome === "complete"
                ? "Try your sound after a successful two-second demo run."
                : "Try your sound when a two-second demo run doesn’t pass."}
            </p>

            <div
              className={`${styles.runVisual} ${status === "done" ? styles.finished : ""}`}
            >
              <div className={styles.process} aria-hidden="true">
                <span className={styles.processNode}>
                  <span className={styles.feedSymbol} />
                </span>
                <span className={styles.connector}>
                  <ArrowRight size={16} />
                </span>
                <span className={`${styles.processNode} ${styles.centerNode}`}>
                  {status === "done" ? (
                    outcome === "attention" ? (
                      <CircleAlert size={26} />
                    ) : (
                      <CheckCheck size={26} />
                    )
                  ) : status === "running" ? (
                    <LoaderCircle size={26} className={styles.spinner} />
                  ) : (
                    <FlaskConical size={25} />
                  )}
                </span>
                <span className={styles.connector}>
                  <ArrowRight size={16} />
                </span>
                <span className={styles.processNode}>
                  <span className={styles.productSymbol} />
                </span>
              </div>
              <div
                className={styles.runStatus}
                role="status"
                aria-live="polite"
              >
                <strong>
                  {status === "running"
                    ? "Simulation running…"
                    : status === "done"
                      ? outcome === "attention"
                        ? "Simulation needs attention"
                        : "Simulation complete"
                      : "Ready when you are"}
                </strong>
                <span>
                  {status === "running"
                    ? "Your sound will play at the end."
                    : status === "done"
                      ? outcome === "attention"
                        ? "Review the issues, then try again."
                        : "Your results are ready."
                      : "A little pause. A gentle finish."}
                </span>
              </div>
              <div className={styles.progress} aria-hidden="true">
                <span
                  key={status}
                  className={
                    status === "running"
                      ? styles.progressRunning
                      : status === "done"
                        ? styles.progressDone
                        : undefined
                  }
                />
              </div>
            </div>

            <div className={styles.chosen}>
              <span>
                <span className={styles.smallLabel}>
                  {outcome === "attention"
                    ? "NEEDS ATTENTION SOUND"
                    : "COMPLETION SOUND"}
                </span>
                <strong>{current.name}</strong>
              </span>
              <button
                type="button"
                aria-label={`Preview ${current.name}`}
                className={styles.replay}
                disabled={!enabled || volume === 0 || status === "running"}
                onClick={() => hear(selected)}
              >
                <Volume2 size={19} aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              className={styles.runButton}
              onClick={previewRun}
            >
              {status === "running" ? (
                <Square size={15} aria-hidden="true" />
              ) : status === "done" ? (
                <RotateCcw size={17} aria-hidden="true" />
              ) : (
                <Play size={15} fill="currentColor" aria-hidden="true" />
              )}
              {status === "running"
                ? "Cancel preview"
                : status === "done"
                  ? "Run preview again"
                  : "Preview a simulation"}
            </button>
            <p className={styles.lastHeard} aria-live="polite">
              {!enabled || volume === 0
                ? "Preview is muted"
                : lastHeard
                  ? `Last heard · ${lastHeard}`
                  : "Sound is on · ready to listen"}
            </p>
          </section>
        </div>

        <footer className={styles.footer}>
          <span>
            <span className={styles.footerDot} /> Made for a quieter workspace.
          </span>
          <span>
            Sound candidates only. Your application settings stay as they are.
          </span>
        </footer>
      </div>
    </main>
  );
}

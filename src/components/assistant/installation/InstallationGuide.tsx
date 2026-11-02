"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowUpRight,
  Check,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  ScanSearch,
  Shield,
} from "lucide-react";
import InstallationScene from "./InstallationScene";
import {
  installationSteps,
  MAC_VERSIONS,
  STEP_MS,
  type GuidePlatform,
  type GuideStep,
  type MacVersion,
  type WindowsArchitecture,
} from "./installationGuideData";
import styles from "./InstallationGuide.module.css";

function subscribeToMedia(query: string, onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const subscribeMotion = (onChange: () => void) =>
  subscribeToMedia("(prefers-reduced-motion: reduce)", onChange);
const subscribeAppearance = (onChange: () => void) =>
  subscribeToMedia("(prefers-color-scheme: dark)", onChange);
const getReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const getDarkMode = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches;
const serverFalse = () => false;
const subscribePlatform = () => () => {};
const getPlatform = (): GuidePlatform | "other" =>
  /Windows NT/i.test(navigator.userAgent)
    ? "windows"
    : /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints < 2
      ? "mac"
      : "other";
const serverPlatform = (): GuidePlatform | "other" => "other";
const formatTime = (ms: number) =>
  `0:${String(Math.floor(ms / 1000)).padStart(2, "0")}`;

function NativeStage({
  step,
  version,
  architecture,
  dark,
  elapsed,
  playing,
  reducedMotion,
  label,
}: {
  step: GuideStep;
  version: MacVersion;
  architecture: WindowsArchitecture;
  dark: boolean;
  elapsed: number;
  playing: boolean;
  reducedMotion: boolean;
  label: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState({
    width: 600,
    height: 420,
    x: 360,
    y: 240,
    targetWidth: 80,
    targetHeight: 28,
  });
  const [focusOverride, setFocusOverride] = useState<boolean | null>(null);
  const focused = focusOverride ?? geometry.width < 440;
  const fitScale = Math.min(geometry.width / 720, geometry.height / 480);
  const scale = focused ? 1.12 : fitScale;
  const offsetX = focused
    ? Math.max(
        geometry.width - 720 * scale,
        Math.min(0, geometry.width / 2 - geometry.x * scale),
      )
    : (geometry.width - 720 * scale) / 2;
  const offsetY = focused
    ? Math.max(
        geometry.height - 480 * scale,
        Math.min(0, geometry.height / 2 - geometry.y * scale),
      )
    : (geometry.height - 480 * scale) / 2;

  useEffect(() => {
    const viewport = viewportRef.current;
    const frame = frameRef.current;
    if (!viewport || !frame) return;
    const measure = () => {
      const target = frame.querySelector("[data-guide-target]");
      if (!target) return;
      const rect = frame.getBoundingClientRect();
      const action = target.getBoundingClientRect();
      const currentScale = rect.width / 720;
      if (!currentScale) return;
      setGeometry({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
        x: (action.left + action.width / 2 - rect.left) / currentScale,
        y: (action.top + action.height / 2 - rect.top) / currentScale,
        targetWidth: action.width / currentScale,
        targetHeight: action.height / currentScale,
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [step.scene, version, architecture, dark]);

  const localTime = elapsed % STEP_MS;
  const progress =
    !playing && localTime === 0
      ? 1
      : Math.max(0, Math.min(1, (localTime - 600) / 1800));
  const travel = 1 - Math.pow(1 - progress, 3);
  const clicking =
    playing &&
    (step.scene === "win-download"
      ? (localTime > 2600 && localTime < 2850) ||
        (localTime > 3050 && localTime < 3300)
      : localTime > 2700 && localTime < 3200);

  return (
    <>
      <div className={styles.sceneToolbar}>
        <span>{step.location}</span>
        <button
          aria-pressed={focused}
          onClick={() => setFocusOverride(!focused)}
          aria-label={focused ? "Show whole window" : "Focus on action"}
        >
          <ScanSearch size={15} />
          {focused ? "Whole window" : "Focus on action"}
        </button>
      </div>
      <div ref={viewportRef} className={styles.stage} data-focused={focused}>
        <div
          ref={frameRef}
          className={styles.nativeFrame}
          aria-hidden="true"
          style={{
            transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
          }}
        >
          <InstallationScene
            scene={step.scene}
            version={version}
            architecture={architecture}
            dark={dark}
          />
          <span
            className={styles.actionOutline}
            style={{
              left: geometry.x - geometry.targetWidth / 2 - 4,
              top: geometry.y - geometry.targetHeight / 2 - 4,
              width: geometry.targetWidth + 8,
              height: geometry.targetHeight + 8,
            }}
          />
          {!reducedMotion ? (
            <span
              className={styles.cursorPosition}
              style={{
                transform: `translate(${geometry.x + geometry.targetWidth * 0.18 - 80 * (1 - travel)}px, ${geometry.y + 2 + 60 * (1 - travel)}px)`,
              }}
            >
              <span
                className={styles.clickRing}
                style={{
                  opacity: clicking ? 1 : 0,
                  transform: `scale(${clicking ? 1 : 0.6})`,
                }}
              />
              <MousePointer2
                size={26}
                className={styles.cursor}
                style={{ transform: `scale(${clicking ? 0.88 : 1})` }}
              />
            </span>
          ) : null}
        </div>
      </div>
      <div className={styles.actionCaption} aria-live="polite">
        <MousePointer2 size={15} />
        <span>{step.action}</span>
      </div>
      <figcaption className={styles.sceneCaption}>
        {label} · English · UI recreation
      </figcaption>
    </>
  );
}

export default function InstallationGuide({
  platform: fixedPlatform,
  architecture: fixedArchitecture,
  previewControls = false,
}: {
  platform?: GuidePlatform;
  architecture?: WindowsArchitecture;
  previewControls?: boolean;
}) {
  const detectedPlatform = useSyncExternalStore(
    subscribePlatform,
    getPlatform,
    serverPlatform,
  );
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    getReducedMotion,
    serverFalse,
  );
  const systemDark = useSyncExternalStore(
    subscribeAppearance,
    getDarkMode,
    serverFalse,
  );
  const [selectedPlatform, setSelectedPlatform] =
    useState<GuidePlatform | null>(null);
  const platform =
    fixedPlatform ??
    selectedPlatform ??
    (detectedPlatform === "windows" ? "windows" : "mac");
  const [version, setVersion] = useState<MacVersion | "other">("tahoe");
  const [selectedArchitecture, setArchitecture] =
    useState<WindowsArchitecture>("universal");
  const architecture = fixedArchitecture ?? selectedArchitecture;
  const [appearance, setAppearance] = useState<"system" | "light" | "dark">(
    "system",
  );
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const guideRef = useRef<HTMLDivElement>(null);
  const steps = useMemo(
    () => installationSteps(platform, architecture),
    [platform, architecture],
  );
  const duration = steps.length * STEP_MS;
  const stepIndex = Math.min(steps.length - 1, Math.floor(elapsed / STEP_MS));
  const step = steps[stepIndex];
  const finished = elapsed >= duration;
  const dark = appearance === "system" ? systemDark : appearance === "dark";
  const hasWalkthrough = platform === "windows" || version !== "other";
  const label =
    platform === "mac" && version !== "other"
      ? MAC_VERSIONS[version]
      : "Windows 11";
  const source =
    platform === "mac"
      ? "https://support.apple.com/en-us/102445"
      : "https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation";

  useEffect(() => {
    if (!playing) return;
    const startedAt = performance.now() - elapsedRef.current;
    const timer = window.setInterval(() => {
      const next = Math.min(duration, performance.now() - startedAt);
      elapsedRef.current = next;
      setElapsed(next);
      if (next === duration) setPlaying(false);
    }, 40);
    const pauseWhenHidden = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", pauseWhenHidden);
    };
  }, [playing, duration]);

  useEffect(() => {
    const root = guideRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) setPlaying(false);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  function seek(time: number) {
    setPlaying(false);
    elapsedRef.current = time;
    setElapsed(time);
  }
  function togglePlayback() {
    if (finished) {
      elapsedRef.current = 0;
      setElapsed(0);
    }
    setPlaying(!playing);
  }

  return (
    <div className={styles.guideBody} ref={guideRef}>
      <div className={styles.guideIntro}>
        <p>
          {platform === "mac"
            ? "If macOS says this installer can’t be verified, follow the steps for your macOS version."
            : "If Microsoft Defender SmartScreen shows “Windows protected your PC,” review the installer using these steps."}
        </p>
        {previewControls ? (
          <div
            className={styles.platforms}
            role="group"
            aria-label="Operating system"
          >
            {(["mac", "windows"] as const).map((id) => (
              <button
                key={id}
                aria-pressed={platform === id}
                onClick={() => {
                  seek(0);
                  setSelectedPlatform(id);
                }}
              >
                {id === "mac" ? "macOS" : "Windows 11"}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className={styles.viewOptions}>
        {platform === "mac" ? (
          <label>
            macOS version
            <select
              aria-label="macOS version"
              value={version}
              onChange={(event) => {
                seek(0);
                setVersion(event.target.value as MacVersion | "other");
              }}
            >
              <option value="tahoe">Tahoe 26</option>
              <option value="sequoia">Sequoia 15</option>
              <option value="other">Another version</option>
            </select>
          </label>
        ) : previewControls ? (
          <label>
            Installer
            <select
              aria-label="Installer"
              value={architecture}
              onChange={(event) => {
                seek(0);
                setArchitecture(event.target.value as WindowsArchitecture);
              }}
            >
              <option value="universal">Windows x64 + ARM64</option>
              <option value="x64">Windows x64</option>
              <option value="arm64">Windows ARM64</option>
            </select>
          </label>
        ) : null}
        {hasWalkthrough ? (
          <label>
            Appearance
            <select
              aria-label="Appearance"
              value={appearance}
              onChange={(event) => {
                setPlaying(false);
                setAppearance(event.target.value as typeof appearance);
              }}
            >
              <option value="system">Match system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        ) : null}
        <span>
          {platform === "mac"
            ? "Find your version: Apple menu → About This Mac"
            : previewControls
              ? "Find your processor: Settings → System → About"
              : architecture === "universal"
                ? "This installer supports x64 and ARM64"
                : `Showing the ${architecture === "arm64" ? "ARM64" : "x64"} installer you selected`}
        </span>
      </div>
      {hasWalkthrough ? (
        <div className={styles.walkthrough}>
          <figure
            className={styles.player}
            aria-label={`${label} installer walkthrough`}
          >
            <NativeStage
              key={platform}
              step={step}
              version={version === "other" ? "tahoe" : version}
              architecture={architecture}
              dark={dark}
              elapsed={elapsed}
              playing={playing}
              reducedMotion={reducedMotion}
              label={label}
            />
            <div className={styles.playerControls}>
              <button
                className={styles.playButton}
                onClick={togglePlayback}
                aria-label={
                  playing
                    ? "Pause guide"
                    : finished
                      ? "Replay guide"
                      : "Play guide"
                }
              >
                {playing ? (
                  <Pause size={14} fill="currentColor" />
                ) : finished ? (
                  <RotateCcw size={16} />
                ) : (
                  <Play size={14} fill="currentColor" />
                )}
                {playing
                  ? "Pause"
                  : finished
                    ? "Replay"
                    : elapsed > 0
                      ? "Continue"
                      : "Play guide"}
              </button>
              <progress
                className={styles.progress}
                aria-label="Guide progress"
                value={elapsed}
                max={duration}
              />
              <span className={styles.time}>
                {formatTime(elapsed)} / {formatTime(duration)}
              </span>
              <button
                className={styles.restart}
                aria-label="Restart guide"
                onClick={() => seek(0)}
              >
                <RotateCcw size={16} />
              </button>
            </div>
            <p className={styles.playbackNote}>
              {reducedMotion
                ? "Reduced motion is on. Read or play the still steps."
                : "Pause at any point, or select a step to follow at your own pace."}
            </p>
          </figure>
          <ol className={styles.steps} aria-label="Installation steps">
            {steps.map((item, index) => (
              <li key={item.scene}>
                <button
                  aria-current={stepIndex === index ? "step" : undefined}
                  onClick={() => seek(index * STEP_MS)}
                >
                  <span className={styles.stepNumber}>
                    {index < stepIndex || finished ? (
                      <Check size={14} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    {stepIndex === index ? (
                      <span className={styles.stepDescription}>
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className={styles.versionHelp}>
          Your macOS version may show different buttons. Use Apple’s guidance
          below for the instructions that apply to your Mac.
        </p>
      )}
      <div className={styles.trustNote}>
        <Shield size={16} />
        <p>
          Only continue for a Project CAD download you trust.
          {platform === "windows"
            ? " If your screen says Smart App Control blocked this app, or Run anyway is missing, this guide doesn’t apply. Follow your device’s security policy."
            : " If macOS reports malware or a damaged file, stop; these steps apply only to an unverified developer warning."}
        </p>
        <a href={source}>
          {platform === "mac" ? "Apple’s guidance" : "Microsoft’s guidance"}
          <ArrowUpRight size={14} />
        </a>
      </div>
    </div>
  );
}

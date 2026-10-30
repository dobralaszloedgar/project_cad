"use client";

import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Pause, Play } from "lucide-react";
import {
  motion,
  MotionConfig,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  animate,
} from "motion/react";
import WorldBackdrop from "./WorldBackdrop";
import { useMotionPreference } from "./use-motion-preference";
import styles from "./LandingPage.module.css";
import CadWorkbench, { createCadBridge } from "./CadWorkbench";
import BuildActivity from "./BuildActivity";
import { useStoryPlayback } from "./use-story-playback";
import { STORY_END, STORY_STOPS } from "./landing-playback";

const LandingExperience = dynamic(() => import("./LandingExperience"), {
  ssr: false,
  loading: () => null,
});
const spring = { stiffness: 300, damping: 30, mass: 1 };
const entranceSpring = { type: "spring" as const, stiffness: 32, damping: 14 };
// Entering the GPU-heavy workspace starts a new document, releasing this scene
// before the equipment sandbox creates its own renderer.
const MotionLink = motion.a;
const chapters = ["Imagine", "Build", "Explore"];
const thoughts = [
  "Thinking through your process…",
  "Choosing the right equipment…",
  "Finding the connections…",
];

function EntryLink({ href, children }: { href: string; children: ReactNode }) {
  const x = useSpring(0, spring);
  const y = useSpring(0, spring);
  const reduced = useMotionPreference();
  const move = (event: MouseEvent<HTMLAnchorElement>) => {
    if (reduced) return;
    const rect = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - rect.left - rect.width / 2) * 0.1);
    y.set((event.clientY - rect.top - rect.height / 2) * 0.1);
  };
  return (
    <MotionLink
      href={href}
      className={styles.primaryLink}
      style={{ x, y }}
      onMouseMove={move}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
      whileTap={{ scale: 0.97 }}
    >
      {children}
      <ArrowUpRight size={17} strokeWidth={1.5} />
    </MotionLink>
  );
}

export default function LandingPage() {
  const root = useRef<HTMLElement>(null);
  const cadBridge = useMemo(() => createCadBridge(), []);
  const { scrollYProgress } = useScroll({
    target: root,
    offset: ["start start", "end end"],
  });
  const scrollJourney = useRef<ReturnType<typeof animate> | null>(null);
  const reduced = useMotionPreference();
  const pointerX = useSpring(0, { stiffness: 65, damping: 22 });
  const pointerY = useSpring(0, { stiffness: 65, damping: 22 });
  const [chapter, setChapter] = useState(0);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [visible, setVisible] = useState(true);
  const [transparent, setTransparent] = useState(true);
  const [thought, setThought] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneEntered, setSceneEntered] = useState(false);
  const [sceneUnavailable, setSceneUnavailable] = useState(false);
  const onSceneReady = useCallback(() => setSceneReady(true), []);
  const onSceneUnavailable = useCallback(() => setSceneUnavailable(true), []);
  const { progress, construction, speed } = useStoryPlayback(
    scrollYProgress,
    motionEnabled,
    visible && sceneEntered,
    reduced,
  );
  const [tourStop, setTourStop] = useState(0);
  const normalizedProgress = useTransform(
    progress,
    (value) => value / STORY_END,
  );
  const chapterRef = useRef(0);
  const playing = motionEnabled && !reduced && visible;
  const heroOpacity = useTransform(progress, [0, 0.16, 0.29], [1, 1, 0]);
  const heroY = useTransform(progress, [0, 0.28], [0, 70]);
  const buildOpacity = useTransform(
    progress,
    [0.27, 0.36, 0.58, 0.66],
    [0, 1, 1, 0],
  );
  const exploreOpacity = useTransform(progress, [0.79, 0.89], [0, 1]);
  const exploreY = useTransform(progress, [0.67, 0.82], [40, 0]);

  useEffect(() => {
    const cancelJourney = () => scrollJourney.current?.stop();
    window.addEventListener("wheel", cancelJourney, { passive: true });
    window.addEventListener("touchstart", cancelJourney, { passive: true });
    window.addEventListener("keydown", cancelJourney);
    return () => {
      cancelJourney();
      window.removeEventListener("wheel", cancelJourney);
      window.removeEventListener("touchstart", cancelJourney);
      window.removeEventListener("keydown", cancelJourney);
    };
  }, []);

  useMotionValueEvent(progress, "change", (value) => {
    const next = value < 0.27 ? 0 : value < 0.79 ? 1 : 2;
    if (next !== chapterRef.current) {
      chapterRef.current = next;
      setChapter(next);
    }
    setTourStop(value < 1.07 ? 0 : value < 1.29 ? 1 : value < 1.49 ? 2 : 3);
  });
  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    if (!playing || !sceneEntered || chapter !== 0) return;
    const timer = window.setInterval(
      () => setThought((value) => (value + 1) % thoughts.length),
      2800,
    );
    return () => window.clearInterval(timer);
  }, [playing, sceneEntered, chapter]);

  const travelTo = (position: number) => {
    const element = root.current;
    if (!element) return;
    const top = window.scrollY + element.getBoundingClientRect().top;
    const target =
      top +
      ((element.offsetHeight - window.innerHeight) * position) / STORY_END;
    scrollJourney.current?.stop();
    if (reduced) window.scrollTo({ top: target, behavior: "instant" });
    else
      scrollJourney.current = animate(window.scrollY, target, {
        type: "spring",
        stiffness: 26,
        damping: 13,
        mass: 1.2,
        restDelta: 0.5,
        restSpeed: 0.5,
        onUpdate: (value) =>
          window.scrollTo({ top: value, behavior: "instant" }),
      });
  };
  const goTo = (index: number) => travelTo(STORY_STOPS[index]);
  const tourCopy = [
    [
      "Now,",
      "step inside.",
      "Every vessel. Every stream. A whole new perspective.",
    ],
    [
      "Heat,",
      "exchanged.",
      "Follow the flow through the shell and tube bundle.",
    ],
    [
      "Inside",
      "the reaction.",
      "See the catalyst beds inside the transparent reactor.",
    ],
    [
      "Separation,",
      "tray by tray.",
      "Explore the column internals and the flow between stages.",
    ],
  ][tourStop];

  return (
    <MotionConfig transition={spring} reducedMotion="user">
      <main
        ref={root}
        className={styles.story}
        data-landing-page
        data-chapter={chapter}
        data-motion={playing ? "playing" : "paused"}
        data-launch-state={
          sceneUnavailable
            ? "unavailable"
            : sceneEntered
              ? "live"
              : sceneReady
                ? "entering"
                : "preparing"
        }
      >
        <Link className={styles.skipLink} href="/">
          Skip the story and open workspace
        </Link>
        <div
          className={styles.stage}
          data-landing-stage
          onPointerMove={(event) => {
            if (!playing || !sceneEntered || event.pointerType === "touch")
              return;
            const rect = event.currentTarget.getBoundingClientRect();
            pointerX.set((event.clientX - rect.left) / rect.width - 0.5);
            pointerY.set((event.clientY - rect.top) / rect.height - 0.5);
          }}
          onPointerLeave={() => {
            if (playing) {
              pointerX.set(0);
              pointerY.set(0);
            }
          }}
        >
          <header className={styles.header}>
            <Link
              href="/landing"
              className={styles.brand}
              aria-label="Project CAD landing page"
            >
              <svg viewBox="0 0 31 36" fill="none" aria-hidden="true">
                <path
                  d="M15.5 2 29 9.7v15.6L15.5 33 2 25.3V9.7L15.5 2Z M2 9.7l13.5 7.8L29 9.7 M15.5 17.5V33 M15.5 2v15.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
              Project CAD
            </Link>
            <nav className={styles.chapters} aria-label="Story chapters">
              {chapters.map((name, index) => (
                <button
                  key={name}
                  onClick={() => goTo(index)}
                  aria-current={chapter === index ? "step" : undefined}
                >
                  <span className={styles.srOnly}>0{index + 1} </span>
                  {name}
                  {chapter === index && (
                    <motion.i layoutId="chapter-underline" />
                  )}
                </button>
              ))}
            </nav>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Full navigation releases the landing WebGL context before opening the workspace. */}
            <a href="/" className={styles.workspaceLink}>
              Open workspace
              <ArrowUpRight size={16} />
            </a>
          </header>

          <div className={styles.experienceStage} data-shared-scene>
            <LandingExperience
              onReady={onSceneReady}
              onUnavailable={onSceneUnavailable}
              progress={progress}
              cadBridge={cadBridge}
              construction={construction}
              playing={playing && sceneEntered}
              transparent={transparent}
              reduced={reduced}
              pointerX={pointerX}
              pointerY={pointerY}
            />
          </div>
          <motion.div
            className={styles.launchPreview}
            initial={false}
            animate={{ opacity: sceneReady || sceneUnavailable ? 0 : 1 }}
            transition={reduced ? { duration: 0 } : entranceSpring}
            aria-hidden="true"
            data-launch-preview
            onAnimationComplete={() => {
              if (sceneReady) setSceneEntered(true);
            }}
          >
            <picture>
              <source
                media="(max-aspect-ratio: 17/20)"
                srcSet="/landing/plant-opening-portrait.webp"
              />
              {/* An exact first-frame render, served before the WebGL bundle.
                  Native picture selection avoids downloading both viewports. */}
              <img
                src="/landing/plant-opening-wide.webp"
                alt=""
                fetchPriority="high"
                loading="eager"
                decoding="sync"
              />
            </picture>
          </motion.div>
          <WorldBackdrop />
          <div className={styles.sceneVeil} aria-hidden="true" />
          <CadWorkbench
            progress={progress}
            construction={construction}
            bridge={cadBridge}
          />

          <motion.section
            className={styles.chapter}
            style={{ opacity: heroOpacity }}
            aria-hidden={chapter !== 0}
            inert={chapter !== 0}
            aria-labelledby="imagine-title"
            data-scene="imagine"
          >
            <div className={styles.prompt}>
              <span className={styles.aiSystemLabel}>PROCESS INTELLIGENCE</span>
              <span className={styles.thinking}>
                <i aria-hidden="true" />
                {sceneUnavailable
                  ? "Live preview unavailable"
                  : sceneEntered
                    ? thoughts[thought]
                    : "Bringing your plant online…"}
              </span>
              <button
                onClick={() => goTo(1)}
                className={styles.promptButton}
                aria-label="Watch this process take shape"
              >
                <span>
                  Build a process with reaction,
                  <br />
                  separation, and recycle.
                </span>
                <ArrowRight size={19} />
              </button>
              <span className={styles.exampleLabel}>
                EXAMPLE WORKFLOW · SCROLL TO CONSTRUCT
              </span>
            </div>
            <motion.div
              className={styles.sceneCaption}
              style={{ y: reduced ? 0 : heroY }}
            >
              <h1 id="imagine-title">
                A little thought.
                <br />
                <span>A whole new world.</span>
              </h1>
              <p>Describe it. Build it. Step inside.</p>
            </motion.div>
            <div className={styles.sceneActions}>
              <EntryLink href="/">Start building</EntryLink>
            </div>
          </motion.section>

          <motion.section
            className={styles.chapter}
            style={{ opacity: buildOpacity }}
            aria-hidden={chapter !== 1}
            inert={chapter !== 1}
            aria-labelledby="build-title"
            data-scene="build"
          >
            <BuildActivity construction={construction} speed={speed} />
            <div className={styles.sceneCaption}>
              <h2 id="build-title">
                Every connection,
                <br />
                <span>taking shape.</span>
              </h2>
              <p>From a thought to a working flowsheet.</p>
            </div>
            <div className={styles.sceneActions}>
              <button className={styles.textLink} onClick={() => goTo(2)}>
                Step inside
                <ArrowRight size={18} />
              </button>
            </div>
          </motion.section>

          <motion.section
            className={styles.chapter}
            style={{ opacity: exploreOpacity }}
            aria-hidden={chapter !== 2}
            inert={chapter !== 2}
            aria-labelledby="explore-title"
            data-scene="explore"
          >
            <motion.div
              className={styles.sceneCaption}
              style={{ y: reduced ? 0 : exploreY }}
            >
              <h2 id="explore-title">
                {tourCopy[0]} <span>{tourCopy[1]}</span>
              </h2>
              <p>{tourCopy[2]}</p>
            </motion.div>
            <div className={styles.sceneActions}>
              <EntryLink href="/sandbox/equipment">Explore in 3D</EntryLink>
              <button
                className={styles.shellSwitch}
                role="switch"
                aria-checked={transparent}
                onClick={() => setTransparent((value) => !value)}
              >
                Transparent shells
                <span className={styles.switch} data-on={transparent}>
                  <motion.i animate={{ x: transparent ? 16 : 0 }} />
                </span>
              </button>
            </div>
          </motion.section>

          <nav className={styles.sceneRail} aria-label="Scene navigation">
            {chapters.map((name, index) => (
              <button
                key={name}
                onClick={() => goTo(index)}
                aria-label={`Go to ${name}`}
                aria-current={chapter === index ? "step" : undefined}
              >
                <span />
                <span className={styles.railLabel}>0{index + 1}</span>
              </button>
            ))}
          </nav>
          <footer className={styles.footer}>
            <div className={styles.positionLabel}>
              <span>0{chapter + 1}</span>
              <i />
              03
            </div>
            <button
              className={styles.scrollCue}
              onClick={() =>
                chapter !== 2
                  ? goTo(chapter + 1)
                  : travelTo(tourStop === 3 ? 0 : [1.25, 1.4, 1.65][tourStop])
              }
            >
              <span>
                {chapter === 0
                  ? "Scroll to enter"
                  : chapter === 1
                    ? "Scroll to step inside"
                    : tourStop === 3
                      ? "Back to the beginning"
                      : tourStop === 0
                        ? "Scroll to explore the equipment"
                        : "Keep exploring"}
              </span>
              <ArrowDown
                size={17}
                className={tourStop === 3 ? styles.upArrow : undefined}
              />
            </button>
            <button
              className={styles.pause}
              onClick={() => setMotionEnabled((value) => !value)}
              aria-label={motionEnabled ? "Pause motion" : "Resume motion"}
              aria-pressed={!motionEnabled}
              disabled={reduced}
              title={
                reduced
                  ? "Reduced motion is enabled in your device settings"
                  : undefined
              }
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
              <span>{playing ? "Pause motion" : "Motion paused"}</span>
            </button>
          </footer>
          <motion.div
            className={styles.scrollProgress}
            style={{ scaleX: normalizedProgress }}
            aria-hidden="true"
          />
        </div>
      </main>
    </MotionConfig>
  );
}

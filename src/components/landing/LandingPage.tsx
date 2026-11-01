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
import DesignChat from "./DesignChat";
import BrandMark from "@/components/BrandMark";
import { useStoryPlayback } from "./use-story-playback";
import { STORY_END, STORY_STOPS } from "./landing-playback";
import { AccelerationNotice } from "../graphics/AccelerationHelp";
import type { GraphicsInfo } from "../graphics/renderer";

const LandingExperience = dynamic(() => import("./LandingExperience"), {
  ssr: false,
  loading: () => null,
});
const spring = { stiffness: 300, damping: 30, mass: 1 };
// Entering the GPU-heavy workspace starts a new document, releasing this scene
// before the equipment sandbox creates its own renderer.
const MotionLink = motion.a;
const chapters = ["Design", "Build", "Explore"];

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
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneRequested, setSceneRequested] = useState(false);
  const [sceneUnavailable, setSceneUnavailable] = useState(false);
  const [graphicsInfo, setGraphicsInfo] = useState<GraphicsInfo | null>(null);
  const onSceneReady = useCallback(() => setSceneReady(true), []);
  const onSceneUnavailable = useCallback(() => setSceneUnavailable(true), []);
  const {
    progress,
    design,
    construction,
    simulation,
    replayDesign,
    sendDesign,
  } = useStoryPlayback(scrollYProgress, motionEnabled, visible, reduced);
  const prepareScene = () => {
    // Prepare 3D only when the finished chat leads into Build. Staying in
    // Design keeps geometry creation and shader compilation off the page.
    if (
      !sceneRequested &&
      design.get() >= 1 &&
      scrollYProgress.get() * STORY_END >= 0.27
    )
      setSceneRequested(true);
  };
  useMotionValueEvent(design, "change", prepareScene);
  useMotionValueEvent(scrollYProgress, "change", prepareScene);
  const [tourStop, setTourStop] = useState(0);
  const normalizedProgress = useTransform(
    progress,
    (value) => value / STORY_END,
  );
  const chapterRef = useRef(0);
  const playing = motionEnabled && !reduced && visible;
  const sceneOpacity = useTransform(progress, [0.12, 0.3], [0, 1]);
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
    "Step inside your process.",
    "Follow the heat.",
    "Inside the reaction.",
    "Separation, tray by tray.",
  ][tourStop];

  return (
    <MotionConfig transition={spring} reducedMotion="user">
      <main
        ref={root}
        className={styles.story}
        data-landing-page
        data-theme="light"
        data-palette="light"
        data-chapter={chapter}
        data-motion={playing ? "playing" : "paused"}
        data-launch-state={
          sceneUnavailable ? "unavailable" : sceneReady ? "live" : "preparing"
        }
      >
        <Link className={styles.skipLink} href="/workspace?home=1">
          Skip the story and open workspace
        </Link>
        <div
          className={styles.stage}
          data-landing-stage
          onPointerMove={(event) => {
            if (
              !playing ||
              !sceneReady ||
              chapter === 0 ||
              event.pointerType === "touch"
            )
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
              href="/"
              className={styles.brand}
              aria-label="Project CAD landing page"
            >
              <BrandMark />
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
            {/* Full navigation releases the landing WebGL context before setup. */}
            <a href="/workspace?home=1" className={styles.workspaceLink}>
              Open workspace
              <ArrowUpRight size={16} />
            </a>
          </header>

          {graphicsInfo?.software && !sceneUnavailable ? (
            <AccelerationNotice className={styles.graphicsNotice} />
          ) : null}

          <motion.div
            className={styles.experienceStage}
            style={{ opacity: sceneOpacity }}
            data-shared-scene
          >
            {sceneRequested ? (
              <LandingExperience
                onReady={onSceneReady}
                onUnavailable={onSceneUnavailable}
                onGraphicsInfo={setGraphicsInfo}
                progress={progress}
                cadBridge={cadBridge}
                construction={construction}
                simulation={simulation}
                playing={playing && sceneReady && chapter !== 0}
                transparent={transparent}
                reduced={reduced}
                pointerX={pointerX}
                pointerY={pointerY}
              />
            ) : null}
          </motion.div>
          <WorldBackdrop />
          <div className={styles.sceneVeil} aria-hidden="true" />
          <CadWorkbench
            progress={progress}
            construction={construction}
            simulation={simulation}
            bridge={cadBridge}
            fallback={sceneUnavailable || !sceneReady}
          />

          <motion.section
            className={styles.chapter}
            style={{ opacity: heroOpacity }}
            aria-hidden={chapter !== 0}
            inert={chapter !== 0}
            aria-labelledby="design-title"
            data-scene="design"
          >
            <div className={styles.designLayout}>
              <motion.div
                className={styles.designCaption}
                style={{ y: reduced ? 0 : heroY }}
              >
                <span className={styles.eyebrow}>FROM IDEA TO PROCESS</span>
                <h1 id="design-title">Design.</h1>
                <p>Start with a conversation.</p>
                <button
                  className={styles.textLink}
                  onClick={() => goTo(1)}
                  aria-label="Watch this process take shape"
                >
                  Watch it build <ArrowRight size={16} />
                </button>
              </motion.div>
              <DesignChat
                design={design}
                reduced={reduced}
                onReplay={replayDesign}
                onSend={sendDesign}
                onBuild={() => goTo(1)}
              />
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
            <BuildActivity
              construction={construction}
              simulation={simulation}
            />
            <div className={styles.sceneCaption}>
              <h2 id="build-title">Build.</h2>
              <p>Connected. Simulated. Ready.</p>
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
              <h2 id="explore-title">Explore.</h2>
              <p>{tourCopy}</p>
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
                  ? "Scroll to build"
                  : chapter === 1
                    ? "Scroll to explore"
                    : tourStop === 3
                      ? "Back to the beginning"
                      : tourStop === 0
                        ? "Scroll to look closer"
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

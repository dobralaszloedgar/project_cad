// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Monitor, X } from "lucide-react";
import {
  motion,
  MotionConfig,
  useMotionValueEvent,
  useScroll,
  useTransform,
  animate,
} from "motion/react";
import WorldBackdrop from "./WorldBackdrop";
import SceneBoundary from "./SceneBoundary";
import SceneFallback from "./SceneFallback";
import { useMotionPreference } from "./use-motion-preference";
import styles from "./LandingPage.module.css";
import { createCadBridge } from "./landing-bridge";
import ScrollStoryMedia from "./ScrollStoryMedia";
import BrandMark from "@/components/BrandMark";
import SiteLinks from "@/components/site/SiteLinks";
import { useStoryPlayback } from "./use-story-playback";
import { STORY_END, STORY_STOPS } from "./landing-playback";
import { tourStopAt } from "./landing-motion";

const LandingExperience = dynamic(() => import("./LandingExperience"), {
  ssr: false,
  loading: () => null,
});
const CadWorkbench = dynamic(() => import("./CadWorkbench"), { ssr: false });
const DesignChat = dynamic(() => import("./DesignChat"), { ssr: false });
const BuildActivity = dynamic(() => import("./BuildActivity"), { ssr: false });
const spring = { stiffness: 300, damping: 30, mass: 1 };
const chapters = ["Design", "Build", "Explore"];

export default function LandingPage({
  isPhone,
  workspaceBlocked,
  mode = "media",
}: {
  isPhone: boolean;
  workspaceBlocked: boolean;
  mode?: "media" | "live" | "capture";
}) {
  const root = useRef<HTMLElement>(null);
  const [workspaceNoticeVisible, setWorkspaceNoticeVisible] =
    useState(workspaceBlocked);
  const openWorkspace = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPhone) return;
    event.preventDefault();
    setWorkspaceNoticeVisible(true);
  };
  const cadBridge = useMemo(() => createCadBridge(), []);
  const { scrollYProgress } = useScroll({
    target: root,
    offset: ["start start", "end end"],
  });
  const scrollJourney = useRef<ReturnType<typeof animate> | null>(null);
  const reduced = useMotionPreference();
  const [chapter, setChapter] = useState(0);
  const [visible, setVisible] = useState(true);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneRequested, setSceneRequested] = useState(false);
  const scenePreloaded = useRef(false);
  const [sceneUnavailable, setSceneUnavailable] = useState(false);
  const onSceneReady = useCallback(() => setSceneReady(true), []);
  const onSceneUnavailable = useCallback(() => setSceneUnavailable(true), []);
  const { progress, design, construction, simulation } = useStoryPlayback(
    scrollYProgress,
    visible,
    reduced,
    mode === "media",
    mode === "capture",
  );
  useEffect(() => {
    if (mode !== "media" || !sceneUnavailable) return;
    const update = () => progress.set(scrollYProgress.get() * STORY_END);
    update();
    return scrollYProgress.on("change", update);
  }, [mode, sceneUnavailable, progress, scrollYProgress]);
  const prepareScene = () => {
    if (mode === "media") return;
    // Load the 3D code on navigation intent while the chat finishes.
    if (!scenePreloaded.current && scrollYProgress.get() * STORY_END >= 0.08) {
      scenePreloaded.current = true;
      void import("./LandingExperience").catch(() => {});
    }
    // Staying in Design does not initialize a graphics context.
    if (
      !sceneRequested &&
      design.get() >= 1 &&
      scrollYProgress.get() * STORY_END >= 0.16
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
  const tourStopRef = useRef(0);
  const playing = !reduced && visible;
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
    const stop = tourStopAt(value);
    if (stop !== tourStopRef.current) {
      tourStopRef.current = stop;
      setTourStop(stop);
    }
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
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
        onUpdate: (value) =>
          window.scrollTo({ top: value, behavior: "instant" }),
      });
  };
  const goTo = (index: number) => travelTo(STORY_STOPS[index]);
  const tourEquipment = [
    "Process overview",
    "H-101 · Heat exchanger",
    "R-101 · Packed-bed reactor",
    "D-101 · Distillation column",
  ][tourStop];
  const tourCopy = [
    "Follow the equipment and connections through your process.",
    "Follow the feed through mixing and heat exchange.",
    "See how the reactor connects to the rest of the process.",
    "Trace the separation, product streams and recycle loop.",
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
          sceneUnavailable ? "unavailable" : sceneReady ? "ready" : "preparing"
        }
      >
        <Link
          className={styles.skipLink}
          href="/workspace?home=1"
          prefetch={false}
          onClick={openWorkspace}
        >
          Skip the story and open workspace
        </Link>
        <div className={styles.stage} data-landing-stage>
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
            <a
              href="/workspace?home=1"
              className={styles.workspaceLink}
              onClick={openWorkspace}
            >
              Open workspace
              <ArrowUpRight size={16} />
            </a>
          </header>

          {workspaceNoticeVisible ? (
            <div className={styles.workspaceNotice} role="status">
              <Monitor size={22} aria-hidden="true" />
              <p>
                <strong>Please use a PC to open the workspace.</strong>
                <span>
                  You can keep exploring the landing page on your phone.
                </span>
              </p>
              <button
                type="button"
                aria-label="Dismiss workspace message"
                onClick={() => setWorkspaceNoticeVisible(false)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {mode === "media" ? (
            sceneUnavailable ? (
              <SceneFallback />
            ) : (
              <ScrollStoryMedia
                scroll={scrollYProgress}
                shown={progress}
                onReady={onSceneReady}
                onUnavailable={onSceneUnavailable}
              />
            )
          ) : (
            <>
              <motion.div
                className={styles.experienceStage}
                style={{
                  opacity: sceneReady || sceneUnavailable ? sceneOpacity : 0,
                }}
                data-shared-scene
              >
                {sceneUnavailable ? (
                  <SceneFallback />
                ) : sceneRequested ? (
                  <SceneBoundary
                    fallback={
                      <SceneFallback onUnavailable={onSceneUnavailable} />
                    }
                  >
                    <LandingExperience
                      onReady={onSceneReady}
                      onUnavailable={onSceneUnavailable}
                      capture={mode === "capture"}
                      progress={progress}
                      cadBridge={cadBridge}
                      construction={construction}
                      simulation={simulation}
                    />
                  </SceneBoundary>
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
            </>
          )}
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
                <h1 id="design-title" className={styles.chapterTitle}>
                  Design
                </h1>
                <p>Turn your process description into a working layout.</p>
              </motion.div>
              {mode !== "media" ? (
                <DesignChat design={design} reduced={reduced} />
              ) : null}
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
            {mode !== "media" ? (
              <BuildActivity
                construction={construction}
                simulation={simulation}
              />
            ) : null}
            <div className={styles.sceneCaption}>
              <h2 id="build-title" className={styles.chapterTitle}>
                Build
              </h2>
              <p>Watch the equipment connect as the process takes shape.</p>
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
              <h2 id="explore-title" className={styles.chapterTitle}>
                Explore
              </h2>
              <p className={styles.equipmentName}>{tourEquipment}</p>
              <p>{tourCopy}</p>
            </motion.div>
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
            <div className={styles.storyControls}>
              <button
                className={styles.scrollCue}
                onClick={() =>
                  chapter !== 2
                    ? goTo(chapter + 1)
                    : travelTo(tourStop === 3 ? 0 : [1.2, 1.4, 1.65][tourStop])
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
            </div>
            <div className={styles.footerInfo}>
              <small className={styles.copyright}>
                © 2026 László Edgár Dobra. All rights reserved.
              </small>
              <SiteLinks />
            </div>
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

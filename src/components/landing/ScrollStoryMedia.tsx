// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MotionValue } from "motion/react";
import { useMotionPreference } from "./use-motion-preference";

function timeAt(p: number) {
  if (p <= 0.18) return 8;
  if (p < 0.36) return 8 + ((p - 0.18) / 0.18) * 2;
  if (p < 0.53) return 10 + ((p - 0.36) / 0.17) * 10;
  if (p < 0.55) return 20 + ((p - 0.53) / 0.02) * 1.2;
  if (p < 0.95) return 21.2 + ((p - 0.55) / 0.4) * 4;
  return 25.2 + ((p - 0.95) / 0.7) * 9;
}
function progressAt(t: number) {
  if (t <= 8) return 0;
  if (t < 10) return 0.18 + ((t - 8) / 2) * 0.18;
  if (t < 20) return 0.36 + ((t - 10) / 10) * 0.17;
  if (t < 21.2) return 0.53 + ((t - 20) / 1.2) * 0.02;
  if (t < 25.2) return 0.55 + ((t - 21.2) / 4) * 0.4;
  return 0.95 + ((t - 25.2) / 9) * 0.7;
}

type StoryWindow = Window & {
  storyControl?: {
    replay: () => void;
    playAll: () => void;
    stopTour: () => void;
  };
  storyQA?: {
    requests: number;
    seeks: number;
    presented: number;
    lastWanted: number;
    lastPresented: number;
    latencies: number[];
    videoElements: number;
  };
};

const subscribeQuality = (notify: () => void) => {
  addEventListener("popstate", notify);
  return () => removeEventListener("popstate", notify);
};
const readQuality = () =>
  (process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_LANDING_REVIEW_120 === "1") &&
  new URLSearchParams(location.search).get("quality") === "120"
    ? "120"
    : "fast";
const subscribeOrientation = (notify: () => void) => {
  const media = matchMedia("(orientation:portrait)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const readOrientation = () =>
  matchMedia("(orientation:portrait)").matches ? "portrait" : "desktop";

export default function ScrollStoryMedia({
  scroll,
  shown,
  onReady,
  onUnavailable,
}: {
  scroll: MotionValue<number>;
  shown: MotionValue<number>;
  onReady: () => void;
  onUnavailable: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [failedNative, setFailedNative] = useState<string | null>(null);
  const recoveryPosition = useRef<{
    time: number;
    intro: boolean;
    tour: boolean;
    rate: number;
  } | null>(null);
  const variant = useSyncExternalStore(
    subscribeOrientation,
    readOrientation,
    () => "desktop",
  );
  const requestedQuality = useSyncExternalStore(
    subscribeQuality,
    readQuality,
    () => "fast",
  );
  const nativeKey = `${variant}:${requestedQuality}`;
  const quality = failedNative === nativeKey ? "fast" : requestedQuality;
  const reduced = useMotionPreference();
  const fps = quality === "120" ? 120 : 60;
  const file = variant + (quality === "120" ? "-120" : "");

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const recovery = recoveryPosition.current;
    recoveryPosition.current = null;
    let restoring = recovery !== null;
    let restoreRequested = false;
    const w = window as StoryWindow;
    let disposed = false,
      busy = false,
      raf = 0,
      frame = 0,
      started = 0;
    let intro = recovery?.intro ?? (scroll.get() < 0.001 && !reduced),
      tour = recovery?.tour ?? false;
    let wanted = recovery?.time ?? timeAt(scroll.get() * 1.65);
    if (recovery) v.playbackRate = recovery.rate;
    const qa = {
      requests: 0,
      seeks: 0,
      presented: 0,
      lastWanted: wanted,
      lastPresented: 0,
      latencies: [] as number[],
      videoElements: 1,
    };
    if (process.env.NODE_ENV === "development") w.storyQA = qa;
    const issue = () => {
      raf = 0;
      if (
        disposed ||
        restoring ||
        !v.duration ||
        intro ||
        tour ||
        busy ||
        v.seeking
      )
        return;
      if (v.ended && wanted >= v.duration - 1 / fps) return;
      const next = Math.max(0, Math.min(v.duration - 1 / fps, wanted));
      if (Math.abs(v.currentTime - next) < 0.6 / fps) return;
      busy = true;
      started = performance.now();
      qa.seeks++;
      v.currentTime = next;
    };
    const schedule = () => {
      if (!raf && !disposed) raf = requestAnimationFrame(issue);
    };
    const request = () => {
      if (tour) return;
      intro = false;
      v.pause();
      wanted = timeAt(Math.max(0, Math.min(1, scroll.get())) * 1.65);
      qa.requests++;
      qa.lastWanted = wanted;
      schedule();
    };
    const play = () =>
      void v.play().catch(() => {
        intro = false;
        tour = false;
        wanted = 8;
        qa.lastWanted = 8;
        schedule();
      });
    const restore = () => {
      if (!restoring || restoreRequested || !v.duration) return;
      restoreRequested = true;
      v.currentTime = Math.max(0, Math.min(v.duration - 1 / fps, wanted));
    };
    const ready = () => {
      onReady();
      if (restoring) {
        restore();
        return;
      }
      if (intro || tour) play();
      else schedule();
    };
    const seeked = () => {
      busy = false;
      if (restoring && restoreRequested) {
        restoring = false;
        if (intro || tour) play();
      }
      if (started) {
        if (process.env.NODE_ENV === "development")
          qa.latencies.push(performance.now() - started);
        started = 0;
      }
      schedule();
    };
    const present = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (disposed) return;
      if (restoring) {
        frame = v.requestVideoFrameCallback(present);
        return;
      }
      qa.presented++;
      qa.lastPresented = metadata.mediaTime;
      const progress = progressAt(metadata.mediaTime);
      shown.set(progress);
      if (tour) {
        qa.lastWanted = metadata.mediaTime;
        const root = document.querySelector<HTMLElement>("[data-landing-page]");
        if (root)
          scrollTo(0, ((root.offsetHeight - innerHeight) * progress) / 1.65);
      }
      if (intro && metadata.mediaTime >= 8 - 1 / fps) {
        intro = false;
        v.pause();
        wanted = 8;
        qa.lastWanted = 8;
        schedule();
      }
      frame = v.requestVideoFrameCallback(present);
    };
    const ended = () => {
      const completedTour = tour;
      tour = false;
      intro = false;
      if (completedTour) {
        wanted = v.duration;
        qa.lastWanted = wanted;
        shown.set(1.65);
        const root = document.querySelector<HTMLElement>("[data-landing-page]");
        if (root) scrollTo(0, root.offsetHeight - innerHeight);
      }
    };
    const unavailable = () => {
      if (disposed) return;
      if (quality === "120") {
        // Decode errors can arrive after playback has already started. Retain
        // both scroll position and playback intent when loading the web export.
        recoveryPosition.current = {
          time: intro || tour ? v.currentTime : wanted,
          intro,
          tour,
          rate: v.playbackRate,
        };
        setFailedNative(nativeKey);
      } else onUnavailable();
    };
    const onTime = () => {
      if (!restoring && !v.requestVideoFrameCallback)
        shown.set(progressAt(v.currentTime));
    };
    const stopTour = () => {
      if (!tour) return;
      tour = false;
      v.pause();
      wanted = v.currentTime;
      qa.lastWanted = wanted;
    };
    const replay = () => {
      tour = false;
      intro = true;
      cancelAnimationFrame(raf);
      raf = 0;
      v.pause();
      v.currentTime = 0;
      play();
    };
    const playAll = () => {
      tour = true;
      intro = false;
      cancelAnimationFrame(raf);
      raf = 0;
      v.pause();
      scrollTo(0, 0);
      v.currentTime = 0;
      play();
    };
    w.storyControl = { replay, playAll, stopTour };
    if (v.requestVideoFrameCallback)
      frame = v.requestVideoFrameCallback(present);
    v.addEventListener("loadeddata", ready);
    v.addEventListener("loadedmetadata", restore);
    v.addEventListener("seeked", seeked);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("ended", ended);
    v.addEventListener("error", unavailable);
    // A preloaded video can fail before React hydrates its error handler.
    if (v.error) unavailable();
    else if (v.readyState >= 2) ready();
    const stop = scroll.on("change", request);
    if (restoring && v.readyState >= 1) restore();
    const seekRecovery = setInterval(() => {
      if (busy && !v.seeking) {
        busy = false;
        schedule();
      }
    }, 150);
    return () => {
      disposed = true;
      stop();
      cancelAnimationFrame(raf);
      clearInterval(seekRecovery);
      if (frame) v.cancelVideoFrameCallback(frame);
      v.pause();
      v.removeEventListener("loadeddata", ready);
      v.removeEventListener("loadedmetadata", restore);
      v.removeEventListener("seeked", seeked);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("ended", ended);
      v.removeEventListener("error", unavailable);
      if (w.storyControl?.playAll === playAll) delete w.storyControl;
    };
  }, [
    scroll,
    shown,
    onReady,
    onUnavailable,
    variant,
    reduced,
    quality,
    fps,
    nativeKey,
  ]);

  return (
    <div
      data-full-story-media
      data-render-mode="single-scroll-timeline"
      data-media-fps={fps}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background: "#fafbf9",
      }}
    >
      <video
        ref={video}
        src={`/landing-media/${file}.mp4`}
        poster={`/landing-media/${variant}-poster.png`}
        muted
        playsInline
        preload="auto"
        aria-label="Scroll-controlled illustrated process story"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
        }}
      />
    </div>
  );
}

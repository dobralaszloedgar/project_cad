"use client";

import { useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "motion/react";
import { constructionLabel, constructionSteps } from "./landing-construction";
import styles from "./LandingPage.module.css";

/** Activity follows the same clock that draws the real application canvas. */
export default function BuildActivity({
  construction,
  speed,
}: {
  construction: MotionValue<number>;
  speed: MotionValue<number>;
}) {
  const [step, setStep] = useState(0);
  const [rate, setRate] = useState(1);
  const remaining = useTransform(construction, (value) => 1 - value);
  useMotionValueEvent(construction, "change", (value) =>
    setStep(
      Math.min(
        constructionSteps.length,
        Math.floor(value * constructionSteps.length),
      ),
    ),
  );
  useMotionValueEvent(speed, "change", (value) => setRate(Math.round(value)));
  const complete = step === constructionSteps.length;
  return (
    <div
      className={styles.buildReadout}
      data-build-activity
      data-complete={complete}
      aria-label="Example AI construction progress"
    >
      <div className={styles.activityCore} aria-hidden="true">
        <svg viewBox="0 0 80 80" fill="none">
          <circle
            cx="40"
            cy="40"
            r="36"
            stroke="#447f86"
            strokeWidth="1"
            strokeDasharray="1 7"
          />
          <circle cx="40" cy="40" r="30" stroke="#285059" strokeWidth="2" />
          <motion.circle
            cx="40"
            cy="40"
            r="30"
            pathLength="1"
            stroke="#8cffe5"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="1"
            style={{
              strokeDashoffset: remaining,
              rotate: -90,
              transformOrigin: "40px 40px",
            }}
          />
          <g className={styles.coreScanner}>
            <path
              d="M20 40a20 20 0 0 1 20-20 M60 40a20 20 0 0 1-20 20"
              stroke="#6dd6e8"
              strokeWidth="1.5"
            />
            <circle cx="40" cy="20" r="2" fill="#c9ffff" />
            <circle cx="40" cy="60" r="2" fill="#c9ffff" />
          </g>
          <path
            d={complete ? "m32 40 6 6 11-13" : "m40 30 10 10-10 10-10-10z"}
            fill={complete ? "none" : "#83ffe524"}
            stroke="#b6fff2"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className={styles.activityContent}>
        <div className={styles.buildActivityHeading}>
          <span className={styles.activityLive} />
          <span>{complete ? "BUILD COMPLETE" : "AI CONSTRUCTION"}</span>
          <span className={styles.activityCount}>
            {!complete && rate > 1 ? `${rate}× PLAYBACK` : "LIVE PREVIEW"}
          </span>
        </div>
        <div className={styles.activityAction}>
          {constructionLabel(step / constructionSteps.length)}
        </div>
        <div className={styles.activityProgress}>
          <div className={styles.activityTrack} aria-hidden="true">
            {constructionSteps.map((_, index) => (
              <i
                key={index}
                data-complete={index < step}
                data-active={index === step && !complete}
              />
            ))}
          </div>
          <span className={styles.activityStep}>
            {String(step).padStart(2, "0")}
            <span> / 18</span>
          </span>
        </div>
      </div>
    </div>
  );
}

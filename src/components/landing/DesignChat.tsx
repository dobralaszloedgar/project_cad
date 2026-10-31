"use client";

import { useRef, useState } from "react";
import {
  ArrowUp,
  ArrowRight,
  Check,
  ChevronDown,
  LoaderCircle,
  Paperclip,
  RotateCcw,
  Minus,
  Workflow,
} from "lucide-react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  type MotionValue,
} from "motion/react";
import BrandMark from "@/components/BrandMark";
import styles from "./LandingPage.module.css";

const prompt = "Build a process with reaction, separation, and recycle.";
const calls = [
  ["Read the workspace", "get_project", 0.61, 0.74],
  ["Choose equipment", "get_capabilities", 0.75, 0.88],
  ["Create the flowsheet", "propose_actions", 0.89, 1],
] as const;

export default function DesignChat({
  design,
  reduced,
  onReplay,
  onSend,
  onBuild,
}: {
  design: MotionValue<number>;
  reduced: boolean;
  onReplay: () => void;
  onSend: () => void;
  onBuild: () => void;
}) {
  const [time, setTime] = useState(design.get());
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  useMotionValueEvent(design, "change", setTime);
  const open = openOverride ?? time >= 0.16;
  const sent = time >= 0.53;
  const working = time >= 0.61;
  const complete = time >= 1;
  const typed = prompt.slice(
    0,
    Math.floor(Math.max(0, Math.min(1, (time - 0.08) / 0.37)) * prompt.length),
  );
  return (
    <div
      className={styles.assistantDemo}
      data-design-chat
      data-phase={working ? "working" : sent ? "sent" : "typing"}
      data-expanded={open}
    >
      {!open && (
        <div className={styles.pillWelcome}>
          <BrandMark size={32} />
          <span>What would you like to build?</span>
        </div>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="landing-assistant"
            className={styles.designChat}
            role="region"
            aria-label="Assistant demo"
            initial={reduced ? false : { opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpenOverride(false);
                launcher.current?.focus();
              }
            }}
          >
            <div className={styles.chatHeader}>
              <BrandMark size={22} />
              <span>Assistant</span>
              <span className={styles.demoLabel}>Demo</span>
              <button
                onClick={() => {
                  setOpenOverride(true);
                  onReplay();
                }}
                disabled={reduced}
                aria-label="Replay chat demo"
                title="Replay demo"
              >
                <RotateCcw size={15} />
              </button>
              <button
                aria-label="Minimize assistant demo"
                onClick={() => {
                  setOpenOverride(false);
                  launcher.current?.focus();
                }}
              >
                <Minus size={16} />
              </button>
            </div>
            <div className={styles.chatConversation}>
              {!sent ? (
                <div className={styles.chatWelcome}>
                  <BrandMark size={36} />
                  <span>What would you like to build?</span>
                </div>
              ) : (
                <motion.div
                  className={styles.chatMessage}
                  initial={{
                    opacity: 0,
                    y: reduced ? 0 : 24,
                    scale: reduced ? 1 : 0.97,
                  }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.35 }}
                >
                  {prompt}
                </motion.div>
              )}
              {working && (
                <motion.div
                  className={styles.chatTools}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className={styles.chatWorking}>
                    {complete ? (
                      <Check size={14} />
                    ) : (
                      <LoaderCircle size={14} className={styles.spinner} />
                    )}
                    <span>{complete ? "Plan ready" : "Working"}</span>
                    <ChevronDown size={13} />
                  </div>
                  {calls.map(
                    ([label, tool, start, finish]) =>
                      time >= start && (
                        <motion.details
                          key={tool}
                          className={styles.chatTool}
                          initial={{ opacity: 0, y: reduced ? 0 : 7 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          <summary>
                            <Workflow size={14} />
                            <span>{label}</span>
                            {time >= finish ? (
                              <Check size={14} />
                            ) : (
                              <LoaderCircle
                                size={14}
                                className={styles.spinner}
                              />
                            )}
                            <ChevronDown size={12} />
                          </summary>
                          <code>{tool}()</code>
                        </motion.details>
                      ),
                  )}
                </motion.div>
              )}
            </div>
            {complete ? (
              <button className={styles.chatBuild} onClick={onBuild}>
                <span>
                  Build this flowsheet <small>9 units · 9 streams</small>
                </span>
                <ArrowRight size={16} />
              </button>
            ) : (
              <div className={styles.chatComposer}>
                <div className={styles.chatField} aria-label="Example prompt">
                  <Paperclip size={16} aria-hidden="true" />
                  <span
                    aria-hidden="true"
                    className={sent ? styles.chatPlaceholder : undefined}
                  >
                    {sent
                      ? "Ask a follow-up…"
                      : typed || "Describe your process…"}
                    {!sent && time > 0.08 && (
                      <i className={styles.typingCaret} />
                    )}
                  </span>
                  <span className={styles.srOnly}>{prompt}</span>
                </div>
                <motion.button
                  className={styles.chatSend}
                  onClick={onSend}
                  disabled={sent}
                  aria-label="Send example prompt"
                  animate={{
                    scale: !reduced && time >= 0.49 && time < 0.53 ? 0.82 : 1,
                  }}
                >
                  {sent ? (
                    <span className={styles.stopSquare} />
                  ) : (
                    <ArrowUp size={19} />
                  )}
                </motion.button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        ref={launcher}
        className={styles.assistantPill}
        data-open={open}
        aria-label={open ? "Toggle assistant demo" : "Open assistant demo"}
        aria-expanded={open}
        aria-controls="landing-assistant"
        onClick={() => setOpenOverride(!open)}
      >
        <BrandMark size={20} />
        <span>{open ? "Assistant" : "Ask AI to build a process"}</span>
        <span className={styles.pillIndicator} />
      </button>
    </div>
  );
}

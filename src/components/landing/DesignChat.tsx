"use client";

import { useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  LoaderCircle,
  Paperclip,
  RotateCcw,
  Workflow,
} from "lucide-react";
import { motion, useMotionValueEvent, type MotionValue } from "motion/react";
import BrandMark from "@/components/BrandMark";
import styles from "./LandingPage.module.css";

const prompt = "Build a process with reaction, separation, and recycle.";
const calls = [
  ["Read the workspace", "get_project", 0.61, 0.74],
  ["Choose equipment", "get_capabilities", 0.75, 0.88],
  ["Create the flowsheet", "propose_actions", 0.89, 2],
] as const;

export default function DesignChat({
  design,
  reduced,
  onReplay,
  onSend,
}: {
  design: MotionValue<number>;
  reduced: boolean;
  onReplay: () => void;
  onSend: () => void;
}) {
  const [time, setTime] = useState(design.get());
  useMotionValueEvent(design, "change", setTime);
  const sent = time >= 0.53;
  const working = time >= 0.61;
  const typed = prompt.slice(
    0,
    Math.floor(Math.max(0, Math.min(1, (time - 0.08) / 0.37)) * prompt.length),
  );
  return (
    <div
      className={styles.designChat}
      data-design-chat
      data-phase={working ? "working" : sent ? "sent" : "typing"}
    >
      <div className={styles.chatHeader}>
        <BrandMark size={22} />
        <span>Assistant</span>
        <span className={styles.demoLabel}>Demo</span>
        <button
          onClick={onReplay}
          disabled={reduced}
          aria-label="Replay chat demo"
          title="Replay demo"
        >
          <RotateCcw size={15} />
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
              <LoaderCircle size={14} className={styles.spinner} />
              <span>Working</span>
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
                        <LoaderCircle size={14} className={styles.spinner} />
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
      <div className={styles.chatComposer}>
        <div className={styles.chatField} aria-label="Example prompt">
          <Paperclip size={16} aria-hidden="true" />
          <span
            aria-hidden="true"
            className={sent ? styles.chatPlaceholder : undefined}
          >
            {sent ? "Ask a follow-up…" : typed || "Describe your process…"}
            {!sent && time > 0.08 && <i className={styles.typingCaret} />}
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
    </div>
  );
}

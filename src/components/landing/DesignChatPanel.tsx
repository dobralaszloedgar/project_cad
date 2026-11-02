import {
  ArrowUp,
  Check,
  ChevronDown,
  Folder,
  MessageCircle,
  Minus,
  Paperclip,
  ShieldCheck,
} from "lucide-react";
import styles from "./DesignChat.module.css";

const prompt = "Build a process with reaction, separation, and recycle.";

/** Scripted connected-state illustration: no forms, provider discovery or tools. */
export default function DesignChatPanel({ time }: { time: number }) {
  const sent = time >= 0.64;
  const complete = time >= 1;
  const typed = prompt.slice(
    0,
    Math.floor(Math.max(0, Math.min(1, (time - 0.32) / 0.27)) * prompt.length),
  );
  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <span>
          <MessageCircle size={16} /> Assistant
        </span>
        <span className={styles.connected}>
          <i /> Connected
        </span>
        <Minus size={16} aria-hidden="true" />
      </header>
      <div className={styles.project}>
        <Folder size={14} /> Reaction &amp; recycle <span>Example</span>
      </div>
      <div className={styles.conversation}>
        {sent ? (
          <>
            <p className={styles.userMessage}>{prompt}</p>
            <div className={styles.response}>
              <span className={styles.author}>
                <MessageCircle size={14} /> Project CAD Assistant
              </span>
              <p>
                {complete
                  ? "Your layout is ready: reaction, separation, and a connected recycle loop."
                  : "Laying out the equipment and connecting the process…"}
              </p>
              <div className={styles.steps}>
                {[
                  "Read the worksheet",
                  "Place 9 equipment units",
                  "Connect 9 material streams",
                ].map((label, index) => (
                  <span key={label} data-done={time >= [0.78, 0.88, 1][index]}>
                    <Check size={13} />
                    {label}
                  </span>
                ))}
              </div>
              {complete && (
                <div className={styles.result} data-demo-result>
                  <Check size={15} />
                  <span>
                    Layout applied
                    <small>Ready to simulate and explore in 3D</small>
                  </span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className={styles.welcome}>
            <span>
              <MessageCircle size={25} strokeWidth={1.5} />
            </span>
            <h2>What would you like to design?</h2>
            <p>Describe your process. Start with a simple layout.</p>
          </div>
        )}
      </div>
      <div className={styles.composerArea}>
        <div className={styles.composer} aria-hidden="true">
          <Paperclip size={17} />
          <span data-placeholder={!typed || sent}>
            {sent ? "Message Assistant…" : typed || "Message Assistant…"}
          </span>
          <i>
            <ArrowUp size={17} />
          </i>
        </div>
        <div className={styles.controls}>
          <span>
            <MessageCircle size={12} /> Assistant <ChevronDown size={11} />
          </span>
          <span>
            <ShieldCheck size={13} /> Review changes
          </span>
        </div>
      </div>
    </div>
  );
}

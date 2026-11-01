"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Check, MessageCircle, Minus, X } from "lucide-react";
import { useAssistant } from "@/assistant/client";
import type { Project } from "@/domain/schema";
import type { Proposal } from "@/assistant/protocol";
import AssistantPanel from "../AssistantPanel";
import { useAssistantDock } from "./useAssistantDock";
import { useAssistantMorph } from "./useAssistantMorph";
import styles from "../AssistantPanel.module.css";

const hiddenKey = "project-cad.assistant-hidden.v1";
export default function FloatingAssistant({
  containerRef,
  controlsRef,
  open,
  onOpenChange: setOpen,
  projectId,
  project,
  folderName,
  appliedProposalIds,
  onApply,
  onError,
}: {
  containerRef: RefObject<HTMLElement | null>;
  controlsRef: RefObject<HTMLElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  project: Project;
  folderName: string | null;
  appliedProposalIds: string[];
  onApply: (proposal: Proposal) => Promise<string>;
  onError: (message: string) => void;
}) {
  const assistant = useAssistant(projectId, project);
  const [started, setStarted] = useState(false),
    [hidden, setHidden] = useState(false);
  const [read, setRead] = useState<string>(),
    [dismissedActivity, setDismissedActivity] = useState<string>();
  const [animated, setAnimated] = useState(false);
  const [requestedConversation, setRequestedConversation] = useState<{
    id: string;
  }>();
  const root = useRef<HTMLDivElement>(null),
    panel = useRef<HTMLElement>(null),
    button = useRef<HTMLButtonElement>(null);
  const initialActivity = useRef(false);
  const surface = useRef<HTMLDivElement>(null),
    control = useRef<HTMLDivElement>(null),
    activity = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    if (panel.current?.contains(document.activeElement))
      button.current?.focus({ preventScroll: true });
    setOpen(false);
  }, [setOpen]);
  const hide = useCallback(() => {
    setOpen(false);
    setHidden(true);
    try {
      localStorage.setItem(hiddenKey, "true");
    } catch {
      /* Storage is optional. */
    }
  }, [setOpen]);
  const dock = useAssistantDock(containerRef, close, hide);
  useEffect(() => {
    if (!dock.ready) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setAnimated(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [dock.ready]);
  const run = assistant.activity?.run ?? assistant.conversation?.runs.at(-1);
  const working = assistant.sending || run?.status === "running";
  const unread =
    !!run && !!run.text && run.status !== "running" && read !== run.id && !open;
  const showActivity =
    !open &&
    !dock.dragging &&
    !!run &&
    (working || unread) &&
    dismissedActivity !== run.id;
  const activityWidth = Math.min(
    340,
    Math.max(44, dock.bounds.right - dock.bounds.left - 40),
  );
  const activityLeft = dock.corner.endsWith("left")
    ? dock.point.x
    : dock.point.x + 44 - activityWidth;
  const anchor = {
    transform: `translate3d(${dock.point.x}px,${dock.point.y}px,0)`,
  };
  useAssistantMorph({
    surface,
    content: panel,
    control,
    activity,
    point: dock.point,
    panel: dock.panel,
    corner: dock.corner,
    mode: open ? "panel" : showActivity ? "activity" : "bubble",
    activityWidth,
    ready: dock.ready,
    immediate: dock.dragging,
  });
  const step =
    run?.activities.find((item) => item.status === "running") ??
    run?.activities.at(-1);
  const title = working
    ? step?.name.replaceAll("_", " ") || "Thinking…"
    : run?.status === "completed"
      ? "Reply ready"
      : run?.status === "cancelled"
        ? "Stopped"
        : "Needs attention";
  const completed =
    run?.activities.filter((item) => item.status === "done").length ?? 0;
  const progress = working
    ? run?.activities.length
      ? completed / run.activities.length
      : 0
    : 1;
  useEffect(() => {
    try {
      if (localStorage.getItem(hiddenKey) === "true")
        queueMicrotask(() => setHidden(true));
    } catch {
      /* Storage is optional. */
    }
  }, []);
  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setStarted(true);
        setHidden(false);
      });
      try {
        localStorage.removeItem(hiddenKey);
      } catch {
        /* Storage is optional. */
      }
    }
  }, [open]);
  useEffect(() => {
    if (!run) return;
    if (
      !initialActivity.current ||
      (open && assistant.selectedId === assistant.activity?.conversationId)
    ) {
      initialActivity.current = true;
      if (!working) queueMicrotask(() => setRead(run.id));
    }
  }, [
    run,
    open,
    working,
    assistant.selectedId,
    assistant.activity?.conversationId,
  ]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target) &&
        !controlsRef.current?.contains(event.target)
      )
        close();
    };
    const key = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !root.current?.querySelector("[data-assistant-popover]") &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        close();
      }
    };
    const frame = requestAnimationFrame(() => {
      if (!assistant.connected) {
        const target =
          panel.current?.querySelector<HTMLElement>("[data-connect-primary]") ??
          panel.current?.querySelector<HTMLElement>(
            "[data-assistant-setup-heading]",
          );
        target?.focus({ preventScroll: true });
      }
    });
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open, close, assistant.connected, controlsRef]);
  function show() {
    setStarted(true);
    setOpen(true);
    if (run) setRead(run.id);
  }
  function openActivity() {
    if (assistant.activity)
      setRequestedConversation({ id: assistant.activity.conversationId });
    show();
  }
  return (
    <div
      ref={root}
      className={styles.root}
      data-ready={dock.ready || undefined}
      data-animated={animated || undefined}
      data-hidden={hidden || undefined}
      data-dragging={dock.dragging || undefined}
      data-mode={open ? "panel" : showActivity ? "activity" : "bubble"}
      data-corner={dock.corner}
    >
      <div className={styles.dockAnchor} style={anchor}>
        <div
          ref={surface}
          aria-hidden
          className={styles.material}
          style={{ width: dock.panel.width, height: dock.panel.height }}
        />
      </div>
      <section
        ref={panel}
        className={`assistant-drawer ${styles.drawer}`}
        style={
          {
            ...dock.panel,
            "--assistant-panel-height": `${dock.panel.height}px`,
          } as React.CSSProperties
        }
        data-open={open || undefined}
        role="dialog"
        aria-modal="false"
        aria-labelledby="assistant-title"
        aria-hidden={!open}
        inert={!open}
      >
        {started || open ? (
          <AssistantPanel
            assistant={assistant}
            project={project}
            folderName={folderName}
            appliedProposalIds={appliedProposalIds}
            onApply={onApply}
            onError={onError}
            open={open}
            requestedConversation={requestedConversation}
          />
        ) : null}
      </section>
      {showActivity ? (
        <div
          ref={activity}
          className={styles.activity}
          style={{
            left: activityLeft,
            top: dock.point.y,
            width: activityWidth,
          }}
          data-left={dock.corner.endsWith("left") || undefined}
        >
          <button
            className={styles.activityText}
            aria-label="Open assistant activity"
            onClick={openActivity}
          >
            <strong>{title}</strong>
            <small>
              {working
                ? `${completed} tool${completed === 1 ? "" : "s"} completed`
                : "Open conversation"}
            </small>
          </button>
          {!working ? (
            <button
              className={styles.dismissActivity}
              aria-label="Dismiss assistant activity"
              onClick={() => setDismissedActivity(run!.id)}
            >
              <X size={12} />
            </button>
          ) : null}
        </div>
      ) : null}
      <div
        className={`${styles.dockAnchor} ${styles.buttonAnchor}`}
        style={anchor}
      >
        <div ref={control} className={styles.morphControl}>
          <button
            ref={button}
            className={`assistant-toggle ${styles.bubble}`}
            {...dock.handlers}
            aria-label={open ? "Close assistant panel" : "Open assistant"}
            aria-expanded={open}
            title={
              open
                ? "Minimize assistant · drag to move"
                : "Open assistant · drag or use arrow keys to dock"
            }
            onClick={() => {
              if (!dock.suppressClick()) {
                if (open) close();
                else if (showActivity) openActivity();
                else show();
              }
            }}
          >
            {open ? (
              <Minus size={18} strokeWidth={1.8} />
            ) : working ? (
              <span className={styles.workingDots}>
                <i />
                <i />
                <i />
              </span>
            ) : unread && run?.status === "completed" ? (
              <Check size={19} strokeWidth={2} />
            ) : (
              <MessageCircle size={18} strokeWidth={1.9} />
            )}
            {!open && (working || unread) ? (
              <svg className={styles.progress} viewBox="0 0 48 48" aria-hidden>
                <rect
                  x="1"
                  y="1"
                  width="46"
                  height="46"
                  rx="16"
                  pathLength="100"
                  style={{
                    strokeDasharray: working ? "18 82" : "100",
                    strokeDashoffset: working
                      ? undefined
                      : 100 - progress * 100,
                  }}
                  data-working={working || undefined}
                />
              </svg>
            ) : null}
            {unread ? <span className={styles.unread} /> : null}
          </button>
        </div>
      </div>
      {dock.dragging ? (
        <div
          className={styles.hideTarget}
          data-active={dock.overHide || undefined}
          style={{ left: dock.hidePoint.x, top: dock.hidePoint.y }}
        >
          <span>Hide chat</span>
          <X size={24} />
        </div>
      ) : null}
    </div>
  );
}

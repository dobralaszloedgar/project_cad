"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { NodeToolbar, useStore } from "@xyflow/react";
import { ArrowUpRight, CircleAlert, CircleCheck, X } from "lucide-react";
import {
  equipmentStatusLabels,
  type EquipmentStatus,
  type EquipmentTarget,
} from "@/domain/equipment-status";
import type { Unit } from "@/domain/schema";
import "./equipment-status.css";

export function EquipmentStatusIndicator({
  unit,
  status,
  nodeRef,
  x,
  anchorTop,
  anchorBottom,
  onNavigate,
}: {
  unit: Unit;
  status: EquipmentStatus;
  nodeRef: RefObject<HTMLDivElement | null>;
  x: number;
  anchorTop: number;
  anchorBottom: number;
  onNavigate: (id: string, target: EquipmentTarget) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const popupId = useId();
  const transform = useStore((state) => state.transform);
  const canvasWidth = useStore((state) => state.width);
  const canvasHeight = useStore((state) => state.height);
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const open = !dismissed && (hovered || focused || pinned);
  const cancel = useCallback(() => {
    clearTimeout(enterTimer.current);
    clearTimeout(leaveTimer.current);
  }, []);
  const dismiss = useCallback(() => {
    cancel();
    setHovered(false);
    setFocused(false);
    setPinned(false);
    setDismissed(true);
  }, [cancel]);
  const leave = useCallback(() => {
    cancel();
    leaveTimer.current = setTimeout(() => setHovered(false), 180);
  }, [cancel]);
  const enter = useCallback(() => {
    cancel();
    enterTimer.current = setTimeout(() => {
      setDismissed(false);
      setHovered(true);
    }, 350);
  }, [cancel]);
  useEffect(() => {
    const node = nodeRef.current;
    node?.addEventListener("mouseenter", enter);
    node?.addEventListener("mouseleave", leave);
    return () => {
      cancel();
      node?.removeEventListener("mouseenter", enter);
      node?.removeEventListener("mouseleave", leave);
    };
  }, [nodeRef, cancel, leave, enter]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof globalThis.Node &&
        !nodeRef.current?.contains(event.target) &&
        !content.current?.contains(event.target)
      )
        dismiss();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector("dialog[open]"))
        return;
      event.preventDefault();
      event.stopPropagation();
      if (content.current?.contains(document.activeElement))
        trigger.current?.focus();
      dismiss();
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", escape, true);
    };
  }, [open, nodeRef, dismiss]);
  useLayoutEffect(() => {
    if (!open || !content.current) return;
    const measure = () =>
      setMeasuredHeight(content.current?.getBoundingClientRect().height ?? 0);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content.current);
    return () => observer.disconnect();
  }, [open]);
  const completed = status.state === "calculated" || status.state === "warning";
  const ready = status.state === "ready" || status.state === "stale";
  const defaultTarget: EquipmentTarget = {
    section: completed ? "results" : "settings",
  };
  const navigate = (target: EquipmentTarget) => {
    dismiss();
    onNavigate(unit.id, target);
  };
  const width = Math.min(320, Math.max(0, canvasWidth - 24));
  const [panX, panY, zoom] = transform;
  const left = Math.max(
    12,
    Math.min((x + 64) * zoom + panX - width / 2, canvasWidth - width - 12),
  );
  const below = anchorBottom * zoom + panY + 6;
  const above = anchorTop * zoom + panY - measuredHeight - 6;
  const top = Math.max(
    72,
    Math.min(
      below + measuredHeight <= canvasHeight - 12 ? below : above,
      canvasHeight - measuredHeight - 12,
    ),
  );
  const Icon = completed || ready ? CircleCheck : CircleAlert;
  return (
    <>
      <button
        type="button"
        ref={trigger}
        className={`equipment-status-dot nodrag nopan ${status.state}`}
        aria-label={`${unit.id}: ${equipmentStatusLabels[status.state]}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        onMouseEnter={enter}
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onFocus={() => {
          cancel();
          setDismissed(false);
          setFocused(true);
        }}
        onBlur={(event) => {
          if (!content.current?.contains(event.relatedTarget))
            setFocused(false);
        }}
        onClick={(event) => {
          event.stopPropagation();
          navigate(status.issues[0]?.target ?? defaultTarget);
        }}
      />
      {open && (
        <NodeToolbar
          isVisible
          className="equipment-status-toolbar nodrag nopan nowheel"
          style={{
            transform: `translate(${left}px, ${top}px)`,
            width,
            zIndex: 1002,
            transition: "none",
          }}
        >
          <div
            id={popupId}
            ref={content}
            role="dialog"
            aria-label={`${unit.id} equipment status`}
            className={`equipment-status-popover ${status.state}`}
            style={{ maxHeight: Math.max(0, canvasHeight - 84) }}
            onMouseEnter={cancel}
            onMouseLeave={leave}
            onFocusCapture={() => setFocused(true)}
            onBlurCapture={(event) => {
              if (
                !event.currentTarget.contains(event.relatedTarget) &&
                event.relatedTarget !== trigger.current
              )
                setFocused(false);
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              setPinned(true);
            }}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <div className="equipment-status-heading">
              <Icon size={16} aria-hidden="true" />
              <div>
                <strong>{equipmentStatusLabels[status.state]}</strong>
                <span>
                  {unit.id} · {unit.name}
                </span>
              </div>
              <button
                type="button"
                className="equipment-status-close"
                aria-label={`Dismiss ${unit.id} status`}
                onClick={() => {
                  trigger.current?.focus();
                  dismiss();
                }}
              >
                <X size={15} />
              </button>
            </div>
            <div className="equipment-status-body">
              {ready && (
                <p>
                  {status.state === "stale"
                    ? "Inputs have changed since the last simulation. Run again to update results."
                    : "Required inputs are complete. Run a simulation to calculate results."}
                </p>
              )}
              {completed && (
                <p>
                  {status.state === "warning"
                    ? "Review the calculation warnings below."
                    : "Results are up to date."}
                </p>
              )}
              {status.issues.length > 0 && (
                <>
                  <p className="equipment-status-hint">
                    Select an item to go to its source.
                  </p>
                  <ul className="equipment-issue-list">
                    {status.issues.map((issue, index) => (
                      <li key={`${issue.message}-${index}`}>
                        <button
                          type="button"
                          onClick={() => navigate(issue.target)}
                        >
                          <span>{issue.message}</span>
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <button
              type="button"
              className="equipment-status-open"
              onClick={() => navigate(defaultTarget)}
            >
              {completed ? "View results" : "Open setup"}
              <ArrowUpRight size={14} aria-hidden="true" />
            </button>
          </div>
        </NodeToolbar>
      )}
    </>
  );
}

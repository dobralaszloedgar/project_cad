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
  position,
  onNavigate,
}: {
  unit: Unit;
  status: EquipmentStatus;
  nodeRef: RefObject<HTMLDivElement | null>;
  position: { x: number; y: number };
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
  const [placement, setPlacement] = useState({
    left: 0,
    top: 0,
    width: 280,
    maxHeight: 0,
    visible: false,
  });
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
  const leave = useCallback(
    (event: { relatedTarget: EventTarget | null }) => {
      cancel();
      const next = event.relatedTarget;
      // NodeToolbar renders outside the equipment's DOM subtree. Moving into
      // the card must not count as leaving the shared hover region.
      if (
        next instanceof globalThis.Node &&
        (nodeRef.current?.contains(next) || content.current?.contains(next))
      )
        return;
      leaveTimer.current = setTimeout(() => {
        // Native node events and React portal events can arrive in either order.
        // Confirm the pointer has left both surfaces before hiding the card.
        if (
          !nodeRef.current?.matches(":hover") &&
          !content.current?.matches(":hover")
        )
          setHovered(false);
      }, 180);
    },
    [cancel, nodeRef],
  );
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
    const popup = content.current;
    const node = nodeRef.current;
    const canvas = node?.closest(".react-flow");
    const frame = node?.querySelector(".equipment-selection-frame");
    const label = node?.querySelector(".unit-label");
    if (!open || !popup || !canvas || !frame || !label) return;
    const measure = () => {
      const canvasBounds = canvas.getBoundingClientRect();
      const frameBounds = frame.getBoundingClientRect();
      const labelBounds = label.getBoundingClientRect();
      const anchor = {
        left: Math.min(frameBounds.left, labelBounds.left) - canvasBounds.left,
        right:
          Math.max(frameBounds.right, labelBounds.right) - canvasBounds.left,
        top: Math.min(frameBounds.top, labelBounds.top) - canvasBounds.top,
        bottom:
          Math.max(frameBounds.bottom, labelBounds.bottom) - canvasBounds.top,
      };
      const gap = 10;
      const viewport = {
        left: 12,
        right: canvasBounds.width - 12,
        top: 72,
        bottom: canvasBounds.height - 12,
      };
      const width = Math.min(280, Math.max(0, viewport.right - viewport.left));
      const maxHeight = Math.max(0, viewport.bottom - viewport.top);
      const headingHeight = popup
        .querySelector(".equipment-status-heading")!
        .getBoundingClientRect().height;
      const footerHeight = popup
        .querySelector(".equipment-status-open")!
        .getBoundingClientRect().height;
      const minHeight = headingHeight + footerHeight + 2;
      const height = Math.min(
        maxHeight,
        minHeight +
          (popup.querySelector(".equipment-status-body")?.scrollHeight ?? 0),
      );
      const clamp = (value: number, min: number, max: number) =>
        Math.max(min, Math.min(value, max));
      const centeredLeft = clamp(
        (anchor.left + anchor.right - width) / 2,
        viewport.left,
        viewport.right - width,
      );
      const sideTop = clamp(anchor.top, viewport.top, viewport.bottom - height);
      // Clamp only along the edge of the equipment. Clamping toward it can
      // put the card back over the selection when neither vertical side fits.
      const candidates = [
        {
          left: centeredLeft,
          top: Math.max(viewport.top, anchor.bottom + gap),
          width,
          maxHeight:
            viewport.bottom - Math.max(viewport.top, anchor.bottom + gap),
        },
        {
          left: centeredLeft,
          top: viewport.top,
          width,
          maxHeight: Math.min(viewport.bottom, anchor.top - gap) - viewport.top,
        },
        {
          left: Math.max(viewport.left, anchor.right + gap),
          top: sideTop,
          width: Math.min(
            width,
            viewport.right - Math.max(viewport.left, anchor.right + gap),
          ),
          maxHeight,
        },
        {
          left: viewport.left,
          top: sideTop,
          width: Math.min(
            width,
            Math.min(viewport.right, anchor.left - gap) - viewport.left,
          ),
          maxHeight,
        },
      ];
      const candidate =
        candidates.find(
          (item) => item.width >= width && item.maxHeight >= height,
        ) ??
        candidates.find(
          (item) =>
            item.width >= Math.min(width, 200) &&
            item.maxHeight >= minHeight + 24,
        );
      if (candidate === candidates[1])
        candidate.top =
          Math.min(viewport.bottom, anchor.top - gap) -
          Math.min(height, candidate.maxHeight);
      if (candidate === candidates[3])
        candidate.left =
          Math.min(viewport.right, anchor.left - gap) - candidate.width;
      const next = candidate
        ? { ...candidate, visible: true }
        : {
            left: viewport.left,
            top: viewport.top,
            width,
            maxHeight,
            visible: false,
          };
      // If zoom leaves no readable space outside the equipment, keep the
      // automatic card hidden; its status button still opens setup directly.
      setPlacement((previous) =>
        previous.left === next.left &&
        previous.top === next.top &&
        previous.width === next.width &&
        previous.maxHeight === next.maxHeight &&
        previous.visible === next.visible
          ? previous
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(popup);
    observer.observe(frame);
    observer.observe(label);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [open, nodeRef, position, transform, canvasWidth, canvasHeight, status]);
  const completed = status.state === "calculated" || status.state === "warning";
  const ready = status.state === "ready" || status.state === "stale";
  const defaultTarget: EquipmentTarget = {
    section: completed ? "results" : "settings",
  };
  const navigate = (target: EquipmentTarget) => {
    dismiss();
    onNavigate(unit.id, target);
  };
  const Icon = completed || ready ? CircleCheck : CircleAlert;
  return (
    <>
      <button
        type="button"
        ref={trigger}
        className={`equipment-status-dot nodrag nopan ${status.state}`}
        aria-label={`${unit.id}: ${equipmentStatusLabels[status.state]}`}
        aria-haspopup="dialog"
        aria-expanded={open && placement.visible}
        aria-controls={open && placement.visible ? popupId : undefined}
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
            transform: `translate(${placement.left}px, ${placement.top}px)`,
            width: placement.width,
            visibility: placement.visible ? "visible" : "hidden",
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
            style={{ maxHeight: placement.maxHeight }}
            onMouseEnter={() => {
              cancel();
              setHovered(true);
            }}
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
                <span>{unit.id}</span>
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
            {status.issues.length > 0 && (
              <div className="equipment-status-body">
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
              </div>
            )}
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

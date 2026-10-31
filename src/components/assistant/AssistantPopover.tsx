"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import styles from "../AssistantPanel.module.css";

export default function AssistantPopover({
  label,
  trigger,
  children,
  align = "left",
  disabled = false,
  compact = false,
}: {
  label: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }
    };
    const panel = root.current?.querySelector<HTMLElement>("[role=dialog]");
    panel?.focus();
    document.addEventListener("pointerdown", outside);
    root.current?.addEventListener("keydown", key);
    const element = root.current;
    return () => {
      document.removeEventListener("pointerdown", outside);
      element?.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div ref={root} className={styles.popoverAnchor}>
      <button
        ref={button}
        type="button"
        className={styles.control}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open && !disabled ? (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          data-assistant-popover
          data-align={align}
          data-compact={compact || undefined}
          className={styles.popover}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

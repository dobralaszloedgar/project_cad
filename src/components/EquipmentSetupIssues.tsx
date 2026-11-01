"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, CircleAlert, X } from "lucide-react";
import type {
  EquipmentIssue,
  EquipmentTarget,
} from "@/domain/equipment-status";

export default function EquipmentSetupIssues({
  issues,
  onNavigate,
}: {
  issues: EquipmentIssue[];
  onNavigate: (target: EquipmentTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();
  const cancel = () => clearTimeout(timer.current);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  if (!issues.length) return null;
  const invalid = issues.some((issue) => issue.kind === "error");
  return (
    <div
      className={`equipment-completion${invalid ? " invalid" : ""}`}
      ref={root}
      onMouseEnter={() => {
        cancel();
        timer.current = setTimeout(() => setOpen(true), 180);
      }}
      onMouseLeave={() => {
        cancel();
        timer.current = setTimeout(() => {
          if (!root.current?.contains(document.activeElement)) setOpen(false);
        }, 150);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          cancel();
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          cancel();
          trigger.current?.focus();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="equipment-completion-link"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="dialog"
        onFocus={() => {
          cancel();
          setOpen(true);
        }}
        onClick={() => {
          cancel();
          setOpen(true);
        }}
      >
        <CircleAlert size={15} aria-hidden="true" />
        <span aria-live="polite">
          {issues.length} {issues.length === 1 ? "item" : "items"} to complete
        </span>
      </button>
      {open && (
        <div
          id={id}
          className={`setup-issues-popover equipment-status-popover ${invalid ? "invalid" : "unresolved"}`}
          role="dialog"
          aria-label="Items to complete in Setup"
        >
          <div className="equipment-status-heading">
            <CircleAlert size={16} aria-hidden="true" />
            <div>
              <strong>
                {invalid ? "Review equipment errors" : "Complete setup"}
              </strong>
              <span>Select a field to edit.</span>
            </div>
            <button
              type="button"
              className="equipment-status-close"
              aria-label="Close setup checklist"
              onClick={() => {
                cancel();
                trigger.current?.focus();
                setOpen(false);
              }}
            >
              <X size={15} />
            </button>
          </div>
          <div className="equipment-status-body">
            <ul className="equipment-issue-list">
              {issues.map((issue, index) => (
                <li key={`${issue.message}-${index}`}>
                  <button
                    type="button"
                    onClick={() => {
                      cancel();
                      setOpen(false);
                      onNavigate(issue.target);
                    }}
                  >
                    <span>{issue.message}</span>
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

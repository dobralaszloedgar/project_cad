"use client";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { isCloseKey } from "@/lib/keyboard";
export default function Dialog({
  title,
  onClose,
  children,
  className = "",
  initialFocusRef,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    initialFocusRef?.current?.focus();
    return () => dialog?.close();
  }, [initialFocusRef]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const dialog = ref.current;
      if (
        event.defaultPrevented ||
        event.isComposing ||
        !dialog?.open ||
        Array.from(document.querySelectorAll("dialog[open]")).at(-1) !== dialog
      )
        return;
      // Applying a form can replace its focused input. Keep dialog commands
      // available even while the browser moves focus back to the document.
      if (isCloseKey(event)) {
        event.preventDefault();
        onClose();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        (event.key.toLowerCase() === "s" ||
          (event.shiftKey && event.key === "Enter"))
      ) {
        event.preventDefault();
        const calculate =
          event.shiftKey && event.key === "Enter"
            ? dialog.querySelector<HTMLButtonElement>(
                '[data-editor-action="calculate"]',
              )
            : null;
        dialog.querySelector("form")?.requestSubmit(calculate ?? undefined);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <dialog
      ref={ref}
      className={`workspace-dialog ${className}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-surface">
        <header className="dialog-header">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
      </div>
    </dialog>
  );
}

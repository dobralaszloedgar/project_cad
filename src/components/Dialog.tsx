"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { isCloseKey } from "@/lib/keyboard";
export default function Dialog({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
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
        dialog.querySelector("form")?.requestSubmit();
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
      onCancel={onClose}
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

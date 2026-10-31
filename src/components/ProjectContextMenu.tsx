"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { isCloseKey } from "@/lib/keyboard";

export interface ProjectMenuAction {
  label: string;
  icon: ReactNode;
  run: () => void;
  disabled?: boolean;
  divider?: boolean;
}

export default function ProjectContextMenu({
  x,
  y,
  label,
  trigger,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  label: string;
  trigger: HTMLElement;
  actions: ProjectMenuAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const menu = ref.current!;
    menu.style.left = `${Math.max(8, Math.min(x, document.documentElement.clientWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8))}px`;
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);
  useEffect(() => {
    const dismiss = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className="project-context-menu"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
        );
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    buttons.length) %
                  buttons.length;
          buttons[next]?.focus();
        }
        if (isCloseKey(event.nativeEvent) || event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          trigger.focus();
        }
      }}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          role="menuitem"
          tabIndex={-1}
          disabled={action.disabled}
          className={action.divider ? "menu-divider" : undefined}
          onClick={() => {
            onClose();
            trigger.focus();
            action.run();
          }}
        >
          {action.icon}
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}

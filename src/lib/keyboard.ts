// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

export function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="searchbox"], [role="slider"], [role="spinbutton"]',
    )
  );
}

export function isSelectPickerOpen(event: { target: EventTarget | null }) {
  return (
    event.target instanceof Element &&
    CSS.supports("selector(select:open)") &&
    !!event.target.closest("select:open")
  );
}

export function isCloseKey(event: KeyboardEvent) {
  return (
    (event.key === "Escape" && !isSelectPickerOpen(event)) ||
    (!event.altKey &&
      !event.shiftKey &&
      ((event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "q") ||
        (event.metaKey && !event.ctrlKey && event.key.toLowerCase() === "w")))
  );
}

export function shortcutsBlocked(event: KeyboardEvent) {
  return (
    event.defaultPrevented ||
    event.isComposing ||
    isTypingTarget(event.target) ||
    !!document.querySelector("dialog[open]")
  );
}

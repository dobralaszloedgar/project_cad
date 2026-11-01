import type { EquipmentTarget } from "@/domain/equipment-status";

/** Navigation only: reveal and focus without applying a draft. */
export function revealEquipmentIssue(
  root: HTMLElement,
  target: EquipmentTarget,
) {
  if (target.reactionId)
    root
      .querySelector<HTMLButtonElement>(
        `[data-setup-reaction="${CSS.escape(target.reactionId)}"]`,
      )
      ?.click();
  const frame = requestAnimationFrame(() => {
    const section =
      root.querySelector<HTMLElement>(
        `[data-setup-section="${target.section}"]`,
      ) ?? root;
    const destination =
      (target.port
        ? root.querySelector<HTMLElement>(
            `[data-setup-port="${CSS.escape(target.port)}"]`,
          )
        : null) ??
      (target.field
        ? root.querySelector<HTMLElement>(
            `[data-setup-field="${CSS.escape(target.field)}"]`,
          )
        : null) ??
      (target.reactionId
        ? root.querySelector<HTMLElement>(
            `[data-setup-reaction-editor="${CSS.escape(target.reactionId)}"]`,
          )
        : null) ??
      section;
    for (
      let parent: HTMLElement | null = destination;
      parent && parent !== root;
      parent = parent.parentElement
    )
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    const control = destination.matches("input, select, textarea, button")
      ? destination
      : destination.querySelector<HTMLElement>(
          "input:not(:disabled):not([readonly]), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)",
        );
    const focus = control ?? destination;
    const hadTabIndex = focus.hasAttribute("tabindex");
    if (!control && !hadTabIndex) {
      focus.tabIndex = -1;
      restoreTabIndex = () => focus.removeAttribute("tabindex");
    }
    destination.scrollIntoView({ block: "center", behavior: "instant" });
    focus.focus({ preventScroll: true });
  });
  let restoreTabIndex = () => {};
  return () => {
    cancelAnimationFrame(frame);
    restoreTabIndex();
  };
}

import Dialog from "./Dialog";

export default function KeyboardHelp({ onClose }: { onClose: () => void }) {
  const groups = [
    [
      "Edit",
      [
        ["Add equipment", "A / /"],
        ["Edit selection", "E / F2"],
        ["Select all", "Ctrl / ⌘ + A"],
        ["Copy / cut / paste", "Ctrl / ⌘ + C / X / V"],
        ["Duplicate", "Ctrl / ⌘ + D"],
        ["Delete selection", "Delete / Backspace"],
        ["Undo", "Ctrl / ⌘ + Z"],
        ["Redo", "Ctrl / ⌘ + Shift + Z / Ctrl + Y"],
      ],
    ],
    [
      "Navigate",
      [
        ["Select / pan tool", "V / P"],
        ["Temporarily pan", "Space + drag"],
        ["Fit flowsheet / selection", "F / Shift + F"],
        ["Pan / pan faster", "Arrows / Shift + Arrows"],
        ["Zoom in / out", "+ / −"],
        ["Arrange", "Shift + A"],
        ["Toggle grid / labels", "G / L"],
        ["Full screen", "F11 / Ctrl + ⌘ + F"],
      ],
    ],
    [
      "Workspace",
      [
        ["Save / apply editor changes", "Ctrl / ⌘ + S"],
        ["Run simulation", "Ctrl / ⌘ + Enter"],
        ["Apply and calculate in editor", "Ctrl / ⌘ + Shift + Enter"],
        ["Toggle results", "R"],
        ["Keyboard shortcuts", "H / ?"],
        ["Close panel / clear selection", "Esc / Ctrl + Q / ⌘ + W"],
      ],
    ],
  ] as const;
  return (
    <Dialog
      title="Keyboard shortcuts"
      className="keyboard-help-dialog"
      onClose={onClose}
    >
      <div className="shortcut-groups">
        {groups.map(([title, shortcuts]) => (
          <section key={title}>
            <h3>{title}</h3>
            <dl>
              {shortcuts.map(([label, keys]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <kbd>{keys}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="shortcut-note">
        Use Ctrl on Windows and Linux, or ⌘ on Mac. Canvas shortcuts pause while
        typing. Shift-click or Ctrl/⌘-click to select several objects.
      </p>
    </Dialog>
  );
}

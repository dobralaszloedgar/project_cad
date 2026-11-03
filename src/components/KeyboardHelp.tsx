// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import { useState, useSyncExternalStore } from "react";
import { Search } from "lucide-react";
import Dialog from "./Dialog";

type Platform = "mac" | "windows" | "linux";
type Shortcut = { label: string; keys: string[][] };

function getPlatform(): Platform {
  const browser = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform = browser.userAgentData?.platform || browser.platform;
  if (/mac|iphone|ipad|ipod/i.test(platform)) return "mac";
  if (/linux/i.test(platform)) return "linux";
  return "windows";
}

const subscribe = () => () => {};
const getServerPlatform = (): Platform => "windows";

function keyLabel(key: string, mac: boolean) {
  if (key === "Ctrl") return "Control";
  if (key === "Enter" && mac) return "Return";
  if (key === "Backspace" && mac) return "Delete (Backspace)";
  if (key === "Delete" && mac) return "Forward Delete";
  if (key === "Arrows") return "Arrow keys";
  if (key === "+") return "Plus";
  if (key === "−") return "Minus";
  if (key === "/") return "Slash";
  if (key === "?") return "Question mark";
  if (key === "click") return "Left mouse click";
  if (key === "drag") return "Left mouse drag";
  return key;
}

function keySymbol(key: string, mac: boolean) {
  const symbols: Record<string, string> = {
    Escape: "Esc",
    Arrows: "↑ ↓ ← →",
    ...(mac
      ? {
          Command: "⌘",
          Ctrl: "⌃",
          Shift: "⇧",
          Enter: "↩",
          Backspace: "⌫",
          Delete: "⌦",
        }
      : {}),
  };
  return symbols[key] ?? key;
}

function KeyCombination({ keys, mac }: { keys: string[]; mac: boolean }) {
  const label = keys.map((key) => keyLabel(key, mac)).join(" + ");
  return (
    <span
      className="shortcut-combination"
      role="img"
      aria-label={label}
      title={label}
    >
      {keys.map((key, index) => (
        <span
          className="shortcut-key-part"
          key={`${key}-${index}`}
          aria-hidden="true"
        >
          {index > 0 && <span className="shortcut-plus">+</span>}
          {key === "click" || key === "drag" ? (
            <span className="shortcut-gesture">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path
                  d="M12 2a7 7 0 0 0-7 7v1h7Z"
                  fill="currentColor"
                  fillOpacity="0.25"
                  stroke="none"
                />
                <rect x="5" y="2" width="14" height="20" rx="7" />
                <path d="M12 2v8M5 10h14" />
              </svg>
              {key === "click" ? "Click" : "Drag"}
            </span>
          ) : (
            <kbd
              className={
                mac &&
                [
                  "Command",
                  "Ctrl",
                  "Shift",
                  "Enter",
                  "Backspace",
                  "Delete",
                ].includes(key)
                  ? "shortcut-symbol"
                  : undefined
              }
            >
              {keySymbol(key, mac)}
            </kbd>
          )}
        </span>
      ))}
    </span>
  );
}

export default function KeyboardHelp({ onClose }: { onClose: () => void }) {
  const platform = useSyncExternalStore(
    subscribe,
    getPlatform,
    getServerPlatform,
  );
  const [query, setQuery] = useState("");
  const mac = platform === "mac";
  const modifier = mac ? "Command" : "Ctrl";
  const groups: { title: string; column: number; shortcuts: Shortcut[] }[] = [
    {
      title: "Build & edit",
      column: 0,
      shortcuts: [
        { label: "Add equipment", keys: [["A"], ["/"]] },
        { label: "Edit selection", keys: [["E"], ["F2"]] },
        { label: "Select all", keys: [[modifier, "A"]] },
        {
          label: "Add to selection",
          keys: [
            ["Shift", "click"],
            [modifier, "click"],
          ],
        },
        { label: "Copy selection", keys: [[modifier, "C"]] },
        { label: "Cut selection", keys: [[modifier, "X"]] },
        { label: "Paste", keys: [[modifier, "V"]] },
        { label: "Duplicate", keys: [[modifier, "D"]] },
        {
          label: "Delete selection",
          keys: mac ? [["Backspace"], ["Delete"]] : [["Delete"], ["Backspace"]],
        },
        { label: "Undo", keys: [[modifier, "Z"]] },
        {
          label: "Redo",
          keys: [
            [modifier, "Shift", "Z"],
            [modifier, "Y"],
          ],
        },
      ],
    },
    {
      title: "Canvas navigation",
      column: 1,
      shortcuts: [
        { label: "Selection tool", keys: [["V"]] },
        { label: "Pan tool", keys: [["P"]] },
        { label: "Temporarily pan", keys: [["Space", "drag"]] },
        { label: "Fit flowsheet", keys: [["F"]] },
        { label: "Fit selection", keys: [["Shift", "F"]] },
        { label: "Pan canvas", keys: [["Arrows"]] },
        { label: "Pan faster", keys: [["Shift", "Arrows"]] },
        { label: "Zoom in", keys: [["+"], ["="]] },
        { label: "Zoom out", keys: [["−"]] },
        { label: "Arrange flowsheet", keys: [["Shift", "A"]] },
        { label: "Toggle grid", keys: [["G"]] },
        { label: "Toggle labels", keys: [["L"]] },
        {
          label: "Full screen",
          keys: mac ? [["Ctrl", "Command", "F"], ["F11"]] : [["F11"]],
        },
        { label: "Exit full screen (hold for 2 seconds)", keys: [["Escape"]] },
      ],
    },
    {
      title: "Simulation & results",
      column: 0,
      shortcuts: [
        { label: "Save / apply editor changes", keys: [[modifier, "S"]] },
        { label: "Run simulation", keys: [[modifier, "Enter"]] },
        {
          label: "Apply and calculate in editor",
          keys: [[modifier, "Shift", "Enter"]],
        },
        { label: "Toggle results", keys: [["R"]] },
      ],
    },
    {
      title: "Menus & help",
      column: 1,
      shortcuts: [
        { label: "Keyboard shortcuts", keys: [["H"], ["?"]] },
        {
          label: "Close panel / clear selection",
          keys: [["Escape"], mac ? ["Command", "W"] : ["Ctrl", "Q"]],
        },
      ],
    },
  ];
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = groups
    .map((group) => ({
      ...group,
      shortcuts: group.shortcuts.filter((shortcut) => {
        const searchText = `${group.title} ${shortcut.label} ${shortcut.keys
          .flat()
          .map((key) => `${key} ${keyLabel(key, mac)} ${keySymbol(key, mac)}`)
          .join(" ")}`.toLowerCase();
        return terms.every((term) => searchText.includes(term));
      }),
    }))
    .filter((group) => group.shortcuts.length);
  const columns = [0, 1]
    .map((id) => ({
      id,
      groups: filtered.filter((group) => group.column === id),
    }))
    .filter((column) => column.groups.length);

  return (
    <Dialog
      title="Keyboard shortcuts"
      className="keyboard-help-dialog"
      onClose={onClose}
    >
      <div className="shortcut-toolbar">
        <label className="shortcut-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Find a keyboard shortcut"
            placeholder="Find a command or key…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="shortcut-groups">
        {columns.map((column) => (
          <div className="shortcut-column" key={column.id}>
            {column.groups.map(({ title, shortcuts }) => (
              <section key={title} aria-label={title}>
                <h3>{title}</h3>
                <dl>
                  {shortcuts.map(({ label, keys }) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd className="shortcut-keys">
                        {keys.map((combination, index) => (
                          <span
                            className="shortcut-alternative"
                            key={combination.join("+")}
                          >
                            {index > 0 && (
                              <span className="shortcut-or">or</span>
                            )}
                            <KeyCombination keys={combination} mac={mac} />
                          </span>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        ))}
        {!filtered.length && (
          <p className="shortcut-empty" role="status">
            No shortcuts match “{query}”.
          </p>
        )}
      </div>
    </Dialog>
  );
}

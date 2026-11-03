// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import {
  Box,
  ChartNoAxesColumnIncreasing,
  CircleHelp,
  Columns2,
  PanelTop,
  Pencil,
  AlignHorizontalJustifyStart,
  Maximize,
  Minimize,
} from "lucide-react";
import { EquipmentPanelIcon } from "./EquipmentIcon";

type View = string;
export default function CanvasToolbar({
  drawer,
  closeDrawer,
  openPanel,
  view,
  setView,
  selected,
  setPropertiesOpen,
  arrange,
  canArrange,
  isFullscreen,
  toggleFullscreen,
  setHelpOpen,
}: {
  drawer: string | null;
  closeDrawer: () => void;
  openPanel: (name: "Equipment" | "Results") => void;
  view: View;
  setView: (view: View) => void;
  selected: string | null;
  setPropertiesOpen: (open: boolean) => void;
  arrange: () => void;
  canArrange: boolean;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  setHelpOpen: (open: boolean) => void;
}) {
  return (
    <div className="canvas-toolbar">
      <nav
        className="tool-group workspace-mode-tools"
        aria-label="Workspace panels"
      >
        <button
          className={drawer === "Equipment" ? "active" : ""}
          aria-expanded={drawer === "Equipment"}
          aria-controls="workspace-equipment-panel"
          onClick={() =>
            drawer === "Equipment" ? closeDrawer() : openPanel("Equipment")
          }
        >
          <EquipmentPanelIcon size={18} />
          <span>Equipment</span>
        </button>
        <span className="tool-divider" />
        <button
          className={drawer === "Results" ? "active" : ""}
          aria-expanded={drawer === "Results"}
          aria-controls="workspace-results-panel"
          onClick={() =>
            drawer === "Results" ? closeDrawer() : openPanel("Results")
          }
        >
          <ChartNoAxesColumnIncreasing size={18} />
          <span>Results</span>
        </button>
      </nav>
      <div className="canvas-right-tools">
        <div className="canvas-view-controls">
          <div className="view-switch" aria-label="Canvas view">
            {[
              { name: "2D", label: "2D flowsheet", icon: PanelTop },
              { name: "3D", label: "3D schematic", icon: Box },
              { name: "Split", label: "Split", icon: Columns2 },
            ].map((item) => (
              <button
                key={item.name}
                aria-label={item.label}
                aria-pressed={view === item.name}
                className={view === item.name ? "active" : ""}
                onClick={() => setView(item.name)}
              >
                <item.icon size={15} />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="tool-group canvas-edit-tools">
          <button
            aria-label="Properties"
            title="Edit selected equipment"
            disabled={!selected}
            onClick={() => setPropertiesOpen(true)}
          >
            <Pencil size={16} />
            <span>Edit</span>
          </button>
          <button
            aria-label="Arrange"
            title="Arrange equipment"
            onClick={arrange}
            disabled={!canArrange}
          >
            <AlignHorizontalJustifyStart size={16} />
            <span>Arrange</span>
          </button>
          <button
            className="toolbar-icon"
            aria-label={isFullscreen ? "Exit full screen" : "Maximize canvas"}
            aria-pressed={isFullscreen}
            title={
              isFullscreen
                ? "Exit full screen (hold Esc for 2 seconds)"
                : "Full screen (F11)"
            }
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
          <button
            className="toolbar-icon"
            aria-label="Workspace help"
            title="Workspace help"
            onClick={() => setHelpOpen(true)}
          >
            <CircleHelp size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

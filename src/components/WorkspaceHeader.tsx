// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";

import type { ReactNode } from "react";
import { Compass, Home } from "lucide-react";
import BrandMark from "./BrandMark";

export default function WorkspaceHeader({
  title,
  onProjects,
  onLanding,
  children,
  inert = false,
}: {
  title: string;
  onProjects: () => void;
  onLanding: () => void;
  children: ReactNode;
  inert?: boolean;
}) {
  return (
    <header className="app-header" inert={inert}>
      <button
        className="brand"
        onClick={onProjects}
        aria-label="Project CAD home"
      >
        <BrandMark size={29} />
        <span>Project CAD</span>
      </button>
      <span className="header-divider" />
      <div className="header-navigation">
        <button
          className="icon-button"
          aria-label="Open projects"
          title="Projects"
          onClick={onProjects}
        >
          <Home size={18} />
        </button>
        <button
          className="icon-button"
          aria-label="Landing page"
          title="Landing page"
          onClick={onLanding}
        >
          <Compass size={18} />
        </button>
      </div>
      <div className="project-heading">
        <h1>{title}</h1>
      </div>
      <div className="header-actions">{children}</div>
    </header>
  );
}

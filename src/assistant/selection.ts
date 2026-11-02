// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { MUSE_AGENTS, type AgentSelection } from "./protocol";

const key = "project-cad.assistant-agents";

export function savedAgentSelection(): AgentSelection | null {
  return MUSE_AGENTS;
}

export function rememberAgentSelection() {
  try {
    localStorage.setItem(key, JSON.stringify(MUSE_AGENTS));
  } catch {
    /* Storage can be unavailable in private browser sessions. */
  }
}

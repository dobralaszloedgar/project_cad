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

import { agentSelectionSchema, type AgentSelection } from "./protocol";

const key = "project-cad.assistant-agents";

export function savedAgentSelection(): AgentSelection | null {
  try {
    const value = agentSelectionSchema.safeParse(
      JSON.parse(localStorage.getItem(key) || "null"),
    );
    return value.success ? value.data : null;
  } catch {
    return null;
  }
}

export function rememberAgentSelection(agents: AgentSelection) {
  try {
    localStorage.setItem(key, JSON.stringify(agents));
  } catch {
    /* Storage can be unavailable in private browser sessions. */
  }
}

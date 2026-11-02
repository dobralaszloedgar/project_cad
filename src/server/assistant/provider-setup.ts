import type { ProviderId } from "../../assistant/protocol";
import { providerExecutable } from "./config";
import { installProvider } from "./install-provider";
import { CodexProvider } from "./providers/codex";
import { ClaudeProvider } from "./providers/claude";
import { MuseProvider } from "./providers/muse";

export function providerStatus(id: ProviderId, root: string) {
  return (
    id === "codex"
      ? new CodexProvider(root)
      : id === "claude"
        ? new ClaudeProvider(root)
        : new MuseProvider(root)
  ).status();
}
export type SetupState = {
  phase: "checking" | "installing" | "signing-in" | "ready" | "error";
  message: string;
};

/** One setup attempt per selected agent, with explicit retry and login polling. */
export class ProviderSetup {
  readonly states: Partial<Record<ProviderId, SetupState>> = {};
  private pending = new Map<ProviderId, Promise<void>>();
  private checking = false;
  constructor(
    private root: string,
    private resources: string,
    private login: (id: ProviderId, executable: string) => Promise<void>,
  ) {}
  ensure(providers: ProviderId[]) {
    for (const id of providers)
      if (!this.states[id] || this.states[id]?.phase === "ready")
        void this.prepare(id);
  }
  prepare(id: ProviderId): Promise<void> {
    const running = this.pending.get(id);
    if (running) return running;
    const work = this.setup(id).finally(() => this.pending.delete(id));
    this.pending.set(id, work);
    return work;
  }
  private async setup(id: ProviderId) {
    try {
      const installed = !!providerExecutable(id);
      this.states[id] = {
        phase: installed ? "checking" : "installing",
        message: installed
          ? "Checking sign-in…"
          : "Downloading and verifying the official app…",
      };
      const result = await installProvider(id, this.resources, this.root);
      this.states[id] = { phase: "checking", message: "Checking sign-in…" };
      const status = await providerStatus(id, this.root);
      if (status.available) {
        this.states[id] = {
          phase: "ready",
          message: "Signed in · ready to use",
        };
        return;
      }
      await this.login(id, result.path);
      this.states[id] = {
        phase: "signing-in",
        message: "Finish sign-in in the window we opened.",
      };
    } catch (error) {
      this.states[id] = {
        phase: "error",
        message:
          error instanceof Error ? error.message : "Setup failed. Try again.",
      };
    }
  }
  async refresh() {
    if (this.checking) return;
    this.checking = true;
    try {
      for (const [key, state] of Object.entries(this.states)) {
        const id = key as ProviderId;
        if (state.phase !== "signing-in") continue;
        const status = await providerStatus(id, this.root);
        if (status.available)
          this.states[id] = {
            phase: "ready",
            message: "Signed in · ready to use",
          };
      }
    } finally {
      this.checking = false;
    }
  }
}

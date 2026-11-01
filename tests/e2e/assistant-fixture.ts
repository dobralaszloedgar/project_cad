import { expect, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AssistantStore } from "../../src/server/assistant/store";
import { AssistantRuntime } from "../../src/server/assistant/runtime";
import { createAssistantServer } from "../../src/server/assistant/http";
import type {
  AssistantProvider,
  ProviderInput,
} from "../../src/server/assistant/providers/types";
import type { ProviderId, AgentSelection } from "../../src/assistant/protocol";
import { newUnit, type Project } from "../../src/domain/schema";
import { ConnectionRequests } from "../../src/server/assistant/connections";

const consentRequests = new WeakMap<Page, ConnectionRequests>();
export async function pendingAssistantConnection(page: Page) {
  const requests = consentRequests.get(page)!;
  await expect.poll(() => requests.pending().length).toBeGreaterThan(0);
  return requests.pending()[0]!;
}
export async function approveAssistant(page: Page, approved = true) {
  const request = await pendingAssistantConnection(page);
  consentRequests.get(page)!.decide(request.id, approved);
}

/** Real HTTP/runtime/store/project tools with a deterministic, inference-free provider. */
export async function installAssistant(
  page: Page,
  createAdapters?: (
    root: string,
  ) => Partial<Record<ProviderId, AssistantProvider>>,
) {
  const root = mkdtempSync(join(tmpdir(), "project-cad-browser-assistant-"));
  const store = new AssistantStore(join(root, "history.sqlite"));
  const run = async (input: ProviderInput) => {
    if (input.prompt.includes("attached files")) {
      input.text(
        input.attachments
          ?.map(
            (file) =>
              `${file.name}: ${Buffer.from(file.data, "base64").toString("utf8")}`,
          )
          .join("\n") || "No files.",
      );
      return;
    }
    if (input.prompt.includes("rich response")) {
      input.text(
        "## Process review\n\n| Equipment | State |\n| --- | --- |\n| Heater | Ready |\n\n**Check** the flow before applying changes.",
      );
      return;
    }
    if (input.prompt.includes("hold")) {
      input.text("Waiting for this test request.");
      await new Promise<void>((_, reject) => {
        const stop = () => reject(new Error("Stopped."));
        if (input.signal.aborted) stop();
        else input.signal.addEventListener("abort", stop, { once: true });
      });
      return;
    }
    if (input.prompt.includes("fail"))
      throw new Error("Test provider connection failed.");
    const value = (await input.call("get_project", {})) as {
      project: Project;
      revision: string;
    };
    await input.call("get_capabilities", {});
    if (
      input.prompt.includes("read") ||
      input.conversation.mode === "read-only"
    ) {
      input.text(
        `Current project: ${value.project.name}. ${value.project.units.length} equipment.`,
      );
      return;
    }
    const target =
      value.project.units.find((unit) => unit.kind === "PBR") ||
      value.project.units[0];
    const plan = {
      summary: target
        ? "Set the equipment temperature to 500 K."
        : "Add a feed to the project.",
      actions: target
        ? [
            {
              type: "update" as const,
              id: target.id,
              params: { temperature: 500 },
            },
          ]
        : [{ type: "add" as const, unit: newUnit("Feed", "F-901", 100, 100) }],
    };
    await input.call("preview_actions", { baseRevision: value.revision, plan });
    input.text("The change is validated and ready for review.");
    await input.call("propose_actions", { baseRevision: value.revision, plan });
  };
  const adapters = Object.fromEntries(
    (["codex", "claude", "muse"] as ProviderId[]).map((id) => [
      id,
      {
        status: async () => ({
          id,
          name:
            id === "claude" ? "Claude Code" : id === "codex" ? "Codex" : "Muse",
          available: true,
          message: "Browser test provider",
          models: [{ id: "test-model", name: "Test model", default: true }],
        }),
        run,
      },
    ]),
  ) as Record<ProviderId, AssistantProvider>;
  Object.assign(adapters, createAdapters?.(root));
  let agents: AgentSelection | null = null;
  const runtime = new AssistantRuntime(store, adapters, root, () => agents);
  const connections = new ConnectionRequests(root);
  consentRequests.set(page, connections);
  const origin = `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3000"}`;
  const server = createAssistantServer(runtime, {
    port: 0,
    origins: [origin],
    connections,
    selectAgents: (selection) => {
      agents = selection;
    },
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let closing = false;
  await page.context().route("http://127.0.0.1:43118/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const headers = { ...request.headers() };
    delete headers.host;
    if (url.pathname === "/connect" && request.method() === "POST")
      headers.origin = endpoint;
    try {
      const response = await route.fetch({
        url: endpoint + url.pathname + url.search,
        headers,
      });
      await route.fulfill({ response });
    } catch (error) {
      if (!closing) throw error;
    }
  });
  return async () => {
    closing = true;
    await page.context().close();
    consentRequests.delete(page);
    runtime.close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    rmSync(root, { recursive: true, force: true });
  };
}
export async function connectAssistant(page: Page) {
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: /Choose your agents|Your assistant is ready/,
    })
    .waitFor();
  if (
    await page
      .getByRole("heading", { name: "Choose your agents", exact: true })
      .isVisible()
  ) {
    for (const name of ["Codex", "Claude Code", "Muse"])
      await page.getByRole("checkbox", { name, exact: true }).check();
    await page
      .getByRole("button", { name: "Connect agents", exact: true })
      .click();
  } else {
    await page
      .getByRole("button", { name: "Connect assistant", exact: true })
      .click();
  }
  await approveAssistant(page);
}

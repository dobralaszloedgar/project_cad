import type { Page } from "@playwright/test";
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
import type { ProviderId } from "../../src/assistant/protocol";
import { newUnit, type Project } from "../../src/domain/schema";

/** Real HTTP/runtime/store/project tools with a deterministic, inference-free provider. */
export async function installAssistant(page: Page) {
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
  const runtime = new AssistantRuntime(store, adapters, root);
  const origin = "http://127.0.0.1:3000";
  const server = createAssistantServer(runtime, { port: 0, origins: [origin] });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await page.context().route("http://127.0.0.1:43118/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const headers = { ...request.headers() };
    delete headers.host;
    if (url.pathname === "/connect" && request.method() === "POST")
      headers.origin = endpoint;
    const response = await route.fetch({
      url: endpoint + url.pathname + url.search,
      headers,
    });
    await route.fulfill({ response });
  });
  return async () => {
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
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Connect local assistant" }).click();
  const popup = await popupPromise;
  await popup
    .getByRole("button", { name: "Connect assistant", exact: true })
    .click();
}

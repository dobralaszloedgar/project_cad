import { test, expect } from "./test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  assistantHistory,
  connectAssistant,
  installAssistant,
} from "./assistant-fixture";
import type { StoredConversation } from "../../src/assistant/protocol";

for (const [provider, width] of [
  ["codex", 1536],
  ["claude", 390],
] as const) {
  test(`Muse remains the only active agent with saved ${provider} history (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const dispose = await installAssistant(page);
    try {
      await page.goto("/workspace?example=heating");
      const stateRequest = page.waitForRequest(
        (request) => new URL(request.url()).pathname === "/state",
      );
      await connectAssistant(page);
      const projectId = new URL((await stateRequest).url()).searchParams.get(
        "projectId",
      )!;
      const origin = new URL(page.url()).origin;
      const model = page.getByRole("button", {
        name: "Choose provider and model",
      });
      await expect(model).toContainText("Muse");
      // Keep old history newer than the Muse chat created below, so reload must
      // choose the latest Muse conversation rather than simply the first entry.
      const time = new Date(Date.now() + 60000).toISOString();
      const previous: StoredConversation = {
        id: crypto.randomUUID(),
        origin,
        projectId,
        title: "Previous process discussion",
        provider,
        model: "old-model",
        mode: "review",
        createdAt: time,
        updatedAt: time,
        providerSession: "keep-the-original-session",
        runs: [
          {
            id: crypto.randomUUID(),
            requestId: crypto.randomUUID(),
            prompt: "Earlier equipment question",
            text: "Saved equipment advice.",
            status: "failed",
            createdAt: time,
            error: "invalid type: integer as u128, expected any value",
            activities: [],
            proposals: [
              {
                id: crypto.randomUUID(),
                projectId,
                status: "pending",
                baseRevision: "0".repeat(64),
                plan: { summary: "Earlier equipment proposal", actions: [] },
              },
            ],
          },
        ],
      };
      assistantHistory(page).save(previous);
      await page.reload();
      const open = page.getByRole("button", {
        name: "Open assistant",
        exact: true,
      });
      await open.click();
      await expect(model).toContainText("Muse");
      await expect(page.getByLabel("Process prompt")).toBeVisible();
      await expect(page.getByText("Saved equipment advice.")).toHaveCount(0);
      await expect(
        page.getByText(/Codex isn’t selected|Claude Code isn’t selected/),
      ).toHaveCount(0);

      await page
        .getByRole("button", { name: "Conversation history", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: /Previous process discussion Saved conversation/,
        })
        .click();
      await expect(page.getByText("Saved equipment advice.")).toBeVisible();
      const saved = page.getByRole("region", {
        name: "Saved conversation",
        exact: true,
      });
      await expect(saved).toBeVisible();
      await expect(
        page.getByRole("tab", {
          name: "Previous process discussion",
          exact: true,
        }),
      ).toHaveCount(1);
      await expect(page.getByLabel("Process prompt")).toHaveCount(0);
      await expect(model).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Apply reviewed actions" }),
      ).toHaveCount(0);
      await expect(
        page.getByText("This connector issue is fixed in Assistant 0.1.3"),
      ).toHaveCount(0);
      await expect(
        page.getByText("Earlier response could not finish"),
      ).toBeVisible();
      const evidence =
        process.env.PROJECT_CAD_QA_DIR ||
        join(tmpdir(), "project-cad-muse-only-qa");
      await mkdir(evidence, { recursive: true });
      await page.screenshot({
        path: join(evidence, `saved-history-${width}.png`),
      });

      await saved
        .getByRole("button", { name: "New Muse conversation", exact: true })
        .click();
      await expect(model).toContainText("Muse");
      await model.click();
      await expect(
        page.getByRole("group", { name: "Assistant provider" }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Muse alternate", exact: true })
        .click();
      await page.getByLabel("Process prompt").fill("read the current project");
      const created = page.waitForRequest(
        (request) =>
          new URL(request.url()).pathname === "/conversations" &&
          request.method() === "POST",
      );
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .click();
      expect((await created).postDataJSON()).toMatchObject({
        provider: "muse",
        model: "muse-second",
        mode: "auto",
      });
      await expect(page.getByText(/Current project:/)).toBeVisible();
      expect(
        assistantHistory(page).get(previous.id, origin, projectId),
      ).toEqual(previous);
      await page.screenshot({ path: join(evidence, `muse-chat-${width}.png`) });
      await page.reload();
      await open.click();
      await expect(model).toContainText("Muse");
      await expect(page.getByText(/Current project:/)).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/workspace");
      expect(await page.title()).toContain("Project CAD");
      expect(errors).toEqual([]);
    } finally {
      await dispose();
    }
  });
}

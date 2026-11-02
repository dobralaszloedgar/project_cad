// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { join } from "node:path";
import { test, expect } from "./test";
import { connectAssistant, installAssistant } from "./assistant-fixture";
import { AssistantStore } from "../../src/server/assistant/store";
import type { StoredConversation } from "../../src/assistant/protocol";

let dispose: (() => Promise<void>) | undefined;
let store: AssistantStore;
let saved: StoredConversation[];
let includeMuse = false;

test.beforeEach(async ({ page }) => {
  saved = [];
  includeMuse = false;
  dispose = await installAssistant(page, (root) => {
    store = new AssistantStore(join(root, "history.sqlite"));
    return {};
  });
  await page
    .context()
    .route("http://127.0.0.1:43118/state?**", async (route) => {
      if (!saved.length) {
        const projectId = new URL(route.request().url()).searchParams.get(
          "projectId",
        )!;
        const origin = new URL(page.url()).origin;
        for (const [provider, title, updatedAt, archived] of [
          ["codex", "Earlier Codex chat", "2026-11-02T13:00:00Z", false],
          ["claude", "Earlier Claude chat", "2026-11-02T12:00:00Z", false],
          ...(includeMuse
            ? ([
                ["muse", "Continue Muse chat", "2026-11-01T12:00:00Z", false],
                ["muse", "Archived Muse chat", "2026-11-03T12:00:00Z", true],
              ] as const)
            : []),
        ] as const) {
          const legacy = provider !== "muse";
          const chat: StoredConversation = {
            id: crypto.randomUUID(),
            projectId,
            origin,
            title,
            provider,
            model: "test-model",
            mode: "review",
            createdAt: updatedAt,
            updatedAt,
            archived,
            providerSession: `saved-${provider}-session`,
            runs: [
              {
                id: crypto.randomUUID(),
                requestId: crypto.randomUUID(),
                prompt: `Saved prompt from ${provider}`,
                text: `Saved response from ${provider}`,
                status: legacy ? "failed" : "completed",
                createdAt: updatedAt,
                activities: [],
                error: legacy
                  ? "Invalid request: invalid type: integer `100000000000000000000` as u128, expected any value"
                  : undefined,
                proposals: legacy
                  ? [
                      {
                        id: crypto.randomUUID(),
                        projectId,
                        baseRevision: "0".repeat(64),
                        plan: {
                          summary: "Saved proposed project change",
                          actions: [
                            { type: "rename_project", name: "Old proposal" },
                          ],
                        },
                        status: "pending",
                      },
                    ]
                  : [],
              },
            ],
          };
          store.save(chat);
          saved.push(chat);
        }
      }
      await route.fallback();
    });
});

test.afterEach(async () => {
  store?.close();
  await dispose?.();
});

for (const [provider, name] of [
  ["codex", "Codex"],
  ["claude", "Claude Code"],
] as const) {
  test(`starts with Muse and keeps saved ${name} chats read-only`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/workspace?example=heating");
    await connectAssistant(page);
    const model = page.getByRole("button", {
      name: "Choose provider and model",
    });
    await expect(model).toContainText("Muse");
    await expect(
      page.getByRole("heading", { name: "How can I help you today?" }),
    ).toBeVisible();

    // Reconnect using the saved browser token, as an existing user would.
    await page.reload();
    await page
      .getByRole("button", { name: "Open assistant", exact: true })
      .click();
    await expect(model).toContainText("Muse");
    await expect(
      page.getByRole("heading", { name: "How can I help you today?" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Conversation history", exact: true })
      .click();
    const old = saved.find((chat) => chat.provider === provider)!;
    await page
      .getByRole("button", { name: new RegExp(`^${old.title}`) })
      .click();
    await expect(
      page.getByText(`Saved response from ${provider}`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: old.title, exact: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("tab", { name: "New conversation", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`${name} conversation · Read-only`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Process prompt")).toBeHidden();
    await expect(model).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Apply reviewed actions", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Dismiss", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Update assistant", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("This connector issue is fixed in Assistant 0.1.3"),
    ).toHaveCount(0);
    await page.screenshot({
      path: test.info().outputPath("saved-history.png"),
    });
    await page.getByText("Saved error details", { exact: true }).click();
    await expect(
      page.getByText(old.runs[0].error!, { exact: true }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Start a Muse conversation", exact: true })
      .click();
    await expect(model).toContainText("Muse");
    await page.getByLabel("Process prompt").fill("read the current project");
    const created = page.waitForRequest(
      (request) =>
        request.url().includes("/conversations?") &&
        request.method() === "POST",
    );
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    expect((await created).postDataJSON()).toMatchObject({ provider: "muse" });
    await expect(page.getByText(/Current project:/)).toBeVisible();
    expect(store.get(old.id, old.origin, old.projectId)).toEqual(old);
    expect(errors).toEqual([]);
  });
}

test("resumes an existing Muse chat even when legacy and archived chats are newer", async ({
  page,
}) => {
  includeMuse = true;
  await page.goto("/workspace?example=heating");
  await connectAssistant(page);
  await expect(
    page.getByText("Saved response from muse", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Continue Muse chat", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("button", { name: "Choose provider and model" }),
  ).toContainText("Muse");
  await expect(
    page.getByRole("button", {
      name: "Start a Muse conversation",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByLabel("Process prompt").fill("read the current project");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText(/Current project:/)).toBeVisible();
  const current = saved.find((chat) => chat.title === "Continue Muse chat")!;
  expect(
    store.get(current.id, current.origin, current.projectId).runs,
  ).toHaveLength(2);
});

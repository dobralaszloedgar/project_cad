import { test, expect, type Page } from "./test";
import { installAssistant, connectAssistant } from "./assistant-fixture";
let dispose: (() => Promise<void>) | undefined;
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const collected: string[] = [];
  page.on("pageerror", (error) => collected.push(error.message));
  errors.set(page, collected);
  dispose = await installAssistant(page);
  await page.goto("/workspace");
  await connectAssistant(page);
  await expect(
    page.getByRole("button", { name: "Choose provider and model" }),
  ).toContainText("Test model");
});
test.afterEach(async ({ page }) => {
  await dispose?.();
  expect(errors.get(page)).toEqual([]);
});
async function settled(page: Page) {
  await page.locator(".assistant-drawer").evaluate((el) =>
    Promise.all(
      el
        .parentElement!.getAnimations({ subtree: true })
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  );
}
async function send(page: Page, message: string) {
  await page.getByLabel("Process prompt").fill(message);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
}

test("tabs preserve individual drafts and saved history supports search, rename and archive", async ({
  page,
}) => {
  await page.getByLabel("Process prompt").fill("Draft one");
  await page.getByRole("button", { name: "New chat tab" }).click();
  await expect(page.getByLabel("Process prompt")).toHaveValue("");
  await page.getByLabel("Process prompt").fill("Draft two");
  await page.getByRole("tab").first().click();
  await expect(page.getByLabel("Process prompt")).toHaveValue("Draft one");
  await page.getByRole("tab").nth(1).click();
  await expect(page.getByLabel("Process prompt")).toHaveValue("Draft two");
  await send(page, "read project history");
  await expect(page.getByRole("log")).toContainText("6 equipment");
  await page
    .getByRole("button", { name: "Conversation history", exact: true })
    .click();
  await page.getByLabel("Search conversations").fill("history");
  await page
    .getByRole("button", { name: "Rename read project history" })
    .click();
  await page
    .getByLabel("Conversation name", { exact: true })
    .fill("Process review");
  await page.getByRole("button", { name: "Save conversation name" }).click();
  await page.getByLabel("Search conversations").fill("Process review");
  await page.getByRole("button", { name: "Archive Process review" }).click();
  await expect(page.getByText("No conversations found.")).toBeVisible();
  await page.getByLabel("Show archived").check();
  await expect(
    page.getByRole("button", { name: "Restore Process review" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore Process review" }).click();
  await page.getByLabel("Show archived").uncheck();
  await page.getByRole("button", { name: /^Process review codex/ }).click();
  await expect(page.getByRole("log")).toContainText("6 equipment");
});

test("files reach the companion and are retained with the conversation", async ({
  page,
}) => {
  await page.getByLabel("Attach files", { exact: true }).setInputFiles({
    name: "feed.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("component,flow\nwater,25"),
  });
  await expect(page.getByLabel("Attachments", { exact: true })).toContainText(
    "feed.csv",
  );
  await send(page, "inspect attached files");
  await expect(page.getByRole("log")).toContainText("water,25");
  await expect(page.getByRole("log")).toContainText("feed.csv");
  await page.reload();
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await expect(page.getByRole("log")).toContainText("feed.csv");
  await expect(page.getByRole("log")).toContainText("water,25");
});

test("queued follow-ups pause on stop and resume without duplicate sends", async ({
  page,
}) => {
  await send(page, "hold the active request");
  await expect(page.getByRole("log")).toContainText(
    "Waiting for this test request.",
  );
  await page.getByLabel("Process prompt").fill("read after stopping");
  await page.getByLabel("Process prompt").press("Tab");
  await expect(page.getByLabel("Queued messages")).toContainText("1 queued");
  await page.getByRole("button", { name: "Stop response" }).click();
  await expect(page.getByLabel("Queued messages")).toContainText("Paused");
  await page.getByRole("button", { name: "Resume queue" }).click();
  await expect(page.getByRole("log")).toContainText("6 equipment");
  await expect(
    page
      .locator(".chat-user-message")
      .filter({ hasText: "read after stopping" }),
  ).toHaveCount(1);
  await expect(page.getByLabel("Queued messages")).not.toBeVisible();
});

test("background activity, popover dismissal, markdown and desktop geometry", async ({
  page,
}) => {
  await send(page, "hold a background request");
  await expect(
    page.getByRole("button", { name: "Stop response" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close assistant panel" }).click();
  await expect(
    page.getByRole("button", { name: "Open assistant activity" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open assistant activity" }).click();
  await page.getByRole("button", { name: "Stop response" }).click();
  await expect(page.getByRole("log")).toContainText("Stopped by you.");
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Choose provider and model" }).click();
  await expect(
    page.getByRole("dialog", { name: "Choose provider and model" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Choose provider and model" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Assistant", exact: true }),
  ).toBeVisible();
  await send(page, "read rich response");
  await expect(
    page.getByRole("log").getByRole("heading", { name: "Process review" }),
  ).toBeVisible();
  await expect(page.getByRole("log").getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeVisible();
  await settled(page);
  await expect(
    page.getByRole("dialog", { name: "Assistant", exact: true }),
  ).toHaveCSS("font-family", '"Figtree Variable", sans-serif');
  await page.screenshot({
    path: "test-results/assistant-connected.png",
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open assistant", exact: true }),
  ).toBeVisible();
});

test("background queues keep their own chat and activity opens the running conversation", async ({
  page,
}) => {
  await send(page, "hold first conversation");
  await expect(page.getByRole("log")).toContainText(
    "Waiting for this test request.",
  );
  await page.getByRole("button", { name: "New chat tab" }).click();
  await page.getByLabel("Process prompt").fill("hold second conversation");
  await page.getByLabel("Process prompt").press("Tab");
  await expect(page.getByLabel("Queued messages")).toContainText("1 queued");
  await page.getByRole("tab").first().click();
  await page.getByRole("button", { name: "Stop response" }).click();
  await expect(page.getByRole("tab").nth(1)).toContainText(
    "hold second conversation",
  );
  await expect(page.getByRole("tab").first()).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("log")).not.toContainText(
    "hold second conversation",
  );
  await page.getByRole("button", { name: "Close assistant panel" }).click();
  await page.getByRole("button", { name: "Open assistant activity" }).click();
  await expect(page.getByRole("tab").nth(1)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("log")).toContainText("hold second conversation");
  await page.getByRole("button", { name: "Stop response" }).click();
  await expect(page.getByRole("log")).toContainText("Stopped by you.");
});

test("dictation appends to its own draft and stops when changing tabs", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class TestRecognition {
      onresult?: (event: {
        resultIndex: number;
        results: { isFinal: boolean; 0: { transcript: string } }[];
      }) => void;
      onend?: () => void;
      start() {
        Object.assign(window, { testVoice: this });
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
      emit(text: string) {
        this.onresult?.({
          resultIndex: 0,
          results: [{ isFinal: true, 0: { transcript: text } }],
        });
      }
    }
    Object.assign(window, { SpeechRecognition: TestRecognition });
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await page.getByLabel("Process prompt").fill("Check");
  await page
    .getByRole("button", { name: "Start dictation", exact: true })
    .click();
  await page.evaluate(() =>
    (
      window as unknown as { testVoice: { emit: (text: string) => void } }
    ).testVoice.emit("the heater"),
  );
  await expect(page.getByLabel("Process prompt")).toHaveValue(
    "Check the heater",
  );
  await page.getByRole("button", { name: "New chat tab" }).click();
  await expect(
    page.getByRole("button", { name: "Start dictation", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Process prompt")).toHaveValue("");
  await page.getByRole("tab").first().click();
  await expect(page.getByLabel("Process prompt")).toHaveValue(
    "Check the heater",
  );
});

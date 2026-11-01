import { mkdir } from "node:fs/promises";
import { test, expect } from "./test";
import { installAssistant, approveAssistant } from "./assistant-fixture";
import { CodexProvider } from "../../src/server/assistant/providers/codex";

// Explicit opt-in: uses an existing Codex sign-in and real model inference.
test("real Codex reads browser project tools and proposes a reviewed change", async ({
  page,
}) => {
  test.skip(
    process.env.PROJECT_CAD_LIVE_CODEX !== "1",
    "Requires an existing Codex sign-in and real inference.",
  );
  test.setTimeout(240000);
  const calls: string[] = [];
  const finished: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const dispose = await installAssistant(page, (root) => {
    const codex = new CodexProvider(root);
    return {
      codex: {
        status: () => codex.status(),
        run: async (input) => {
          try {
            await codex.run({
              ...input,
              call: (name, args) => {
                calls.push(name);
                return input.call(name, args);
              },
            });
            finished.push(input.prompt);
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
            throw error;
          }
        },
      },
    };
  });
  try {
    await page.goto("/workspace");
    await expect(
      page.getByRole("button", { name: "Run simulation" }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Open assistant", exact: true })
      .click();
    await page.getByRole("checkbox", { name: "Codex", exact: true }).check();
    await page
      .getByRole("button", { name: "Connect agents", exact: true })
      .click();

    await approveAssistant(page);
    const model = page.getByRole("button", {
      name: "Choose provider and model",
    });
    await expect(model).toContainText("Codex");
    await model.click();
    await page
      .getByRole("group", { name: "Assistant model" })
      .getByRole("button", { name: "GPT-6.1-Sol", exact: true })
      .click();
    const send = async (prompt: string) => {
      await page.getByLabel("Process prompt").fill(prompt);
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .click();
    };
    await send(
      "Hello world. Read get_project and get_capabilities, then briefly tell me this project's name and one supported action. Do not propose changes yet.",
    );
    await expect
      .poll(() => ({ completed: finished.length, errors }), { timeout: 100000 })
      .toEqual({ completed: 1, errors: [] });
    expect(calls).toContain("get_capabilities");
    await send(
      "In this disposable test project, propose adding one unconnected Feed named QA Feed. Use get_capabilities, preview_actions, simulate the proposed batch and report any warnings, then propose_actions. Leave the existing equipment and connections intact. Do not claim it has been applied.",
    );
    await expect
      .poll(() => ({ completed: finished.length, errors }), { timeout: 120000 })
      .toEqual({ completed: 2, errors: [] });
    for (const name of [
      "get_project",
      "get_capabilities",
      "preview_actions",
      "simulate",
      "propose_actions",
    ])
      expect(calls).toContain(name);
    const proposal = page.getByRole("region", {
      name: "Review proposed changes",
    });
    await expect(proposal).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Apply reviewed actions" }),
    ).toBeEnabled();
    await mkdir("/tmp/project-cad-connector-qa", { recursive: true });
    await page.screenshot({
      path: "/tmp/project-cad-inline-setup-qa/06-real-codex-proposal.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Apply reviewed actions" }).click();
    await expect(proposal).toContainText(/Applied and saved|Changes applied/);
    expect(errors).toEqual([]);
    console.log(
      JSON.stringify({
        realCodex: true,
        tools: calls,
        completedTurns: finished.length,
        proposalAppliedByUser: true,
      }),
    );
  } finally {
    await dispose();
  }
});

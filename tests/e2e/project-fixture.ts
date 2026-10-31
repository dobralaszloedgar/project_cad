import { expect, type Page } from "@playwright/test";
import type { Project } from "../../src/domain/schema";
import { checkpoint } from "../../src/lib/revisions";

/** Load test data through browser storage without a project import UI. */
export async function loadProject(page: Page, project: Project) {
  // Unmount the editor before seeding so autosave cannot overwrite the fixture.
  await page.goto("/api/ai");
  await page.evaluate(
    (workspace) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("project-cad", 3);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains("workspace"))
            database.createObjectStore("workspace");
          if (!database.objectStoreNames.contains("projects"))
            database.createObjectStore("projects", { keyPath: "id" });
          if (!database.objectStoreNames.contains("projectFolders"))
            database.createObjectStore("projectFolders", { keyPath: "id" });
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ["workspace", "projects"],
            "readwrite",
          );
          const id = crypto.randomUUID();
          const now = new Date().toISOString();
          transaction.objectStore("projects").put({
            id,
            workspace,
            createdAt: now,
            updatedAt: now,
            starred: false,
          });
          transaction.objectStore("workspace").put(workspace, "current");
          transaction.objectStore("workspace").put(id, "activeProject");
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onabort = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    {
      version: 1,
      project,
      revisions: [checkpoint(project, "Test fixture")],
    },
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await expect(page.locator(".project-heading h1")).toHaveText(project.name);
  await expect(page.locator(".react-flow__node")).toHaveCount(
    project.units.length,
  );
}

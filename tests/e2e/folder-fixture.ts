import type { Page } from "@playwright/test";

/** Only the native chooser is replaced. Returned handles are real browser
 * filesystem handles in an isolated test origin, never a user's directory. */
export async function installFolderPicker(page: Page, unsupported = false) {
  await page.addInitScript(
    ({ unsupported }) => {
      const handlePrototype = FileSystemHandle.prototype;
      const queryPermission = Reflect.get(
        handlePrototype,
        "queryPermission",
      ) as (
        this: FileSystemHandle,
        options?: { mode: string },
      ) => Promise<PermissionState>;
      const requestPermission = Reflect.get(
        handlePrototype,
        "requestPermission",
      ) as (
        this: FileSystemHandle,
        options?: { mode: string },
      ) => Promise<PermissionState>;
      Object.defineProperty(handlePrototype, "queryPermission", {
        configurable: true,
        value: async function (
          this: FileSystemHandle,
          options?: { mode: string },
        ) {
          const override = localStorage.getItem("folder-qa-permission");
          return override ?? queryPermission.call(this, options);
        },
      });
      Object.defineProperty(handlePrototype, "requestPermission", {
        configurable: true,
        value: async function (
          this: FileSystemHandle,
          options?: { mode: string },
        ) {
          const override = localStorage.getItem("folder-qa-grant");
          if (override) {
            localStorage.setItem("folder-qa-permission", override);
            return override;
          }
          return requestPermission.call(this, options);
        },
      });
      const createWritable = FileSystemFileHandle.prototype.createWritable;
      FileSystemFileHandle.prototype.createWritable = async function (options) {
        const writer = await createWritable.call(this, options);
        if (localStorage.getItem("folder-qa-write-hold") === "yes") {
          const write = writer.write.bind(writer);
          writer.write = async (data) => {
            localStorage.setItem("folder-qa-writing", "yes");
            await new Promise<void>((resolve) =>
              window.addEventListener(
                "folder-qa-release-write",
                () => resolve(),
                { once: true },
              ),
            );
            return write(data);
          };
        }
        if (localStorage.getItem("folder-qa-write-failure") === "yes") {
          writer.write = async () => {
            throw new DOMException("Test disk is full", "QuotaExceededError");
          };
        }
        return writer;
      };
      Object.defineProperty(window, "showDirectoryPicker", {
        configurable: true,
        value: unsupported
          ? undefined
          : async (options: Record<string, unknown>) => {
              localStorage.setItem(
                "folder-qa-picker-call",
                JSON.stringify({
                  options,
                  userActivation: navigator.userActivation.isActive,
                }),
              );
              localStorage.setItem(
                "folder-qa-picker-count",
                String(
                  Number(localStorage.getItem("folder-qa-picker-count") ?? 0) +
                    1,
                ),
              );
              if (localStorage.getItem("folder-qa-cancel") === "yes") {
                localStorage.removeItem("folder-qa-cancel");
                throw new DOMException("Cancelled test picker", "AbortError");
              }
              const root = await navigator.storage.getDirectory();
              const parent = await root.getDirectoryHandle(
                localStorage.getItem("folder-qa-parent") ?? "Laptop projects",
                {
                  create: true,
                },
              );
              const open = localStorage.getItem("folder-qa-open");
              return open ? parent.getDirectoryHandle(open) : parent;
            },
      });
    },
    { unsupported },
  );
}

export async function folderText(page: Page, folderName: string) {
  return page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const parent = await root.getDirectoryHandle("Laptop projects");
    const folder = await parent.getDirectoryHandle(name);
    return (
      await (await folder.getFileHandle("project.json")).getFile()
    ).text();
  }, folderName);
}

export async function replaceFolderText(
  page: Page,
  folderName: string,
  text: string,
) {
  await page.evaluate(
    async ({ name, text }) => {
      const root = await navigator.storage.getDirectory();
      const parent = await root.getDirectoryHandle("Laptop projects");
      const folder = await parent.getDirectoryHandle(name);
      const writer = await (
        await folder.getFileHandle("project.json")
      ).createWritable();
      await writer.write(text);
      await writer.close();
    },
    { name: folderName, text },
  );
}

export async function folderControls(
  page: Page,
  values: Record<string, string | null>,
) {
  await page.evaluate((values) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === null) localStorage.removeItem(`folder-qa-${key}`);
      else localStorage.setItem(`folder-qa-${key}`, value);
    }
  }, values);
}

export async function releaseWrite(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem("folder-qa-write-hold");
    localStorage.removeItem("folder-qa-writing");
    window.dispatchEvent(new Event("folder-qa-release-write"));
  });
}

export async function recoveryWorkspace(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{
        version: number;
        project: { name: string; units: unknown[]; edges: unknown[] };
        revisions: unknown[];
      }>((resolve, reject) => {
        const request = indexedDB.open("project-cad");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const read = database
            .transaction("workspace")
            .objectStore("workspace")
            .get("current");
          read.onsuccess = () => {
            database.close();
            resolve(read.result);
          };
          read.onerror = () => {
            database.close();
            reject(read.error);
          };
        };
      }),
  );
}

# Project files and folders

[Documentation index](README.md) · [Getting started](GETTING_STARTED.md) · [Browser support](BROWSER_SUPPORT.md)

## Choose a save location

On first opening the app, choose a project folder on your laptop. The app remembers it and uses it for new projects, templates, and duplicates. Change the default in **Storage**. In Projects, use **+ New** to create a project or folder; the library's right-click menu also offers both actions. New folders are created on disk inside the configured storage directory, or inside the folder currently being browsed. Browser permission may need to be renewed after restarting.

## Project documents

Each new project is one named, self-contained file, such as `Reactor study.pcad`. Equipment, connections, parameters, layout, thermodynamic settings, and revision history autosave into that file. No per-project wrapper folder is required. Browser recovery copies protect unfinished saves.

## Organize and rediscover files

The Projects sidebar shows connected disk folders. Open a folder to browse its projects and subfolders; **New folder** creates a real directory, and **Create project** uses the folder being viewed. **Rename** renames the file and project title. **Move to folder** writes and verifies the destination before removing the source, retaining project identity and history. An occupied destination is never overwritten. If source removal fails, both complete files are retained, the original save location stays connected, and an error explains where the copy is.

Projects rescan connected folders on startup, when opening the library, when the app regains focus, and with **Refresh projects**. Renaming or moving files or their containing folders in Explorer/Finder is recognized by the project ID inside the document. Autosave never creates a replacement at a missing old path. Use **Locate project** and select the new containing folder when a file moves outside connected folders. If several possible copies exist, the app requires a specific location instead of guessing. A copy discovered on disk receives its own project identity when opened; scanning alone never rewrites files.

## Existing projects and portable copies

Existing `project.json` documents remain readable inside their original folders. Connect their parent folder to discover them. Moving an existing project through the app converts it to a named `.pcad` file and preserves its history. **Export project** and **Export local copy** download complete, independent `.pcad` documents that can be placed into a connected folder and discovered with Refresh.

## Browser permissions

Local folder access uses the browser's native directory picker in desktop Chrome or Edge on HTTPS or localhost. The chosen destination is remembered as soon as folder access is granted, including when project creation fails; the draft keeps the destination for a retry. External changes are detected by rescanning, not by a continuous filesystem watcher. The browser can only discover changes inside folders the user has connected. Existing browser-only projects remain available and can be saved as `.pcad` files with **Save to folder**.

Browsers without a native writable folder picker, including Firefox and Safari, can create, duplicate, edit, simulate, and autosave projects in browser storage. **Storage → Export project** downloads a complete `.pcad` backup. Browser storage belongs to that browser profile and website; clearing site data removes those local projects. Choosing a disk folder is available only when the browser exposes that capability. A directory upload is not treated as writable folder access.

## Recovery and conflicts

If access is lost or another program changes the file, Project CAD retains browser recovery and offers **Locate project**, **Reconnect folder**, **Retry save**, or **Reload from folder**. Export the local copy before reloading to retain both versions. Successful file saves show the actual filename in the footer. Conflicting external edits are never silently overwritten.

## Verification

File checks: `npm test -- tests/project-files.test.ts` and `npx playwright test tests/e2e/project-documents.spec.ts tests/e2e/project-folders.spec.ts tests/e2e/projects.spec.ts tests/e2e/project-home.spec.ts tests/e2e/project-folder-setup.spec.ts tests/e2e/project-trash.spec.ts`. Storage unit tests write actual temporary disk files through a handle adapter. Browser tests replace the native picker with origin-private file-system handles; they verify native streams, persisted handles, and the UI, but do not automate the operating system's picker.

Copyright © 2026 László Edgár Dobra. All rights reserved. See [LICENSE](../LICENSE) and [third-party notices](../THIRD_PARTY_NOTICES.txt).

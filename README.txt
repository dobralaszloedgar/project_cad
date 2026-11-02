# Project CAD

> **Copyright (c) 2026 László Edgár Dobra. All rights reserved.**
> No reuse license is granted for the original Project CAD code, documentation,
> or assets. Public visibility is not permission to copy, modify, redistribute,
> commercialize, or use this material in another project or for AI training.
> See [LICENSE](LICENSE) for the scope and existing legal/platform rights, and
> [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) for separately licensed material.

Project CAD is a local process-flowsheet demonstration with 2D/3D views and a Rust/WebAssembly thermodynamics kernel.

## Status

Three thermodynamic models are available: ideal gas, ideal solution (Raoult’s law), and Modified UNIFAC 2.0. Bundled examples work offline; the configured chemical database supplies verified component records and model parameters that are saved with each project.

Eight equipment types have setup controls and distinct 2D/3D schematics. Packed-bed reactors support configurable gas reaction sets with reactant/product tables, stoichiometry, per-reaction power laws or general expressions, reversible and inhibition terms, Arrhenius scaling, prescribed pressure drop, and catalyst-mass or target-conversion sizing. Projects support 2–40 catalog components through feeds, reactions, streams, recycling and saved files. Results include species balances, reaction extents and an exportable bed profile. Existing synthetic catalyst-mass and residence-time models remain available. Heaters and coolers accept an outlet temperature or, for ideal gas, a specified duty. The new templates exercise two-feed mixing, heating/cooling and catalyst-bed balances. Equations and limits are in [docs/EQUIPMENT.txt](docs/EQUIPMENT.txt).

## Getting started

Distillation towers offer **Shortcut design (FUG)** and **Equilibrium stages (MESH)** under Properties → Setup → Column calculation method. FUG estimates stages and minimum reflux from key recoveries; MESH calculates stage profiles and condenser/reboiler duties using the selected liquid thermodynamics. Optional MESH sieve-tray ratings predict flooding and weeping from tower geometry and supplied liquid properties, with tray diagnostics and a 3D display. The rating does not change separation, pressure profile or duties. Try the **Distillation · FUG shortcut** or **Distillation · MESH column** templates. Specifications and limits are in [docs/DISTILLATION.txt](docs/DISTILLATION.txt).

From the Project CAD folder, run `npm ci` and `npm run dev`. Open the Raoult’s law separation template to try the liquid models, or the **PBR · Water–gas shift**, **PBR · Catalyst sizing** and **PBR · Methanol synthesis** templates for real chemicals with published kinetics. Reactor setup includes source links, catalyst details, units and validity ranges. Recipes run offline with bundled chemical data; see [docs/REACTION_TEMPLATES.txt](docs/REACTION_TEMPLATES.txt).

## Project assistant

Open the project assistant and choose **Connect assistant**. Muse is selected automatically. If the connector is missing, its installer downloads automatically for your operating system; a download link remains available if the browser blocks the automatic download. Open the installer, then Project CAD Assistant. Muse installs automatically when missing and reuses your existing sign-in. Approve the website connection, finish sign-in if prompted, and choose **Return to project** to return to the original project tab.

This flow requires connector **0.1.8 or newer**. Older connectors show an update step. Build and publish the new installers before releasing the updated website; the existing published 0.1.5 download manifest is not compatible.

**macOS:** Open `ProjectCAD-Assistant-macos-universal.pkg` and complete installation. Open **Project CAD Assistant** from **Finder → Go → Home → Applications**. Supports Apple silicon and Intel, macOS 13.5 or newer.

**Linux:** In the download folder, run as your normal user:

```sh
chmod +x ProjectCAD-Assistant-linux-universal.run
./ProjectCAD-Assistant-linux-universal.run
```

Then open **Project CAD Assistant** from your application menu. It installs in `~/.local/share/project-cad-assistant`; no sudo is needed. The universal installer selects x64 or ARM64 automatically.

**Windows:** Open the universal Setup.exe, then **Project CAD Assistant** from Start. Installation uses `%LOCALAPPDATA%\ProjectCAD\Assistant` without administrator access. Uninstall from **Settings → Uninstall connector** or Windows Installed apps. Projects, conversations, and sign-ins are preserved.

The connector exposes only Muse. Models and reasoning levels come from the user's installed Muse catalog, including configured models. It refreshes on connection, focus, and **Refresh models**. Every turn, including resumed chats, reads the current AI guide from the connected website through `get_guide`. The model receives that refreshed guide and a fresh project snapshot before responding.

Changes still require **Apply reviewed actions** in Project CAD. **Read only** conversations cannot propose edits. Project files are never written directly by the connector. Conversation history remains in `~/.project-cad/assistant/conversations.sqlite`; old provider conversations are preserved for reading.

The service listens on `127.0.0.1:43118`; the Windows/Linux connector window uses `127.0.0.1:43119`. Keep the project tab and connector running, and allow local network access when your browser asks. Website connection approval remains local; the website never receives the desktop control token or launch ticket. **Settings** lets you change the website URL or startup at login.

For source development, use Node.js 24 or newer and `npm run assistant`. Set `PROJECT_CAD_APP_ORIGINS` for other website origins, `PROJECT_CAD_ASSISTANT_DATA` for another data directory, or `PROJECT_CAD_MUSE_BIN` for a custom Muse executable. Stop any installed connector using the same port first. The [AI guide](docs/AI_GUIDE.txt) is generated from `src/assistant/guide.ts`; verify it with `npm run docs:ai-guide:check`.

Build the macOS app and installer with `npm run assistant:package` on a Mac with Xcode command-line tools. It verifies pinned Node downloads and produces `dist/assistant/Project CAD Assistant.app`, `ProjectCAD-Assistant-macos-universal.pkg`, and a ZIP, with SHA-256 checksums. Generated binaries stay in `dist/assistant/` and are not committed or copied into the website. `npm run assistant:build` builds only the JavaScript payload. Packaging does not install the service on the build machine.

To rebuild on a MacBook, copy or check out the current source including the installer changes. Install Node.js 24 or newer and Xcode command-line tools (`xcode-select --install`) first. Configure the same external release policy at `~/.config/project-cad/release-policy.json` on the Mac, or set `RELEASE_REFERENCE_POLICY_FILE` to its location; the build requires it, and it is kept outside the repository and installers (see docs/RELEASE_CHECKS.txt). Install dependencies on the Mac itself; do not reuse a Windows `node_modules` folder. From the repository directory, run:

```sh
npm ci
npx vitest run tests/assistant-install-cleanup.test.ts tests/assistant-install.test.ts
npm run assistant:package
npm run assistant:verify
open dist/assistant
```

The resulting `ProjectCAD-Assistant-macos-universal.pkg` works on Apple silicon and Intel Macs. Open it to install or upgrade `~/Applications/Project CAD Assistant.app`. Verification uses temporary installations and checks that obsolete files and previous-version backups are removed while conversation data is preserved. The local build is ad-hoc signed; release signing and notarization are configured separately below.

All installers replace the existing application in its usual install folder and remove old application files and leftover `.previous-<UUID>` backup folders after a successful upgrade. Cleanup retries temporary file locks; if an old version remains locked, setup reports a failure so you can close the assistant and rerun the installer. Settings, sign-ins, provider installs, and conversations in `~/.project-cad/assistant` are preserved. Downloaded installers and manually extracted portable copies remain where you saved them.

Build Windows packages with `npm run assistant:package-windows` and Linux packages with `npm run assistant:package-linux`. These cross builds use Go for native launchers and NSIS for Windows installers, plus verified target-specific Node runtimes. Each target has separate x64 and ARM64 packages. The download manifest retains all built platforms. `npm run assistant:export-downloads` copies the installers, archives, macOS app, checksums, and instructions into a new **Project CAD Assistant** folder in your Downloads directory.

### Public installer downloads

Installers can be hosted in a public Vercel Blob store belonging to the Project CAD team. The website serves only the small, checked-in `public/downloads/assistant/downloads.json` manifest. Its buttons download installers directly from versioned Blob URLs, without a Vercel login. `.vercelignore` excludes generated packages from website deployments. Blob hosts the downloads; the installed connector and selected agents still run on the user's computer.

For a new release, increment the version in `scripts/assistant/releases.json`, rebuild all three platforms, and configure the external release policy described in docs/RELEASE_CHECKS.txt. Set `BLOB_READ_WRITE_TOKEN` in the publishing process environment for the intended public store; do not commit it or expose it to the browser. Run `npm run assistant:publish -- --base-url https://<store-id>.public.blob.vercel-storage.com/project-cad-assistant/v<version> --dry-run`, then repeat without `--dry-run` to upload. Use `--directory <folder>` to publish an already prepared complete release folder. This needs no GitHub sign-in or manual asset dragging.

Publishing checks all ten packages and their checksum sidecars, uploads immutable files, and downloads them without credentials to verify their SHA-256 hashes. It uploads the public manifest last, then updates the local website manifest. A failed upload can be resumed with the same command; a conflicting file requires a new version. Include the updated website manifest in the next deployment to activate the download links. The website build needs neither packaging tools nor release credentials. `npm run assistant:stage-downloads` verifies and stages an already published release without rebuilding or uploading; pass `-- --base-url <versioned-Blob-URL>` to select a new version. Vercel storage and transfer limits apply to these downloads.

Existing GitHub download manifests remain supported. The optional GitHub release publisher is available as `npm run assistant:publish:github`; it requires the configured repository owner's GitHub CLI account and committed source already pushed to that repository.

`npm run assistant:verify-downloads` downloads and hashes every published package without credentials, checking public availability and byte-for-byte integrity against the website manifest.

The local macOS build is ad-hoc signed and is not notarized; Windows installers are unsigned. macOS release builds can supply `PROJECT_CAD_SIGN_IDENTITY` (Developer ID Application) and `PROJECT_CAD_INSTALLER_IDENTITY` (Developer ID Installer); signing, notarization, and distribution are separate release steps. Supported targets are macOS 13.5+, 64-bit Windows 11/Server 2022+, and desktop Linux with glibc 2.28+ (such as Ubuntu 22.04+ or Debian 12+). The Linux package requires `tar`, `xdg-open`, and a terminal emulator for provider sign-in; it does not target Alpine/musl. Cross compiling a Windows installer does not verify runtime behavior on Windows.

Assistant checks: `npx vitest run tests/assistant.test.ts tests/assistant-config.test.ts` and `npx playwright test tests/e2e/assistant.spec.ts`. Browser tests exercise the real companion, project tools, review, and folder writes with deterministic provider substitutes, so they require no API credentials. After packaging, `npm run assistant:verify` checks the native launcher, checksums, current-user package, temporary installation/update, rejected corrupt updates, preserved history, pairing, and provider discovery using the bundled runtime. It exercises a temporary background service only if no existing assistant service or login configuration is present. All test installations are removed; no startup-at-login setting is installed. Live inference must be checked separately.

`npm run assistant:build && npm run assistant:verify-providers` checks fresh provider downloads, checksum verification, preserved vendor resources, executable startup, available sign-in commands, and reuse of installed versions in a temporary folder. This check requires network access and does not sign in or replace the user's tools.

## Local project files and folders

On first opening the app, choose a project folder on your laptop. The app remembers it and uses it for new projects, templates, and duplicates. Change the default in **Storage settings**, or use **Connect folder** in Projects to browse another folder. Browser permission may need to be renewed after restarting.

Each new project is one named, self-contained file, such as `Reactor study.pcad`. Equipment, connections, parameters, layout, thermodynamic settings, and revision history autosave into that file. No per-project wrapper folder is required. Browser recovery copies protect unfinished saves.

The Projects sidebar shows connected disk folders. Open a folder to browse its projects and subfolders; **New folder** creates a real directory, and **Create project** uses the folder being viewed. **Rename** renames the file and project title. **Move to folder** writes and verifies the destination before removing the source, retaining project identity and history. An occupied destination is never overwritten. If source removal fails, both complete files are retained, the original save location stays connected, and an error explains where the copy is.

Projects rescan connected folders on startup, when opening the library, when the app regains focus, and with **Refresh projects**. Renaming or moving files or their containing folders in Explorer/Finder is recognized by the project ID inside the document. Autosave never creates a replacement at a missing old path. Use **Locate project** and select the new containing folder when a file moves outside connected folders. If several possible copies exist, the app requires a specific location instead of guessing. A copy discovered on disk receives its own project identity when opened; scanning alone never rewrites files.

Existing `project.json` documents remain readable inside their original folders. Connect their parent folder to discover them. Moving an existing project through the app converts it to a named `.pcad` file and preserves its history. **Export project** and **Export local copy** download complete, independent `.pcad` documents that can be placed into a connected folder and discovered with Refresh.

Local folder access uses the browser's native directory picker in desktop Chrome or Edge on HTTPS or localhost. External changes are detected by rescanning, not by a continuous filesystem watcher. The browser can only discover changes inside folders the user has connected. Existing browser-only projects remain available and can be saved as `.pcad` files with **Save to folder**.

If access is lost or another program changes the file, Project CAD retains browser recovery and offers **Locate project**, **Reconnect folder**, **Retry save**, or **Reload from folder**. Export the local copy before reloading to retain both versions. Successful file saves show the actual filename in the footer. Conflicting external edits are never silently overwritten.

Checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npx playwright test tests/e2e/thermo.spec.ts`.

File checks: `npm test -- tests/project-files.test.ts` and `npx playwright test tests/e2e/project-documents.spec.ts tests/e2e/project-folders.spec.ts tests/e2e/projects.spec.ts tests/e2e/project-home.spec.ts tests/e2e/project-folder-setup.spec.ts tests/e2e/project-trash.spec.ts`. Storage unit tests write actual temporary disk files through a handle adapter. Browser tests replace the native picker with origin-private file-system handles; they verify native streams, persisted handles, and the UI, but do not automate the operating system's picker.

The prebuilt numerical kernel is included. To rebuild Rust with Docker, run `npm run thermo:build`. Model equations, data sources, limits, and the future catalog interface are documented in [docs/THERMODYNAMICS.txt](docs/THERMODYNAMICS.txt).

## 3D graphics and device compatibility

The equipment studio, workspace 3D view, and landing scene prefer WebGPU and automatically fall back to WebGL 2 if WebGPU is unavailable or adapter/device initialization fails. Integrated GPUs are supported; a dedicated NVIDIA/AMD GPU is optional. Public deployments need HTTPS to use WebGPU (localhost also works). Browsers still need either WebGPU or WebGL 2 to display 3D; the 2D workspace remains available without them.

Open **Graphics settings** at the upper right of a 3D equipment view to see the actual backend and browser-reported GPU, or select **WebGL 2 compatibility**. The preference is saved in that browser. Resolution adapts to sustained rendering load and is capped by both pixel density and render-pixel count. Hidden scenes stop continuous animation, stationary equipment reuses its shadows, and liquid effects share shader programs across equipment.

Software/fallback rendering shows a prompt to enable graphics acceleration. If neither API starts, the preview shows the same setup instructions and a retry button without discarding the project. In Chrome/Edge, enable **Settings → System → Use graphics acceleration when available**, then restart the browser. A missing WebGPU adapter alone does not imply acceleration is disabled, so a working hardware WebGL fallback does not show this prompt.

The app requests high-performance graphics, but the browser and OS choose the adapter. On Windows laptops, set the browser to **High performance** in **Settings → System → Display → Graphics**, then fully restart it. Chrome can ignore the website's power preference on Windows; see [Chrome's GPU selection limitations](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips#windows-specific_limitations). The app cannot force NVIDIA or combine integrated and dedicated GPUs.

Graphics checks: `npx vitest run tests/graphics.test.ts tests/equipment-models.test.ts tests/project-plant.test.ts` and `npx playwright test tests/e2e/graphics.spec.ts tests/e2e/equipment-sandbox.spec.ts tests/e2e/plant-workspace.spec.ts tests/e2e/landing.spec.ts`. On Windows, setting `GRAPHICS_CHANNEL=chrome` runs the graphics tests against installed Chrome and requires native WebGPU; `GRAPHICS_NVIDIA=1` additionally requests NVIDIA in that isolated test browser. These test flags do not change the user's browser settings.

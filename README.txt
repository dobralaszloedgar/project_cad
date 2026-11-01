# Project CAD

> **Copyright (c) 2026 László Edgár Dobra. All rights reserved.**
> No reuse license is granted for the original Project CAD code, documentation,
> or assets. Public visibility is not permission to copy, modify, redistribute,
> commercialize, or use this material in another project or for AI training.
> See [LICENSE](LICENSE) for the scope and existing legal/platform rights, and
> [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) for separately licensed material.

Project CAD is a local process-flowsheet demonstration with 2D/3D views and a Rust/WebAssembly thermodynamics kernel.

## Status

Three thermodynamic models are available: ideal gas, ideal solution (Raoult’s law), and Modified UNIFAC 2.0. A six-record sample catalog is included; the full chemical database is future work.

Eight equipment types have setup controls and distinct 2D/3D schematics. Packed-bed reactors support configurable gas reaction sets with reactant/product tables, stoichiometry, per-reaction power laws or general expressions, reversible and inhibition terms, Arrhenius scaling, prescribed pressure drop, and catalyst-mass or target-conversion sizing. Projects support 2–40 catalog components through feeds, reactions, streams, recycling and saved files. Results include species balances, reaction extents and an exportable bed profile. Existing synthetic catalyst-mass and residence-time models remain available. Heaters and coolers accept an outlet temperature or, for ideal gas, a specified duty. The new templates exercise two-feed mixing, heating/cooling and catalyst-bed balances. Equations and limits are in [docs/EQUIPMENT.txt](docs/EQUIPMENT.txt).

## Getting started

From the Project CAD folder, run `npm ci` and `npm run dev`. Open the Raoult’s law separation template to try the liquid models, or the reactor template for synthetic ideal-gas chemistry. Preferences controls the model and sample mixture.

## Project assistant

Open the assistant on the website and choose your agents once. If the companion is already running, **Connect agents** goes directly to approval. Otherwise, download **Project CAD Assistant**, install and open it, then return to connect. Approve the request inside the companion; the website stays open and continues automatically. Only your selected agents appear in the companion. Existing sign-ins are reused, and the website detects completed sign-in automatically.

The assistant has a universal macOS `.pkg`, Windows x64/ARM64 `Setup.exe` installers, and Linux x64/ARM64 `.run` installers. Portable ZIP/tar archives are also provided. Every package includes a private Node runtime. The project connection listens only on `127.0.0.1:43118`. Inline connection approval requires Assistant 0.1.4 or newer; older installations get an update step. The website only offers installers compatible with this flow.

On macOS, open the app in your home folder’s Applications directory. On Windows, open **Project CAD Assistant** from Start; installation uses `%LOCALAPPDATA%\\ProjectCAD\\Assistant` without administrator access. On Linux, run `chmod +x ProjectCAD-Assistant-linux-<architecture>.run` and execute it as your normal user, then open the application menu entry. It installs under `~/.local/share/project-cad-assistant`. Windows and Linux launchers open their private settings screen in the browser on `127.0.0.1:43119`. The settings screen requires a one-use launch ticket and a local session cookie; no control token or API key is sent to the project website.

- **Codex** uses the Codex CLI and its existing sign-in. Choose **Set up** if needed, or **Manage sign-in** to change accounts. Models and reasoning choices come from the installed App Server.
- **Claude Code** uses the Claude Agent SDK and your Claude Code sign-in. Choose **Set up** if needed, or **Manage sign-in** to change accounts. Readiness refreshes automatically in Project CAD.
- **Muse** uses the Meta Responses API with `muse-spark-1.3`. Add your API key in desktop assistant **Settings**. It stays in private local settings and is never exposed to the project website or returned by the settings API.

**Manage agents** in the website changes the saved selection and default after local approval. New chats start with that default; existing conversations retain their original agent and history. Unselected agents are not started for discovery or offered for new chats. Existing native provider installations are reused. When a provider is missing, its setup button downloads a pinned official package, verifies its SHA-512 checksum, and installs it with vendor resources and licenses in `~/.project-cad/assistant/providers/`. Windows uses a private executable pointer without requiring symlink privileges. Sign-in opens the provider’s own command in a terminal. The app offers start/stop, provider setup, website address, logs, and startup-at-login settings. macOS uses the per-user launchd service `com.projectcad.assistant`, Windows uses its per-user Run entry, and Linux uses a desktop autostart entry. Updates and uninstallation preserve settings, provider installs, and conversations.

Choose a provider, model, and **Review changes** or **Read only** before starting a conversation. These settings stay attached to that conversation. Start a new conversation to change them. Stop cancels the current response. Minimizing preserves the conversation and draft; leaving the project disconnects its tools. History is stored separately from project files in `~/.project-cad/assistant/conversations.sqlite` and survives application reloads and companion restarts. Native provider sessions may also be stored by the respective CLI.

The providers can read the current project, inspect supported equipment, validate proposed actions, and run the actual Project CAD solver. They receive the project data needed for those operations. The application validates every proposed action and checks its source revision again before applying it. **Apply reviewed actions** creates a single revision and uses the same folder save and recovery path as manual edits. Neither a model nor the companion writes `project.json` directly. A read-only conversation cannot propose edits. Calculations retain the application's existing scientific limits; the assistant does not add unsupported chemistry or stage-design calculations.

The connector defaults to `https://projectcad.vercel.app`, which is explicitly allowed alongside the configured website and local development at `http://127.0.0.1:3000` / `http://localhost:3000`. For another deployment, enter its HTTPS URL in desktop assistant Settings. Unsupported addresses show a recovery page and report the error to the connecting window. The companion does not include the website; it connects the website to providers on this laptop. The connection token is kept only in the browser session and must be reconnected after the companion restarts. Keep the selected project tab open during tool use. Only one tab can control the assistant for a project at a time.

For source development with Node.js 24 or newer, use `npm run assistant`. Optional `.env.local` configures Muse with `MODEL_API_KEY` and `META_AI_ENABLED=true`. `PROJECT_CAD_APP_ORIGINS` accepts an explicit comma-separated origin list, `PROJECT_CAD_ASSISTANT_DATA` selects the history directory, and `PROJECT_CAD_CODEX_BIN` / `PROJECT_CAD_CLAUDE_BIN` select provider executables. Stop the source companion before starting the installed one on the same port.

Build the macOS app and installer with `npm run assistant:package` on a Mac with Xcode command-line tools. It verifies pinned Node downloads and produces `dist/assistant/Project CAD Assistant.app`, `ProjectCAD-Assistant-macos-universal.pkg`, and a ZIP, with SHA-256 checksums. Generated binaries stay in `dist/assistant/` and are not committed or copied into the website. `npm run assistant:build` builds only the JavaScript payload. Packaging does not install the service on the build machine.

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

## Local project folders

On first opening the app, choose a project folder on your laptop. The app remembers it across visits and uses it for new projects, templates, and duplicates. Change it in **Storage settings**. If browser permission expires, reconnect the remembered folder when prompted.

Open **Projects → Create project** and enter a name. Each project has one self-contained `project.json` in its own named subfolder: equipment, connections, parameters, layout, thermodynamic settings, and revision history all autosave into that single file. Existing folders are never replaced during creation. Browser recovery copies protect unfinished saves; they are not additional project files.

Use **Open project folder** to reopen a folder containing `project.json`, including after clearing browser data. The file uses a versioned `project-cad` JSON envelope. **Templates** and **Duplicate** also let you choose where to create the new project. Renaming a project changes its title inside the file; its folder keeps its original name.

Folder access uses the browser's native directory picker in desktop Chrome or Edge on HTTPS or localhost. Files are written directly to the chosen local folder. Legacy browser projects remain available; JSON import/export still works. Browser permission may need to be renewed when reopening the app.

If access is lost or another program changes the file, Project CAD keeps a recovery copy in this browser and shows **Reconnect folder**, **Retry save**, or **Reload from folder**. Export the local copy before reloading if you need both versions. A successful file save is shown as **Saved to [folder]/project.json**; failures are never reported as saved. The app does not resolve simultaneous edits from other programs automatically.

Checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npx playwright test tests/e2e/thermo.spec.ts`.

Folder checks: `npx playwright test tests/e2e/project-folders.spec.ts tests/e2e/projects.spec.ts`. Storage unit tests write actual temporary disk files through a handle adapter. Browser tests replace the native picker with origin-private file-system handles; they verify native streams, persisted handles, and the UI, but do not automate the operating system's picker.

The prebuilt numerical kernel is included. To rebuild Rust with Docker, run `npm run thermo:build`. Model equations, data sources, limits, and the future catalog interface are documented in [docs/THERMODYNAMICS.txt](docs/THERMODYNAMICS.txt).

## 3D graphics and device compatibility

The equipment studio, workspace 3D view, and landing scene prefer WebGPU and automatically fall back to WebGL 2 if WebGPU is unavailable or adapter/device initialization fails. Integrated GPUs are supported; a dedicated NVIDIA/AMD GPU is optional. Public deployments need HTTPS to use WebGPU (localhost also works). Browsers still need either WebGPU or WebGL 2 to display 3D; the 2D workspace remains available without them.

Open **Graphics settings** at the upper right of a 3D equipment view to see the actual backend and browser-reported GPU, or select **WebGL 2 compatibility**. The preference is saved in that browser. Resolution adapts to sustained rendering load and is capped by both pixel density and render-pixel count. Hidden scenes stop continuous animation, stationary equipment reuses its shadows, and liquid effects share shader programs across equipment.

Software/fallback rendering shows a prompt to enable graphics acceleration. If neither API starts, the preview shows the same setup instructions and a retry button without discarding the project. In Chrome/Edge, enable **Settings → System → Use graphics acceleration when available**, then restart the browser. A missing WebGPU adapter alone does not imply acceleration is disabled, so a working hardware WebGL fallback does not show this prompt.

The app requests high-performance graphics, but the browser and OS choose the adapter. On Windows laptops, set the browser to **High performance** in **Settings → System → Display → Graphics**, then fully restart it. Chrome can ignore the website's power preference on Windows; see [Chrome's GPU selection limitations](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips#windows-specific_limitations). The app cannot force NVIDIA or combine integrated and dedicated GPUs.

Graphics checks: `npx vitest run tests/graphics.test.ts tests/equipment-models.test.ts tests/project-plant.test.ts` and `npx playwright test tests/e2e/graphics.spec.ts tests/e2e/equipment-sandbox.spec.ts tests/e2e/plant-workspace.spec.ts tests/e2e/landing.spec.ts`. On Windows, setting `GRAPHICS_CHANNEL=chrome` runs the graphics tests against installed Chrome and requires native WebGPU; `GRAPHICS_NVIDIA=1` additionally requests NVIDIA in that isolated test browser. These test flags do not change the user's browser settings.

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

Eight equipment types have simple setup controls and distinct 2D/3D schematics. Packed-bed reactors support a synthetic catalyst-mass model with a calculated conversion profile, plus the legacy residence-time model. Heaters and coolers accept an outlet temperature or, for ideal gas, a specified duty. The new templates exercise two-feed mixing, heating/cooling and catalyst-bed balances. Equations and limits are in [docs/EQUIPMENT.txt](docs/EQUIPMENT.txt).

## Getting started

From the Project CAD folder, run `npm ci` and `npm run dev`. Open the Raoult’s law separation template to try the liquid models, or the reactor template for synthetic ideal-gas chemistry. Preferences controls the model and sample mixture.

## Project assistant

Install **Project CAD Assistant** using the package for your operating system and CPU. macOS has a universal `.pkg`; Windows has x64 and ARM64 `Setup.exe` installers; Linux has x64 and ARM64 `.run` installers. Portable ZIP/tar archives are also provided. Each package includes a private Node runtime, so users do not need Node or npm. In the project website, open the assistant, choose **Connect local assistant**, and approve the local connection window. The project companion listens only on `127.0.0.1:43118`.

On macOS, open the app in your home folder’s Applications directory. On Windows, open **Project CAD Assistant** from Start; installation uses `%LOCALAPPDATA%\\ProjectCAD\\Assistant` without administrator access. On Linux, run `chmod +x ProjectCAD-Assistant-linux-<architecture>.run` and execute it as your normal user, then open the application menu entry. It installs under `~/.local/share/project-cad-assistant`. Windows and Linux launchers open their private settings screen in the browser on `127.0.0.1:43119`. The settings screen requires a one-use launch ticket and a local session cookie; no control token or API key is sent to the project website.

- **Codex** uses the Codex CLI and its existing sign-in. Choose **Set up** or **Sign in** in the desktop assistant. Models and reasoning choices come from the installed App Server.
- **Claude Code** uses the Claude Agent SDK and your Claude Code sign-in. Choose **Set up** or **Sign in**, then refresh providers in Project CAD.
- **Muse** uses the Meta Responses API with `muse-spark-1.3`. Add your API key in desktop assistant **Settings**. It stays in private local settings and is never exposed to the project website or returned by the settings API.

Existing native provider installations are reused. When a provider is missing, its setup button downloads a pinned official package, verifies its SHA-512 checksum, and installs it with vendor resources and licenses in `~/.project-cad/assistant/providers/`. Windows uses a private executable pointer without requiring symlink privileges. Sign-in opens the provider’s own command in a terminal. The app offers start/stop, provider setup, website address, logs, and startup-at-login settings. macOS uses the per-user launchd service `com.projectcad.assistant`, Windows uses its per-user Run entry, and Linux uses a desktop autostart entry. Updates and uninstallation preserve settings, provider installs, and conversations.

Choose a provider, model, and **Review changes** or **Read only** before starting a conversation. These settings stay attached to that conversation. Start a new conversation to change them. Stop cancels the current response. Minimizing preserves the conversation and draft; leaving the project disconnects its tools. History is stored separately from project files in `~/.project-cad/assistant/conversations.sqlite` and survives application reloads and companion restarts. Native provider sessions may also be stored by the respective CLI.

The providers can read the current project, inspect supported equipment, validate proposed actions, and run the actual Project CAD solver. They receive the project data needed for those operations. The application validates every proposed action and checks its source revision again before applying it. **Apply reviewed actions** creates a single revision and uses the same folder save and recovery path as manual edits. Neither a model nor the companion writes `project.json` directly. A read-only conversation cannot propose edits. Calculations retain the application's existing scientific limits; the assistant does not add unsupported chemistry or stage-design calculations.

For a deployed application, enter its HTTPS URL in desktop assistant Settings. Local development defaults to `http://127.0.0.1:3000`. The companion does not include the website; it connects the website to providers on this laptop. The connection token is kept only in the browser session and must be reconnected after the companion restarts. Keep the selected project tab open during tool use. Only one tab can control the assistant for a project at a time.

For source development with Node.js 24 or newer, use `npm run assistant`. Optional `.env.local` configures Muse with `MODEL_API_KEY` and `META_AI_ENABLED=true`. `PROJECT_CAD_APP_ORIGINS` accepts an explicit comma-separated origin list, `PROJECT_CAD_ASSISTANT_DATA` selects the history directory, and `PROJECT_CAD_CODEX_BIN` / `PROJECT_CAD_CLAUDE_BIN` select provider executables. Stop the source companion before starting the installed one on the same port.

Build the macOS app and installer with `npm run assistant:package` on a Mac with Xcode command-line tools. It verifies pinned Node downloads and produces `dist/assistant/Project CAD Assistant.app`, `ProjectCAD-Assistant-macos-universal.pkg`, and a ZIP, with SHA-256 checksums. Generated binaries stay in `dist/assistant/` and are not committed or copied into the website. `npm run assistant:build` builds only the JavaScript payload. Packaging does not install the service on the build machine.

Build Windows packages with `npm run assistant:package-windows` and Linux packages with `npm run assistant:package-linux`. These cross builds use Go for native launchers and NSIS for Windows installers, plus verified target-specific Node runtimes. Each target has separate x64 and ARM64 packages. The download manifest retains all built platforms. `npm run assistant:export-downloads` copies the installers, archives, macOS app, checksums, and instructions into a new **Project CAD Assistant** folder in your Downloads directory.

### Public installer downloads

Installers are hosted in [Project CAD downloads](https://github.com/dobralaszloedgar/project_cad/releases). The website serves only the small, checked-in `public/downloads/assistant/downloads.json` manifest. Its buttons use direct, versioned GitHub Release URLs, so installer bytes do not pass through Vercel. No Vercel upgrade or GitHub token in the website is required. `.vercelignore` also excludes locally generated packages from CLI deployments.

For a new release, increment the version in `scripts/assistant/releases.json`, rebuild all three platforms, and run `npm run assistant:publish -- --dry-run`. Configure the external release policy described in docs/RELEASE_CHECKS.txt. Then run `npm run assistant:publish` using the configured repository owner’s GitHub CLI account. Publishing requires committed source already present in that repository. Publishing validates all ten binaries and checksum sidecars, uploads only those files plus release metadata and installation instructions, checks GitHub's stored SHA-256 digests, and publishes the completed draft. Published assets are never overwritten; mismatches require a new version. A failed upload can be resumed with the same command.

After confirming unauthenticated download access, publishing updates the website manifest and removes old generated installer copies from `public/downloads/assistant/`. Include that manifest in the next website deployment. The website build needs neither packaging tools nor release credentials. `npm run assistant:stage-downloads` refreshes the manifest from the already published version without rebuilding or uploading anything. GitHub generates source archives from each release tag. The publisher targets the exact verified source commit.

`npm run assistant:verify-downloads` downloads and hashes every published package without credentials, checking public availability and byte-for-byte integrity against the website manifest.

The local macOS build is ad-hoc signed and is not notarized; Windows installers are unsigned. macOS release builds can supply `PROJECT_CAD_SIGN_IDENTITY` (Developer ID Application) and `PROJECT_CAD_INSTALLER_IDENTITY` (Developer ID Installer); signing, notarization, and distribution are separate release steps. Supported targets are macOS 13.5+, 64-bit Windows 11/Server 2022+, and desktop Linux with glibc 2.28+ (such as Ubuntu 22.04+ or Debian 12+). The Linux package requires `tar`, `xdg-open`, and a terminal emulator for provider sign-in; it does not target Alpine/musl. Cross compiling a Windows installer does not verify runtime behavior on Windows.

Assistant checks: `npx vitest run tests/assistant.test.ts tests/assistant-config.test.ts` and `npx playwright test tests/e2e/assistant.spec.ts`. Browser tests exercise the real companion, project tools, review, and folder writes with deterministic provider substitutes, so they require no API credentials. After packaging, `npm run assistant:verify` checks the native launcher, checksums, current-user package, temporary installation/update, rejected corrupt updates, preserved history, pairing, and provider discovery using the bundled runtime. It exercises a temporary background service only if no existing assistant service or login configuration is present. All test installations are removed; no startup-at-login setting is installed. Live inference must be checked separately.

`npm run assistant:build && npm run assistant:verify-providers` checks fresh provider downloads, checksum verification, preserved vendor resources, executable startup, available sign-in commands, and reuse of installed versions in a temporary folder. This check requires network access and does not sign in or replace the user's tools.

## Local project folders

Open **Projects → Create project**, enter a name, and choose a parent folder on your laptop. Project CAD creates a new folder with that name and a `project.json` file. Equipment, connections, parameters, layout, thermodynamic settings, and revision history autosave into this file. Existing folders are never replaced during creation.

Use **Open project folder** to reopen a folder containing `project.json`, including after clearing browser data. The file uses a versioned `project-cad` JSON envelope. **Templates** and **Duplicate** also let you choose where to create the new project. Renaming a project changes its title inside the file; its folder keeps its original name.

Folder access uses the browser's native directory picker in desktop Chrome or Edge on HTTPS or localhost. Files are written directly to the chosen local folder. Legacy browser projects remain available; JSON import/export still works. Browser permission may need to be renewed when reopening the app.

If access is lost or another program changes the file, Project CAD keeps a recovery copy in this browser and shows **Reconnect folder**, **Retry save**, or **Reload from folder**. Export the local copy before reloading if you need both versions. A successful file save is shown as **Saved to [folder]/project.json**; failures are never reported as saved. The app does not resolve simultaneous edits from other programs automatically.

Checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npx playwright test tests/e2e/thermo.spec.ts`.

Folder checks: `npx playwright test tests/e2e/project-folders.spec.ts tests/e2e/projects.spec.ts`. Storage unit tests write actual temporary disk files through a handle adapter. Browser tests replace the native picker with origin-private file-system handles; they verify native streams, persisted handles, and the UI, but do not automate the operating system's picker.

The prebuilt numerical kernel is included. To rebuild Rust with Docker, run `npm run thermo:build`. Model equations, data sources, limits, and the future catalog interface are documented in [docs/THERMODYNAMICS.txt](docs/THERMODYNAMICS.txt).

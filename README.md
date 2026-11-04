# Project CAD

**A local-first process engineering workspace with 2D flowsheets, interactive 3D views, and deterministic simulation.**

Build a process, define its chemistry, and inspect material and energy balances in one workspace. Project CAD combines a TypeScript flowsheet solver with a Rust/WebAssembly thermodynamics kernel. An optional desktop assistant connects Muse to the current project.

[Quick start](#quick-start) · [Features](#features) · [Development](#development) · [Documentation](#documentation) · [License](#license)

## Features

| Area                         | Capabilities                                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flowsheet editing**        | Connected 2D, 3D, and split views; equipment setup; stream inspection; project history; configurable engineering units.                                                      |
| **Unit operations**          | Feed, product, mixer, splitter, heater, cooler, packed-bed reactor, and distillation.                                                                                        |
| **Thermodynamics**           | Ideal gas, ideal solution using Raoult's law, and Modified UNIFAC 2.0, with verified catalog records saved inside each project.                                              |
| **Reactions and separation** | Configurable gas-phase kinetics, catalyst-mass or target-conversion sizing, FUG shortcut columns, and MESH equilibrium-stage calculations.                                   |
| **Local projects**           | Self-contained `.pcad` files, autosave, revision history, folder organization, and portable exports. Browser storage is available where direct folder access is unsupported. |
| **Project assistant**        | Muse through a local desktop connector, with Auto apply, Review changes, and Read only conversation modes.                                                                   |

Catalog projects support **2–40 components**. Bundled examples include heating and cooling, mixing and splitting, distillation, water–gas shift, catalyst sizing, and methanol synthesis. They include the data needed to run without a configured chemical database or assistant.

Project CAD is an engineering demonstration. Calculations are steady state and subject to the documented model and data limits; 3D equipment is schematic. See [model limits](docs/DEMO_LIMITATIONS.txt), [equipment equations](docs/EQUIPMENT.txt), and [numerical benchmarks](docs/BENCHMARKS.txt).

## Quick start

Use **Node.js 24 or newer** and npm for the development workflow, including the desktop connector. Rebuilding the numerical kernel requires Docker, which supplies the Rust toolchain; a prebuilt kernel is included.

```sh
git clone https://github.com/dobralaszloedgar/project_cad.git
cd project_cad
npm ci
npm run dev
```

Open **[http://127.0.0.1:3000](http://127.0.0.1:3000)**, create a project from a bundled template, and choose **Simulate**. Switch between **2D**, **3D**, and **Split** to inspect the same process.

No environment file is needed for bundled examples. For chemical catalog search, copy [`.env.example`](.env.example) to `.env.local` and configure `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for a populated catalog. Selected chemical records and model parameters are saved with the project for later recalculation. See [configuration](docs/DEVELOPMENT.md#configuration) and [catalog setup](docs/CHEMICAL_CATALOG.txt).

For a local production build:

```sh
npm run build
npm start
```

The development and production scripts bind to `127.0.0.1` by default. The app uses server routes and needs a Next.js server deployment.

## Working with projects

Choose a project folder to save named `.pcad` files directly to disk in desktop Chrome or Edge. Firefox and Safari use browser storage with project export. Projects include the flowsheet, equipment settings, chemical data, layout, and revision history.

Use **Storage** to change the save location or export a backup. Connected folders rescan when the library opens, the app regains focus, or you choose **Refresh projects**. See [project files and recovery](docs/PROJECT_STORAGE.md).

The 3D views prefer WebGPU and fall back to WebGL 2. Integrated GPUs are supported; the 2D workspace remains available when 3D cannot initialize. See [browser and graphics support](docs/BROWSER_SUPPORT.md).

## Project assistant

Open the assistant and choose **Connect assistant**. Install **Project CAD Assistant** for your operating system, open it, approve the website connection, and complete Muse sign-in when prompted. The connector runs locally in the background while the project tab stays open.

New conversations default to **Auto apply**, which validates, applies, and saves changes with revision history. Choose **Review changes** to approve proposals before applying them, or **Read only** to prevent project edits. Connector access defaults to **YOLO**, with device, shell, and web access; **Sandbox** restricts access to scoped text files in the configured CAD projects folder and web tools.

[Installation, permissions, and troubleshooting →](docs/ASSISTANT.md)

## Development

| Command                       | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `npm run dev`                 | Start the local Next.js development server.                    |
| `npm run build` / `npm start` | Build and serve the production app.                            |
| `npm run typecheck`           | Check TypeScript types.                                        |
| `npm run lint`                | Run ESLint.                                                    |
| `npm run format:check`        | Check source, test, and root configuration formatting.         |
| `npm test`                    | Run the Vitest suite.                                          |
| `npm run test:e2e`            | Run Playwright browser workflows; install Chromium first.      |
| `npm run test:browsers`       | Run the Chrome, Edge, Firefox, and WebKit compatibility suite. |
| `npm run test:benchmarks`     | Run numerical regression benchmarks.                           |
| `npm run assistant`           | Start the desktop connector from source.                       |
| `npm run docs:ai-guide:check` | Check the generated assistant guide against its source.        |
| `npm run thermo:build`        | Rebuild and test the Rust/WASM kernel through Docker.          |

Install the browser needed by the default end-to-end suite with `npx playwright install chromium`. See the [development guide](docs/DEVELOPMENT.md) for browser setup, environment variables, focused checks, and kernel builds. Installer packaging and publishing are covered in the [assistant release guide](docs/ASSISTANT_RELEASES.md).

### Technology

| Layer            | Stack                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| Application      | Next.js 16 App Router, React 19, TypeScript                           |
| Process views    | React Flow, React Three Fiber, Three.js                               |
| Simulation       | TypeScript domain solver and Rust compiled to WebAssembly             |
| Persistence      | Local `.pcad` files, IndexedDB recovery, SQLite assistant history     |
| Chemical catalog | Supabase/PostgreSQL; server-side access to immutable chemical records |
| Quality checks   | Vitest, Playwright, ESLint, Prettier                                  |

Exact dependency versions are pinned in [`package.json`](package.json), [`package-lock.json`](package-lock.json), and [`rust/thermo/Cargo.lock`](rust/thermo/Cargo.lock).

### Repository layout

```text
src/
  app/             Next.js pages and server routes
  assistant/       Assistant protocol, project tools, and generated-guide source
  components/      Workspace, equipment, 3D graphics, and assistant UI
  domain/          Project schemas, process solver, reactions, and thermodynamics
  lib/             Storage, project files, exports, and shared utilities
  server/          Chemical catalog and local assistant services
rust/thermo/       Rust numerical kernel and source data
scripts/          Builds, benchmarks, catalog imports, and connector releases
supabase/         Chemical catalog migrations
tests/            Unit tests, numerical fixtures, and browser workflows
public/           App assets, landing media, and assistant download manifest
docs/             Guides, model references, provenance, and validation records
```

Generated installers, local credentials, scratch files, and test reports are ignored. The published assistant download manifest and prebuilt WASM kernel are intentionally tracked.

## Documentation

| Start here                                        | Reference                                                    |
| ------------------------------------------------- | ------------------------------------------------------------ |
| [Getting started](docs/GETTING_STARTED.md)        | First project, templates, simulation, and workspace controls |
| [Development](docs/DEVELOPMENT.md)                | Local setup, configuration, checks, and build commands       |
| [Project storage](docs/PROJECT_STORAGE.md)        | `.pcad` files, folders, migration, and recovery              |
| [Assistant](docs/ASSISTANT.md)                    | Installation, connection, access modes, and history          |
| [Thermodynamics](docs/THERMODYNAMICS.txt)         | Models, parameter ranges, and numerical assumptions          |
| [Equipment](docs/EQUIPMENT.txt)                   | Unit-operation equations and supported limits                |
| [Distillation](docs/DISTILLATION.txt)             | FUG, MESH, and optional tray hydraulics                      |
| [Reaction templates](docs/REACTION_TEMPLATES.txt) | Published kinetics, units, and example processes             |

The [documentation index](docs/README.md) also covers catalog provenance, browser support, release procedures, design notes, and historical validation records.

## License

Copyright © 2026 László Edgár Dobra. **All rights reserved.**

This repository is publicly visible; no reuse license is granted for the original Project CAD code, documentation, or assets. See [LICENSE](LICENSE) for the full terms and existing legal/platform rights. Third-party software, fonts, and chemical data retain their own licenses, documented in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).

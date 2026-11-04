# Development

[Documentation index](README.md) · [Project overview](../README.md)

## Requirements

- **Node.js 24 or newer** and npm for the app and connector workflow. The connector uses Node's built-in SQLite support.
- **Chromium** for the default Playwright suite. Install it with `npx playwright install chromium` after `npm ci`.
- **Docker** only when rebuilding the Rust numerical kernel. The repository includes a prebuilt WASM bundle.
- Native packaging tools only when producing desktop installers; see [assistant releases](ASSISTANT_RELEASES.md).

## Run locally

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). To test a production build, run `npm run build`, followed by `npm start`. Both server scripts bind to loopback by default. Server routes provide simulation and catalog APIs, so deployment needs a Next.js server runtime.

The project pins its dependencies. Use `npm ci` to reproduce the lockfile rather than updating versions as part of an ordinary checkout.

## Configuration

Bundled templates work without an environment file. For optional services, copy [`.env.example`](../.env.example) to `.env.local`, add only the settings you need, and restart the relevant process.

| Setting                         | Used for                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `SUPABASE_URL`                  | Server-side chemical catalog URL.                                                       |
| `SUPABASE_PUBLISHABLE_KEY`      | Read-only catalog RPC access for a populated catalog.                                   |
| `SUPABASE_SECRET_KEY`           | Optional compatibility with older service-role-only catalog installations; server only. |
| `SUPABASE_DATABASE_URL`         | Migration/import tooling, separate from runtime HTTPS reads.                            |
| `CHEMICAL_DATABASE_SSL_CA_FILE` | Root certificate used for PostgreSQL imports.                                           |
| `PROJECT_CAD_APP_ORIGINS`       | Additional website origins accepted by the local connector.                             |
| `PROJECT_CAD_ASSISTANT_DATA`    | Alternate connector settings/history directory.                                         |
| `PROJECT_CAD_MUSE_BIN`          | Custom local Muse executable.                                                           |

The server connects to the configured chemical catalog automatically. Selected records, parameter subsets, and provenance are stored with the project; project documents are not stored in Supabase. See [chemical catalog](CHEMICAL_CATALOG.txt) for data sources and import instructions.

`MODEL_API_KEY`, `META_MODEL`, and `META_AI_ENABLED` configure the **legacy server-side Meta gateway**. Leave it disabled for the normal desktop Muse flow. It is intended for a trusted local server, and is separate from connector sign-in.

Keep credentials in local environment files or the deployment environment. Do not add server secrets to `NEXT_PUBLIC_` variables, committed files, or distributed assistant packages.

## Checks

Run the checks appropriate to the change:

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run docs:ai-guide:check
npm run build
```

`format:check` covers source files, TypeScript tests, and root configuration. Check Markdown separately with `npx prettier --check README.md "docs/*.md"`.

### Browser workflows

```sh
npx playwright install chromium
npm run test:e2e
```

The default Playwright config starts the local development server and runs one worker. Set `PLAYWRIGHT_PORT` to use a separate port. Focus a run by passing a test path, for example:

```sh
npx playwright test tests/e2e/thermo.spec.ts
```

For compatibility coverage, install desktop Chrome and Edge normally, then run:

```sh
npx playwright install firefox webkit
npm run test:browsers
```

The compatibility config accepts `PLAYWRIGHT_BASE_URL` to target an existing production server. Its reports go to `test-results/browser-report`. WebKit coverage exercises Safari's engine rather than the macOS Safari application. See [browser support](BROWSER_SUPPORT.md) for graphics-specific checks.

### Numerical benchmarks and Rust

```sh
npm run test:benchmarks
npm run benchmark:numerical
```

Reference fixtures and the dated comparison results are documented in [benchmarks](BENCHMARKS.txt). The checks establish agreement for the specified cases and equations.

To rebuild the precompiled kernel:

```sh
npm run thermo:build
```

The script uses the pinned Rust Docker image, checks Rust formatting, runs native tests, builds `wasm32-unknown-unknown`, and regenerates the embedded kernel bundle and identity. Ordinary app builds do not require a Rust installation.

### Assistant and generated guide

Run `npm run assistant` in a second terminal. Stop any installed connector already using port `43118`. The website and connector are separate processes; keep the project tab connected during assistant work.

Edit [`src/assistant/guide.ts`](../src/assistant/guide.ts), then run `npm run docs:ai-guide` to refresh [`AI_GUIDE.txt`](AI_GUIDE.txt). Do not edit the generated text independently.

Focused connector checks:

```sh
npx vitest run tests/assistant.test.ts tests/assistant-config.test.ts
npx playwright test tests/e2e/assistant.spec.ts
```

The browser tests use deterministic provider substitutes and need no API credentials. Live inference and native installer verification are separate checks described in [assistant releases](ASSISTANT_RELEASES.md) and [release checks](RELEASE_CHECKS.txt).

## Repository conventions

- Keep application code under `src/`, reusable tooling under `scripts/`, and tests under `tests/`.
- Put published guides in `docs/` and link them from its [index](README.md). The root README is the entry point.
- Preserve license and provenance notices. The prebuilt kernel, reference fixtures, and public download manifest are intentional tracked artifacts.
- Keep credentials, installers, test output, local planning notes, and agent caches out of Git. `.gitignore` explicitly allows published Markdown and the root `AGENTS.md`.
- Follow [`AGENTS.md`](../AGENTS.md) and read the installed Next.js guides in `node_modules/next/dist/docs/` before changing framework code.

Copyright © 2026 László Edgár Dobra. All rights reserved. See [LICENSE](../LICENSE) and [third-party notices](../THIRD_PARTY_NOTICES.txt).

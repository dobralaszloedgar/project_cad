# Assistant packaging and releases

[Documentation index](README.md) · [Assistant setup](ASSISTANT.md) · [Release checks](RELEASE_CHECKS.txt)

These procedures are for maintainers building and publishing the desktop connector. Website deployment and connector installation are separate release steps. The checked-in download manifest must point to verified, compatible installers.

## macOS packaging

Build the macOS app and installer with `npm run assistant:package` on a Mac with Xcode command-line tools. It verifies pinned Node downloads and produces `dist/assistant/Project CAD Assistant.app`, `ProjectCAD-Assistant-macos-universal.pkg`, and a ZIP, with SHA-256 checksums. Generated binaries stay in `dist/assistant/` and are not committed or copied into the website. `npm run assistant:build` builds only the JavaScript payload. Packaging does not install the service on the build machine.

To rebuild on a MacBook, copy or check out the current source including the installer changes. Install Node.js 24 or newer and Xcode command-line tools (`xcode-select --install`) first. Configure the same external release policy at `~/.config/project-cad/release-policy.json` on the Mac, or set `RELEASE_REFERENCE_POLICY_FILE` to its location; the build requires it, and it is kept outside the repository and installers (see [release checks](RELEASE_CHECKS.txt)). Install dependencies on the Mac itself; do not reuse a Windows `node_modules` folder. From the repository directory, run:

```sh
npm ci
npx vitest run tests/assistant-install-cleanup.test.ts tests/assistant-install.test.ts
npm run assistant:package
npm run assistant:verify
open dist/assistant
```

The resulting `ProjectCAD-Assistant-macos-universal.pkg` works on Apple silicon and Intel Macs. Open it to install or upgrade `~/Applications/Project CAD Assistant.app`. Downloading alone leaves your current session running. Installation closes the previous app and waits for its background service and existing session processes to exit before replacing files, including when updating an older connector. An active response is stopped; saved conversations, settings, and project files are preserved. If shutdown cannot complete, installation stops without replacing the existing app. Verification uses temporary installations and checks running upgrades, delayed session shutdown, and removal of obsolete files and previous-version backups while conversation data is preserved. The local build is ad-hoc signed; release signing and notarization are configured separately below.

Close an open macOS Installer window before rebuilding or replacing its `.pkg`. Installer caches the package digest when opened and rejects a changed file with “no software found to install.” For local handoffs, share a separate copy whose filename includes the version and checksum prefix; keep that copy unchanged. macOS controller health checks use plain loopback HTTP because PackageKit can reject the socket QoS operation performed by Node's `fetch` implementation.

## Upgrade behavior

All installers replace the existing application in its usual install folder and remove old application files and leftover `.previous-<UUID>` backup folders after a successful upgrade. Cleanup retries temporary file locks; if an old version remains locked, setup reports a failure so you can close the assistant and rerun the installer. Settings, sign-ins, provider installs, and conversations in `~/.project-cad/assistant` are preserved. Downloaded installers and manually extracted portable copies remain where you saved them.

## Windows and Linux packages

Build Windows packages with `npm run assistant:package-windows` and Linux packages with `npm run assistant:package-linux`. These cross builds use Go for native launchers and NSIS for Windows installers, plus verified target-specific Node runtimes. Each target has separate x64 and ARM64 packages. The download manifest retains all built platforms. `npm run assistant:export-downloads` copies the installers, archives, macOS app, checksums, and instructions into a new **Project CAD Assistant** folder in your Downloads directory.

## Public installer downloads

Installers can be hosted in a public Vercel Blob store belonging to the Project CAD team. The website serves only the small, checked-in `public/downloads/assistant/downloads.json` manifest. Its buttons download installers directly from versioned Blob URLs, without a Vercel login. `.vercelignore` excludes generated packages from website deployments. Blob hosts the downloads; the installed connector and selected agents still run on the user's computer.

For a new release, increment the version in `scripts/assistant/releases.json`, rebuild all three platforms, and configure the external release policy described in [release checks](RELEASE_CHECKS.txt). Set `BLOB_READ_WRITE_TOKEN` in the publishing process environment for the intended public store; do not commit it or expose it to the browser. Run `npm run assistant:publish -- --base-url https://<store-id>.public.blob.vercel-storage.com/project-cad-assistant/v<version> --dry-run`, then repeat without `--dry-run` to upload. Use `--directory <folder>` to publish an already prepared complete release folder. This needs no GitHub sign-in or manual asset dragging.

Publishing checks all ten packages and their checksum sidecars, uploads immutable files, and downloads them without credentials to verify their SHA-256 hashes. It uploads the public manifest last, then updates the local website manifest. A failed upload can be resumed with the same command; a conflicting file requires a new version. Include the updated website manifest in the next deployment to activate the download links. The website build needs neither packaging tools nor release credentials. `npm run assistant:stage-downloads` verifies and stages an already published release without rebuilding or uploading; pass `-- --base-url <versioned-Blob-URL>` to select a new version. Vercel storage and transfer limits apply to these downloads.

Existing GitHub download manifests remain supported. The optional GitHub release publisher is available as `npm run assistant:publish:github`; it requires the configured repository owner's GitHub CLI account and committed source already pushed to that repository.

`npm run assistant:verify-downloads` downloads and hashes every published package without credentials, checking public availability and byte-for-byte integrity against the website manifest.

## Signing and supported systems

The local macOS build is ad-hoc signed and is not notarized; Windows installers are unsigned. macOS release builds can supply `PROJECT_CAD_SIGN_IDENTITY` (Developer ID Application) and `PROJECT_CAD_INSTALLER_IDENTITY` (Developer ID Installer); signing, notarization, and distribution are separate release steps. Supported targets are macOS 13.5+, 64-bit Windows 11/Server 2022+, and desktop Linux with glibc 2.28+ (such as Ubuntu 22.04+ or Debian 12+). The Linux package requires `tar`, `xdg-open`, and a terminal emulator for provider sign-in; it does not target Alpine/musl. Cross compiling a Windows installer does not verify runtime behavior on Windows.

## Verification

Assistant checks: `npx vitest run tests/assistant.test.ts tests/assistant-config.test.ts` and `npx playwright test tests/e2e/assistant.spec.ts`. Browser tests exercise the real companion, project tools, review, and folder writes with deterministic provider substitutes, so they require no API credentials. After packaging, `npm run assistant:verify` checks the native launcher, checksums, current-user package, temporary installation/update, rejected corrupt updates, preserved history, pairing, and provider discovery using the bundled runtime. It exercises running updates under a unique temporary background-service label, including a session process that exits after the old server. It also runs the packaged install script through the actual macOS PackageKit service using a separate test package, temporary destination, data directory, service label, and receipt. The user's installed service is left running. All test installations and the isolated test receipt are removed; no startup-at-login setting is installed. Live inference must be checked separately.

`npm run assistant:build && npm run assistant:verify-providers` checks fresh provider downloads, checksum verification, preserved vendor resources, executable startup, available sign-in commands, and reuse of installed versions in a temporary folder. This check requires network access and does not sign in or replace the user's tools.

Copyright © 2026 László Edgár Dobra. All rights reserved. See [LICENSE](../LICENSE) and [third-party notices](../THIRD_PARTY_NOTICES.txt).

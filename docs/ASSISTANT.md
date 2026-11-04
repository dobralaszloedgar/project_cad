# Project assistant

[Documentation index](README.md) · [Development](DEVELOPMENT.md) · [Packaging and releases](ASSISTANT_RELEASES.md)

Open the project assistant and choose **Connect assistant**. Muse is selected automatically. If the connector is missing, its installer downloads automatically for your operating system; a download link remains available if the browser blocks the automatic download. Open the installer, then Project CAD Assistant. Muse installs automatically when missing and reuses your existing sign-in. Approve the website connection and finish sign-in if prompted. When Muse is ready, the connector returns you to your project automatically and hides its macOS window or closes its browser popup. The connector keeps running in the background.

Chat requires connector **0.1.8 or newer**. In-app connector settings and the automatic return flow require **0.1.10 or newer**. Older compatible connectors can still chat and show an update message for settings. Publish compatible installers before releasing the corresponding website changes; preserve the existing Windows/Linux release metadata when publishing macOS.

## Install the connector

**macOS:** Open `ProjectCAD-Assistant-macos-universal.pkg` and complete installation. Open **Project CAD Assistant** from **Finder → Go → Home → Applications**. Supports Apple silicon and Intel, macOS 13.5 or newer.

**Linux:** In the download folder, run as your normal user:

```sh
chmod +x ProjectCAD-Assistant-linux-universal.run
./ProjectCAD-Assistant-linux-universal.run
```

Then open **Project CAD Assistant** from your application menu. It installs in `~/.local/share/project-cad-assistant`; no sudo is needed. The universal installer selects x64 or ARM64 automatically.

**Windows:** Open the universal Setup.exe, then **Project CAD Assistant** from Start. Installation uses `%LOCALAPPDATA%\ProjectCAD\Assistant` without administrator access. Uninstall from **Settings → Uninstall connector** or Windows Installed apps. Projects, conversations, and sign-ins are preserved.

## Models and conversation modes

The connector exposes only Muse. Models and reasoning levels come from the user's installed Muse catalog, including configured models. It refreshes on connection, focus, and **Refresh models**. Every turn, including resumed chats, reads the current AI guide from the connected website through `get_guide`. The model receives that refreshed guide and a fresh project snapshot before responding.

New conversations default to **Auto apply**: validated CAD changes are applied and saved immediately, with one revision per edit. **Review changes** remains available, and **Read only** conversations cannot edit. Automatic changes use the same revision checks, history, undo, saving and recovery as reviewed edits. Conversation history remains in `~/.project-cad/assistant/conversations.sqlite`. The website offers only Muse and resumes the most recent Muse conversation. Older provider conversations remain available in history as saved, read-only conversations, with a **New Muse conversation** action instead of old provider controls. Historical failures remain expandable without prompting users to reinstall an already updated connector, and saved proposals cannot be applied from those old conversations. These interface changes require a website deployment; installing the native connector does not update the website.

## Connector access and project folder

In the project Assistant panel, choose **Connected → Connector settings** to manage **Connector access** and **CAD projects folder**. Changes save without restarting or reconnecting; finish or stop an active response before changing access. Credentials, website configuration, and startup preferences remain private and unchanged. **Connector access** defaults to **YOLO**, with full device, shell and web access and no tool approval prompts. **Sandbox** exposes only scoped text-file operations in the configured **CAD projects folder**, plus web search/fetch. It has no shell, native file tools, inherited MCP servers or hooks; traversal, symbolic links, junctions and hard links are blocked. The folder defaults to `~/Documents/Project CAD`; set it to the folder where you keep your projects. The browser's folder picker does not expose an absolute path, so this connector setting is separate. Switching mode or folder starts a fresh provider session with recent chat context. Read-only chats always use the restricted tools without file writes.

## Connection and troubleshooting

The service listens on `127.0.0.1:43118`; the Windows/Linux connector window uses `127.0.0.1:43119`. Keep the project tab open and allow local network access when your browser asks. The connector runs in the background; its desktop window does not need to stay visible. Website connection approval remains local: the central **Approve connector** button replaces Return to project while a request is pending. The website never receives the desktop control token or launch ticket. Reopen the desktop assistant for sign-in, logs, website URL, and startup-at-login settings. A pending connection opens the native approval window on macOS, including when the connector started in the background.

## Run from source

For source development, use Node.js 24 or newer and `npm run assistant`. Set `PROJECT_CAD_APP_ORIGINS` for other website origins, `PROJECT_CAD_ASSISTANT_DATA` for another data directory, or `PROJECT_CAD_MUSE_BIN` for a custom Muse executable. Stop any installed connector using the same port first. The [AI guide](AI_GUIDE.txt) is generated from `src/assistant/guide.ts`; verify it with `npm run docs:ai-guide:check`.

Copyright © 2026 László Edgár Dobra. All rights reserved. See [LICENSE](../LICENSE) and [third-party notices](../THIRD_PARTY_NOTICES.txt).

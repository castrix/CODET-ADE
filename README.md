# DAO ADE

An independent desktop workspace for Codex conversations and browser tabs. Projects organize work; conversations do not own tools.

## Run

Requires Node.js 24+, npm, and a locally installed Codex CLI. On Windows, the app also detects the Codex desktop app's bundled CLI. Set `DAO_CODEX_PATH` to an executable path if needed. Native `.exe` is recommended on Windows; shell shim discovery is not implemented.

```sh
npm ci
npm run dev
```

Or build and run:

```sh
npm run build
npm start
```

Open **Connections → Connect** to use the existing local Codex account, or **Sign in with ChatGPT**. Sending the first message also connects automatically. This app does not copy credentials into its workspace store.

## Implemented first slice

- Electron/React/TypeScript desktop foundation; isolated preload and validated main-process IPC.
- Folderless or folder-backed projects, outer tabs, new-tab launcher, conversation navigation.
- Codex App Server integration: account/model discovery, sign-in launch, streaming, persistent thread IDs, resume after restart, interrupt, command/file approval prompts, and explicit failures for unsupported requests.
- Independent native browser views with address/back/forward/reload, persistent Personal profile, and retained live-page state across chat/project switches.
- Companion chat: attach the browser tab group to a turn. Codex can list group tabs, switch between them, and operate newly opened browser tabs. The right panel shows a composer immediately; group tabs inherit the conversation, with a picker to change it. Codex receives screenshots and DOM observations and can navigate, click elements or viewport coordinates, fill text, press keys, scroll, and go back. Disconnect revokes further calls; switching unrelated tabs never expands the attached group.
- Markdown conversation links open new tabs in their source tab group: HTTP(S) pages in browser tabs or local files in a read-only text tab with line navigation (UTF-8/UTF-16, up to 2 MB, including .mq5 files).
- Atomic local workspace persistence, interrupted-turn notices, and preservation of malformed state for recovery.

The initial chat sandbox is read-only with on-request approvals. Standalone terminals and full IDE tabs are **not implemented yet**. Browser actions use experimental Codex dynamic tools. Existing threads created without these tools continue in a new provider thread on first browser attachment (or browser-tool schema upgrade), carrying the latest 24,000 characters of non-system messages; local history and the old thread ID are retained. DOM refs cover the main document; screenshot coordinates can target embedded content. Password entry and file uploads remain manual. Browser hyperlinks and popups open new ADE tabs grouped beside their source; downloads and site permission requests use the browser profile controls described below. Arbitrary browser form state is retained while the page stays alive, not across app restarts.

Workspace metadata/history currently uses a versioned atomic JSON file in Electron's user-data directory; SQLite migration is planned before large-history scaling. Browser cookies use a separate persistent Electron session. Full transcripts are currently rendered and streamed to the shell; virtualization and finer-grained events are planned. Data is local, not encrypted by this application. Closing the app stops its Codex process; closing a chat tab keeps its run/history alive.

Folder-backed projects currently open the launcher and supply their folder as Codex's cwd. They will open an IDE by default when code-server integration is implemented. Folderless chats use the user's home directory.

## Development checks

Use `npm run build` for a concise type/build check when implementation changes warrant it. Follow `AGENTS.md`: do not add tests or test infrastructure unless the user explicitly requests them.

The new browser tool round trip has not yet been exercised with a live model. The Windows development app has previously been opened and exercised, including a real Codex response and resuming its thread after restart. macOS execution and signed installers remain unverified.

## Structure

- `electron/main.ts`: main-process orchestration and validated IPC
- `electron/codex.ts`: supervised JSONL Codex transport
- `electron/browser.ts`: independently owned native browser views
- `electron/workspace.ts`, `electron/store.ts`: state operations and persistence
- `src/main.tsx`, `src/styles.css`: project navigation, tabs, chat, browser companion UI
- `docs/architecture-plan.md`: accepted priority and architecture
- `docs/ide-runtime-research.md`: later code-server integration decision

Development overrides: `DAO_USER_DATA` selects an isolated app-data directory; `DAO_DEV_URL` is set by the dev launcher. Neither is necessary for normal use.

## Browser workspace controls

- Ctrl/Cmd+P opens workspace search for open tabs, chat titles, projects, and saved page history. Enter a URL or search phrase to open it in a new browser tab. Arrow keys and Enter select results; Escape closes the palette.
- Ctrl/Cmd+T creates a tab, W closes the active tab, L opens URL/search, R reloads the browser, and comma opens Settings. These shortcuts also work with focus inside a browser view.
- Right-click browser pages, links, images, editable fields, or tab headers for native context menus.
- Settings uses a category sidebar inspired by T3 Code: General, Appearance, Providers, Browser, and Keybindings. Chat text size, link behavior, and history recording persist. History is bounded to 2,000 unique URLs; Clear history removes saved entries.
- Consecutive tool/activity messages appear in a collapsed Activity disclosure. Copy uses Electron's native clipboard.
- Threads without an attached group receive no browser tool definitions and an explicit per-turn no-browser instruction. Attachment changes continue in a new provider thread with recent context.

Reference: https://github.com/pingdotgg/t3code/blob/main/docs/user/project-settings.md and https://github.com/pingdotgg/t3code/blob/main/docs/user/keybindings.md.

## Browser profile

- Downloads (Ctrl/Cmd+J): native save dialog or configured folder, progress, pause/resume where supported, cancel/retry, open file, and show in folder. Download history persists; interrupted downloads can be retried after restart.
- Site permissions: address-bar access to per-site rules and global defaults, with native Block / Allow once / Always allow prompts. Camera, microphone, location, notifications, clipboard reading, fullscreen, and screen-sharing requests are handled. Reload pages after changing permissions to stop existing access. Screen sharing uses a source picker; system audio capture and USB/HID/serial device selection are not implemented.
- Extensions: Chrome Web Store integration and unpacked extension loading, permission confirmation, enable/disable/remove/reload, options pages, manual updates, toolbar actions, and extension context menus. Enabled extensions are restored at startup.
- Settings: homepage, search engine, default zoom, spellchecking and languages, download location, cookies/site-data clearing, cache clearing, and system/direct/custom proxy configuration. macOS spellcheck languages follow system settings.

Profile settings, permission decisions, extension metadata, and download history are stored in `browser-profile.json` in Electron's user-data directory. Website cookies/storage remain in the persistent browser session. The site-data list currently discovers sites through cookies; it is not a complete storage inventory.

Extension support uses [electron-browser-shell](https://github.com/samuelmaddock/electron-browser-shell). Electron supports only a [subset of Chrome extension APIs](https://www.electronjs.org/docs/latest/api/extensions), so arbitrary extensions are not guaranteed to work. This implementation does not provide Chrome Sync, Chrome's password manager, native messaging, all Chrome settings, or full extension window APIs. Exact Chrome parity would require a different browser runtime strategy.

The Windows build and startup have been checked. Extension installation, permission grants, and macOS behavior have not yet been exercised end to end.


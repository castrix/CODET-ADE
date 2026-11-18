# Hosted IDE runtime decision

Researched 17 November 2026. This is source/documentation research, not a runtime benchmark. No IDE server was installed or executed.

## Decision

Use **code-server as the first supported, separately packaged IDE runtime** inside an independent Electron/React/TypeScript application. Do not fork the native VS Code desktop application. Keep a small `IdeRuntimeAdapter` boundary so OpenVSCode Server remains a possible backend, not a second backend we must implement immediately.

This choice follows platform packaging and integration evidence. It is not a claim that code-server consumes less RAM.

## Verified comparison

| Criterion | code-server | OpenVSCode Server | Implication for CODET-ADE |
| --- | --- | --- | --- |
| Product scope | Hosted Code OSS with additional self-hosting features; upstream code maintained through submodule/patches | Intentionally minimal changes for browser access to VS Code | Both keep the outer application independent |
| Latest stable release returned by GitHub API | `v4.145.2`, published 2026-11-07; release says Code 1.145.2 | `openvscode-server-v1.109.5`, published 2026-02-20 | Pin the chosen version and audit updates; this snapshot alone does not establish abandonment |
| Published assets inspected | Windows amd64, macOS amd64/arm64, Linux amd64/arm64 | Linux x64/arm64/armhf | code-server provides a more direct native Windows/macOS packaging route |
| Full hosted IDE | Workbench plus server-side capabilities | Workbench plus server-side capabilities | Both are substantially more than Monaco alone |
| Workspace routing | Documented `workspace`/`folder` query parameters; routing source inspected | Browser/server architecture; equivalent multi-project lifecycle not established in this research | Start with code-server's documented routing and prove concurrent clients |
| Authentication | Password authentication and origin checks in inspected routes | Explicit connection-token/token-file support; README warns about unauthenticated access | Neither should be exposed unauthenticated merely because it is local |
| Integration conveniences | User-data/extensions directories, proxy controls, health/heartbeat, reconnect settings | Minimal server feature set | code-server reduces some packaging/control work |
| Memory | No comparable measured evidence | No comparable measured evidence | Benchmark active workbenches and extension hosts, not feature count |
| Extension compatibility | Open VSX/permitted VSIX; compatibility varies | Bundled extensions/Open VSX ecosystem; compatibility varies | Neither guarantees Microsoft's proprietary desktop services |

Evidence:

- [code-server release](https://github.com/coder/code-server/releases/tag/v4.145.2), [release API with asset names](https://api.github.com/repos/coder/code-server/releases/tags/v4.145.2).
- [OpenVSCode Server release](https://github.com/gitpod-io/openvscode-server/releases/tag/openvscode-server-v1.109.5), [release API with asset names](https://api.github.com/repos/gitpod-io/openvscode-server/releases/tags/openvscode-server-v1.109.5).
- [code-server FAQ source](https://github.com/coder/code-server/blob/v4.145.2/docs/FAQ.md), [route implementation](https://github.com/coder/code-server/blob/v4.145.2/src/node/routes/vscode.ts), [CLI options](https://github.com/coder/code-server/blob/v4.145.2/src/node/cli.ts).
- [OpenVSCode Server scope, installation, authentication](https://github.com/gitpod-io/openvscode-server/blob/main/README.md).

The inspected code-server Windows archive is about 217 MB compressed and macOS archives are about 215–234 MB compressed. This is disk/download size, not memory use. Native builds still require a packaging smoke test; existence of an archive is not proof that our embedding, terminal, debugger, and extension workloads work.

## What “full IDE” means here

Explorer, editor, workspace search, Git integration, tasks, debugging, integrated terminal, settings, keybindings, and compatible extensions run in a hosted workbench. Node-based workspace extensions execute in the backend, which is local to the user's machine even though VS Code calls this a remote extension-host architecture. Web extensions can run in browser workers. A browser workbench does not acquire the native desktop local extension host merely by being shown inside Electron.

Some desktop-only extensions, authentication callbacks, native dialogs, platform-specific debuggers, and proprietary extensions may need substitutes or integration work. Validate the actual desired extension set. [Extension host architecture](https://code.visualstudio.com/api/advanced-topics/extension-host).

For MT5, native Windows code-server keeps file paths and commands on Windows. Do not require WSL/Docker as a hidden default; doing so would move tools into a Linux environment and complicate MetaEditor invocation. macOS source editing remains supported independently of how MT5 compilation is provided.

## Multi-project topology

Recommended first topology: one lazy server per local execution environment and IDE profile, serving separate workbench clients for separate project folders. Each project has a stable resource ID and encoded folder/workspace URL. Chat tabs refer to that resource and never create another workbench.

This shares the server listener/runtime overhead; it does not share a single extension host or working-copy model across all projects. Each live workbench can create its own extension processes, language servers, watchers, and PTY sessions. Independent project UI is not filesystem sandbox isolation: all local processes normally run as the same OS user.

Concurrent projects and their extension-host separation must be validated before shipping. Use one lazy server per active workspace context as a correctness fallback if shared routing/state proves unsuitable. That fallback costs more RAM but does not change the independent application architecture. Different IDE profiles or execution environments already warrant separate servers.

Do not give concurrently running servers the same writable user-data directory. Within a shared server, global settings/extensions are intentionally shared; workspace settings/state remain scoped. Serialize extension install/update operations. Use immutable versioned extension bundles or explicit copies for separate profiles rather than assuming concurrent writable extension directories are safe.

## Embedding boundary

Use a dedicated Electron `WebContentsView` for each live IDE workbench, loading the authenticated loopback service as its top-level document. The React shell lays it out beside chat. This avoids nesting the complete IDE in an application iframe, but the IDE's own extension webviews still require testing.

No Node integration or general privileged preload in IDE/browser pages. A bundled workspace extension communicates with an authenticated local bridge over a narrow protocol. The extension reports workspace identity, document versions, diagnostics, tasks/debug sessions, and dirty state, and applies edits through public VS Code APIs. Lifecycle details unavailable through public APIs must be treated conservatively or handled through a small documented runtime patch; do not rely on DOM scraping or private commands as a stable API.

The shell handles external links, popup windows, OAuth callbacks, downloads, file pickers, focus, resize, and shortcuts explicitly. IDE and arbitrary browsing use separate Electron sessions. Bind the service to loopback, use a random secret, keep origin checks, and establish an authenticated session without placing reusable credentials in visible URLs/logs. Validate HTTP and WebSocket authentication together.

## Lightweight operation and honest suspension

- Saved projects/history tabs: no server/workbench process until needed.
- Start with one visible and one warm workbench; protected tasks and explicit pins may exceed the cache budget.
- Hide/throttle a view for fast switching; destroying it may lose frontend buffers and does not necessarily terminate backend sessions immediately.
- The inspected code-server default reconnect grace is 10,800 seconds. Closing a view must not be advertised as immediate backend memory reclamation.
- Heartbeat records browser connections, not whether a terminal/debugger/extension is safely idle. Do not use heartbeat alone to stop a server.
- Measure session cleanup after disconnect and grace expiry. Shorten grace only after reconnect/task tests. Never kill a shared server while another workspace uses it.
- Dirty documents keep their view alive until safe backup/restore has been demonstrated. Do not claim arbitrary extension state can be serialized.
- Standalone ADE terminals use a separate supervised PTY manager, so IDE server suspension cannot terminate them. IDE-integrated terminals remain server-owned. They are not transparently interchangeable in v1.

## Validation before implementation commitment

Use the same representative projects/extensions on native Windows x64 and macOS arm64. Compare empty shell, one/two/five live workbenches, twenty dormant projects, three terminals, a streaming agent, and repeated view close/reopen cycles. Record entire process tree, CPU, memory, cold/warm latency, child-process cleanup, and installer size.

Acceptance includes native PowerShell/zsh, paths with spaces/non-ASCII, `.mq5` encoding/save, independent folder settings and Git state, debugger/task survival, extension webviews, browser/terminal chat independence, unsaved edits, server crashes, auth callbacks, WebSockets, and context-target correctness. Test OpenVSCode Server with an equivalent available platform if needed to investigate a code-server limitation; do not make both backends a delivery requirement.

Promote the code-server choice from proposed to validated only after these tests. If native Windows packaging fails, revisit that blocker explicitly rather than silently adding a VM or claiming compatibility.

## Implemented IDE integration (17 November 2026)

- Native code-server 4.145.2, installed with `npm run setup:ide`. Windows x64, macOS arm64/x64, and Linux archives are selected by platform. `DAO_IDE_RUNTIME` can override the extracted runtime directory. Packaged apps must ship `.runtime` under Electron resources; installer packaging is not implemented yet.
- One lazy, password-authenticated loopback server with random port/secret; separate nonpersistent Electron IDE session. No general preload or Node integration in IDE views. Settings/extensions live under ADE user data.
- A folder project gets an IDE tab on creation and an IDE entry in its tree. One retained workbench per project; selecting a historical chat does not create an IDE process. Independent project workbenches share the server and global settings/extensions.
- Codex chat can be expanded beside the workbench. Chat uses the project folder through the existing Codex integration; selection, dirty buffers, diagnostics and task state are not yet bridged through a workspace extension.
- Hidden workbenches stay alive to preserve edits. No automatic eviction or promise of memory reclamation. Closing a tab asks users to save; exiting with an IDE asks before stopping the runtime. Changing a folder requires closing that project's IDE tab first.
- IDE keyboard shortcuts belong to the workbench. External HTTP links open grouped ADE browser tabs. Existing workspace trust remains enabled; users decide whether to trust a folder for tasks/debugging.
- Verified: TypeScript/build, native Windows binary startup, authenticated embedded workbench and actual Windows folder listing. macOS execution, multiple concurrent extension hosts, saves, terminals and debugger/extension compatibility remain unverified. No tests added.

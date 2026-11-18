> Current decision (17 November 2026): the full code-server workbench below is superseded by the user-requested Monaco editor, local language servers, filesystem explorer and Git UI. The outer sidebar contains projects/conversations, never IDE shortcuts. Ctrl+P searches project files and opens them in editor tabs; chat stays beside the editor. See `editor-integration.md` for implemented scope. Historical runtime research remains below for context.

> Implemented additions (17 November 2026): ACP provider connectors and standalone node-pty/xterm terminal tabs. Windows profiles include PowerShell, Command Prompt and installed WSL distributions; macOS discovers login shells. See `provider-connectors.md` and `terminal-integration.md` for current behavior and limitations.

# DAO ADE: full IDE and independent work tabs

Project verification rule: do not write tests or add test infrastructure unless explicitly requested. Use concise build/manual checks and prioritize implementation, as specified in `../AGENTS.md`. References below to acceptance tests describe behavior to inspect, not authorization to create automated tests.

Research date: 17 November 2026. Status: revised proposed architecture, before implementation. This revision replaces the native Code OSS application fork with an independent application and hosted IDE runtime. See [runtime comparison and evidence](ide-runtime-research.md).

## 1. Product decision

Build an independent Electron + React + TypeScript desktop application. Package code-server as a separately versioned local IDE runtime, displaying its full hosted workbench inside IDE tabs. The application owns projects, work tabs, conversation navigation, browser instances, and standalone terminals. Target native Windows and macOS first; do not require Docker or WSL. Code OSS remains a transitive IDE foundation, not the application we fork.

The application owns projects and resources. Tabs display resources. Conversations can reference resources but never own their lifetime. A conversation is history plus agent state, not the container for the user's work.

“Lightweight” means saved projects, history, and inactive tabs do not each start an IDE or agent process. It does not mean unlimited simultaneously running language servers, Chromium pages, and shells have negligible cost.

## 2. Research findings and reference map

The following source snapshots were inspected, not built or benchmarked:

| Project | Inspected revision | Useful reference |
| --- | --- | --- |
| Code OSS | `04b33e0a3a8eff7ab51b6c847f65d9fc8ff07a6b` | Full workbench, native extension hosts, native browser services, PTY host |
| T3 Code | `a5c28da6c8bf676e49bf285765fb5e51ae2c8c71` | Terminal lifecycle and browser identity; Codex adapter also inspected at earlier `e9d5bae5cf2846da8a4b035052de0a4faabb5fbd` |
| Orca | `2f17e24a18db3d0c187d0910bbc2e9e144274d0d` | Browser visibility, idle discard, process/UI separation |

### Hosted IDE selection

Choose code-server first; retain an adapter boundary for OpenVSCode Server. This is a packaging/integration decision, not a measured memory advantage. GitHub's latest stable release API returned code-server v4.145.2 with Windows x64 and macOS x64/arm64 archives, while OpenVSCode Server v1.109.5 listed Linux archives. Sources, dates, caveats, and the comparison matrix are in [IDE runtime research](ide-runtime-research.md).

Both provide a full browser workbench with backend capabilities rather than only an editor widget. Browser-hosted extension compatibility is not identical to the desktop local extension host. Validate extensions, debugging, tasks, webviews, file access, and native shells. Use upstream distributions without source patches initially, plus a bundled IDE bridge extension.

The earlier native Code OSS browser/PTY sources remain architectural references only. Do not import its native window lifecycle into the ADE shell. Standalone browser and terminal resources belong to ADE; IDE-integrated tools remain owned by code-server unless deliberately bridged later.

### T3 Code

- The inspected Codex adapter launches and initializes App Server, starts/resumes threads, starts/interrupts turns, and converts native events and approvals into its provider model. Adopt this integration pattern, not its entire orchestration framework. [Codex adapter](https://github.com/pingdotgg/t3code/blob/e9d5bae5cf2846da8a4b035052de0a4faabb5fbd/apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts).
- Its browser runtime ID includes environment ID, thread ID, server epoch, and tab ID. This is precisely the dependency DAO ADE must avoid: browser identity will use a stable resource ID independent of chat. [Browser identity](https://github.com/pingdotgg/t3code/blob/a5c28da6c8bf676e49bf285765fb5e51ae2c8c71/apps/web/src/browser/previewRuntimeTabId.ts).
- Its terminal manager includes bounded history, debounced persistence, process inspection, and inactive-session limits. Use those as reference requirements; do not inherit thread ownership. [Terminal manager](https://github.com/pingdotgg/t3code/blob/a5c28da6c8bf676e49bf285765fb5e51ae2c8c71/apps/server/src/terminal/Manager.ts).

### Orca

- Orca's package manifest includes Electron, React, Monaco, and terminal packages. It is a useful reference for tool composition, not evidence that embedding a full Code OSS workbench is already solved. [Manifest](https://github.com/stablyai/orca/blob/2f17e24a18db3d0c187d0910bbc2e9e144274d0d/package.json).
- Its idle-discard scheduler tracks browser visibility, uses an awake-time clock, checks generations to reject stale operations, and bounds concurrent discard requests. Reuse these principles. [Idle discard implementation](https://github.com/stablyai/orca/blob/2f17e24a18db3d0c187d0910bbc2e9e144274d0d/src/main/browser/guest-lifecycle/browser-page-idle-discard.ts).

## 3. User interaction contract

### Projects

- The sidebar contains any number of saved projects, with search, pinning, and recent ordering. Do not impose a small product limit.
- A project may have a folder, a multi-root workspace, or no filesystem root.
- Creating/opening a folder-backed project creates its default IDE tab and focuses it. Restoring the app recreates inactive project records lazily; it does not start every IDE.
- A folderless project starts with a lightweight overview/new-tab surface and supports chat, browsers, and explicitly located terminals.
- A project may contain several repositories. Git is optional.
- Adding a folder later creates the default IDE without moving or resetting existing browsers or chats.
- Worktrees are optional execution contexts, never automatically created for every conversation.

### Sidebar conversations

- Each project has searchable, paginated conversation history. Global search can span projects.
- “New chat” opens a new top-level work tab with chat focused. Creating an empty chat tab need not start Codex; the provider thread can be created on first send.
- A new chat inherits the selected project as its default context. It gets shortcuts to that project's IDE, changes, and attached tools without instantiating another IDE.
- Clicking history focuses an already open view of that conversation; otherwise it opens a chat tab and resumes the conversation when needed.
- Archiving a conversation removes it from the default history view; it does not close browser resources, stop terminals, or delete files.

### Top-level new tab

The plus button opens a launcher: Chat, Browser, Terminal, IDE/Open Folder, Changes, and subsequently registered tools. The launcher shows the target project and lets the user change it or choose Personal/unassigned.

Suggested shortcuts: Ctrl/Cmd+T opens the launcher; a dedicated new-chat command opens chat directly; Ctrl/Cmd+W closes the currently focused outer tab only when outer-tab focus is active. Preserve normal editor file-close behavior when focus is inside the IDE. Provide explicit commands for both levels and resolve keybinding conflicts in the prototype.

### Every tab can chat

- Browser/terminal/IDE tabs have a Chat toggle opening a companion pane. No conversation is created until the user chooses one or sends a message.
- Users can start a conversation or attach an existing one. A session may be shown in more than one view, but messages and active-run state have a single authority.
- The composer shows the exact project, files/selections, browser page, terminal output, and enabled tools being supplied.
- Switching focus does not silently retarget an active run. Each run captures immutable resource references; later attachment changes apply to the next turn unless explicitly steered.
- Conversation-specific tools are scoped grants, not owners of browser/terminal resources.

### Tab composition

Use one outer tab strip and ordinary IDE file tabs inside the IDE. Outer tabs can have split panes: chat + IDE, browser + chat, terminal + chat, or diff + editor.

The default is one live workbench per project workspace context. Multiple chat tabs reference that runtime. If two tabs request the same IDE, focus/rehost its existing view; do not duplicate an entire workbench. For simultaneous file views use native editor splits. Simultaneous duplicate full-workbench views are outside v1.

Closing a tab detaches a view. Stopping a terminal, closing a browser resource, stopping an agent, and removing a project are separate operations. Resources with no remaining view or active lease become eligible for cleanup; they must not leak indefinitely.

## 4. Independent application and hosted IDE architecture

Use Electron for the desktop shell, React/TypeScript/Vite for application UI, SQLite for application metadata, Electron WebContentsView for browser and IDE surfaces, and xterm.js/node-pty for standalone terminals. Package code-server and its matching Node/native dependencies separately from Electron; never assume Electron's native-module ABI is compatible with the server bundle.

```text
DAO ADE Electron application
  React shell: projects, outer tabs, launcher, chat, layouts
  Application services: resources, persistence, permissions
  Browser manager: independent pages and profiles
  Standalone PTY manager: terminals independent of the IDE
  Agent manager: Codex adapter and scoped tool bridge
  IDE runtime adapter
    Lazy local code-server (per execution environment / IDE profile)
      Project A workbench client + workspace extension processes
      Project B workbench client + workspace extension processes
    Saved projects C..N: metadata only
```

Default proposal: share one server across trusted local project workbench clients using explicit folder/workspace URLs. This shares server overhead, not all extension hosts, language servers, or document models. Do not merge projects into one multi-root workspace. Different profiles/environments use separate servers; if shared-server project behavior fails validation, use lazy per-workspace servers with separate writable user-data directories.

Keep one workbench resource per workspace context. Multiple chat tabs reference it; moving it between layouts preserves its WebContentsView. Do not navigate a single live IDE back and forth between folders on every tab switch. Saved/inactive projects do not start views or servers.

### IDE host and bridge

Load the authenticated loopback IDE URL as a top-level document in a dedicated WebContentsView. Keep the shell and chat outside it. Handle focus, native view bounds, menus, shortcuts, external links, popup/OAuth flows, downloads, and file dialogs explicitly. The complete IDE is not nested in an application iframe, although extension webviews still need integration tests.

Define `IdeRuntimeAdapter` operations for ensureServer, openWorkspace, attachView, detachView, getActivity, requestSuspend, stopServer, and recover. Keep provider/session-specific IDs behind this interface. There is no assumed public per-workspace shutdown API: requestSuspend may refuse when state cannot safely be released.

Bundle a workspace extension using public VS Code APIs for document versions/selections, diagnostics, edits, task/debug activity, and explicit workspace identity. It connects to an authenticated local bridge. Project identity must be validated from actual workspace roots plus a short-lived binding handshake, never inferred from the focused chat.

Bind servers to loopback, retain authentication and origin validation, and establish a session with a generated secret without exposing credentials in URLs or logs. Authenticate WebSocket upgrades as well as HTTP. IDE content gets neither Node integration nor a broad application preload. Separate its Electron session from arbitrary browser pages. Keep workspace trust enabled.

### Validation checkpoint

Prove two projects in separate views of a shared server retain independent roots, editor state, settings, Git repositories, terminals, tasks, and extension instances. Test native Windows and macOS packages, dirty-buffer recovery, server disconnects, extension webviews, debugger behavior, keyboard/IME handling, and OAuth callbacks. If a requirement fails, compare per-workspace servers before changing the application architecture.

This replaces the earlier plan to refactor native VS Code window ownership. Research supports the hosted approach but does not constitute a successful embedding or performance benchmark.

## 5. Data model and ownership

| Record | Important fields | Lifetime |
| --- | --- | --- |
| Project | ID, name, roots, profile, trust, default IDE tab | Persistent |
| Workspace context | Project ID, roots/worktree, settings identity | Persistent; runtime lazy |
| Work tab | ID, optional project ID, layout, active pane | Persistent metadata |
| Pane | Kind, resource reference, presentation state | View |
| Resource | Stable ID, type, optional context ID, generation, state | Independent of views/chats |
| Conversation | ID, project ID, provider, native thread ID, title | Persistent |
| Context binding | Conversation ID, resource ID, capability, scope | Revocable |
| Agent run | ID, conversation ID, captured context, status | Execution |
| Resource lease | Resource ID, owner/run, protected reason | Temporary |

Store application metadata and indexed chat history transactionally in SQLite. Retain Code OSS's own workspace state and working-copy backups; do not introduce a competing owner for editor buffers. Browser cookies live in Electron profiles, and credentials use OS-backed storage. Large terminal logs/attachments are bounded files referenced by metadata.

Use generation numbers to reject commands aimed at destroyed/recreated resources. A resource ID alone must not authorize access. Backend methods validate the run, binding, and current generation.

## 6. Browser implementation

Implement the application-owned browser manager using Electron WebContentsView; use Orca and Code OSS browser code as references, not runtime dependencies. Support address/navigation controls, back/forward, reload, find, downloads, popups, devtools, and persistent profiles. Default to a Personal profile shared across ordinary browser tabs; offer project profiles and private sessions explicitly. Profile selection is independent of conversation selection.

Pages run without Node integration or the privileged application preload. Reuse narrow IPC and existing permission handling. External URLs and popups must not inherit local filesystem or shell authority.

Expose page text/selection, screenshot, and later navigation/click/type tools against the visible resource. Read access and control access are separate capabilities. Serialize competing agent control of a page; user interaction can pause agent control. Do not launch an invisible duplicate browser for agent actions.

Persist URLs and supported navigation metadata. A discarded page reloads: arbitrary page JavaScript state and forms cannot be guaranteed to survive. Protect pages with active agent leases, media/capture, downloads, known unsaved state, or explicit “keep active.” Conservative protection is necessary because unsaved web state is not always detectable.

## 7. Terminal implementation

Standalone terminal tabs use ADE-owned xterm.js and a supervised node-pty process service. A terminal ID is independent of chat and view location. IDE-integrated terminals remain code-server-owned; do not expose the same PTY through two competing managers. Transparent movement of an integrated IDE terminal into an outer tab is deferred; users can open a new standalone terminal in the same directory. Label ownership and cwd clearly. IDE server suspension must not stop standalone terminals.

Each terminal records shell, cwd, environment profile, dimensions, process state, and bounded scrollback. Folder-backed projects default cwd to their folder; folderless projects show the chosen cwd before launch.

Unmount hidden terminal renderers while keeping their processes alive. Throttle hidden output delivery and maintain bounded buffers with explicit truncation markers. Resizing follows the controlling visible view. Serialise human/agent input and require an explicit grant before an agent writes to an existing interactive terminal.

Closing the last view offers keep running or terminate when a command is active. Do not automatically kill background builds to meet a memory budget. App restart may restore terminal history and launch configuration, but cannot promise to restore a lost process; UI reload and full application exit are different cases.

## 8. Full IDE and Codex bridge

Provide explorer, text editing, search, SCM/diffs, debugger, tasks, settings, keybindings, extension management, and compatible server-side Node/web extension hosts through code-server. This is a full hosted IDE, not a promise of every native desktop-only extension or service. Unknown text files always have plain-text fallback. Verify `.mq5`/`.mqh`, encodings/BOMs, line endings, file watching, external changes, and crash recovery.

MQL syntax support and MetaEditor compile tasks are additional integrations. Cross-platform source editing does not imply native MT5 compilation on macOS.

Start with a Codex adapter using App Server over stdio. Generate types from the supported binary, negotiate/check capabilities, preserve provider thread IDs, and support initialize/start/resume/stream/approval/interrupt/reconnect. App Server is an external process supervised independently of the chat pane. [Official protocol](https://developers.openai.com/codex/app-server).

Define a narrow provider interface: availability/auth status, models, create/resume conversation, send/steer/interrupt turn, events, approvals, and tool bindings. Include capability flags; do not assume every provider can steer or use identical tools. Start Codex lazily and bound idle processes rather than spawning one per historical conversation.

The IDE bridge exposes document URI/version, selection, unsaved text, diagnostics, diff references, and task results. An agent patch against an unsaved document must carry an expected version and use working-copy edits. Codex's native filesystem writes can bypass that bridge: detect external changes, retain dirty buffers, and present reconciliation rather than overwriting. The bridge alone cannot guarantee all provider edits use editor transactions.

Two runs writing the same project need conflict handling. Initially allow one mutating run per workspace context, with concurrent read-only chats. Offer explicit worktree isolation for parallel editing later. Git mutations use repository-level serialization, with discard/reset requiring deliberate user action.

## 9. Keeping it lightweight

### Resource states

| State | Meaning |
| --- | --- |
| Metadata only | Saved project/tab/history; no runtime |
| Active | Visible or doing protected work |
| Warm | Hidden runtime retained for fast return |
| Suspended | Recoverable view/process state saved; eligible runtime stopped |
| Stopped | Explicitly closed process/resource |

Initial tunable policy: one visible workbench and at most one additional unprotected warm workbench per window, with the local IDE server shared when compatible. This is a prototype default, not a permanent project limit. Runtime pins override automatic eviction and make their cost visible.

Never evict a project with a running debug session, task, active agent write, unresolved approval, or unrecoverable dirty state. Some extensions run background work that is difficult to classify; begin with conservative suspension and explicit “keep running.” Suspension may restart extensions on resume and must not claim transparent preservation of arbitrary extension state. Closing a frontend does not prove backend reclamation: inspected code-server defaults to a 10,800-second reconnect grace. Measure cleanup, negotiate conservative grace settings, and never stop a shared server while other workspaces use it. Heartbeat indicates connections rather than safe task idleness. Dirty documents pin their view until backup/restore is demonstrated. Track renderer retention and backend retention separately.

Use Orca's visibility/deadline/generation approach for browser idle reclamation. Keep terminal PTYs separate from renderer retention. Virtualize long transcripts and project/history lists; subscribe only to visible data; coalesce token/output updates; use event-driven file/Git refresh with bounded fallback polling.

Adding a dormant project or opening a historical chat must not create a workbench, watcher tree, language server, browser renderer, or provider process. Memory should scale mainly with active resources, not saved inventory.

### Measurements and proposed gates

Benchmark release builds on documented Windows and macOS machines. Measure whole-process-tree private memory/RSS appropriately per platform, CPU, startup, warm switch latency, cold project resume, leaked handles, and background output throughput. Do not compare cross-platform memory metrics as identical.

Scenarios: empty shell; one medium project; 20 saved projects with one active; 100 history tabs represented lazily; 10 browser tabs with only two active; three running terminals; one streaming Codex run; repeated open/close cycles.

Provisional targets, to validate in the initial hosting checkpoint: warm outer-tab switching p95 below 100 ms; incremental shell/service overhead below 150 MB relative to the same hosted workbench workload (measure total footprint separately); dormant project/history inventory adds no child processes; retained memory settles after repeated resource closure. Set cold-start and cold-resume budgets from measurements rather than inventing universal timings.

Include an internal resource inspector showing projects, pages, terminals, extension hosts, agents, memory samples, and why a resource is protected from suspension.

## 10. Distribution and dependency strategy

Ship an independently branded Electron app using its own build/update pipeline, with code-server as a pinned runtime artifact rather than a fork of the desktop application. Package the selected Windows x64 and macOS arm64/x64 runtime, matching Node/native libraries, notices, integrity metadata, and the bridge extension. No end-user compiler, global npm installation, Docker, or WSL should be required for the normal installer.

Current release assets provide a route, not verified packaged compatibility. Test code-server natively on Windows with PowerShell and Windows paths and on macOS with zsh and OS filesystem permissions. Keep Electron and server native dependencies independently built/signed. macOS nested executable signing/notarization and Windows process-tree termination are release acceptance cases.

Use Open VSX and permitted VSIX installation. Microsoft's FAQ restricts Marketplace access for alternative products, including forks; full workbench support is not access to every proprietary extension/service. [Microsoft FAQ](https://code.visualstudio.com/docs/supporting/faq), [Open VSX](https://github.com/eclipse-openvsx/openvsx).

Maintain a tested extension matrix for languages, debuggers, themes, Git, and MQL. Treat remote SSH/WSL/dev containers and Microsoft settings sync as separately scoped capabilities. Share global settings intentionally within an IDE profile; isolate different profiles and serialize extension updates. Never let separate servers concurrently mutate the same user-data directory.

The adapter and bridge extension should absorb upstream differences. If a patch becomes necessary, maintain a small reviewed patch set against code-server, not an application-wide Code OSS fork. Verify licenses before redistributing/copied code, preserve notices, audit dependencies, and test upstream security releases against a stable compatibility suite. Maintain independent ADE/runtime version records and rollback-capable updates with backed-up data migrations.

## 11. Continuous implementation sequence and acceptance checkpoints

Priority: Codex, chat, and the independent browser precede the full IDE. These checkpoints order work toward one complete product; they are not approval stops or separate products. Independent ownership and lazy startup are requirements from the first implementation.

### 1. Independent app foundation

Initialize Git and build Electron + React + TypeScript. Implement projects, outer tabs, new-tab launcher, conversation/resource identity, local persistence, and IPC boundaries. Folder-backed projects initially store their folder and open the launcher; their default IDE tab becomes available when the IDE integration lands. Do not ship a fake IDE placeholder as a functioning editor.

Exit: projects and tabs restore; new chat/browser views are independent; future terminal/IDE choices are visibly unavailable until implemented.

### 2. Codex and conversation history

Connect to local Codex App Server. Implement account status/sign-in, streaming, new conversations, persisted thread IDs, resume, cancellation, approvals, and error/disconnect handling. Sidebar New Chat opens a chat-focused outer tab. Historical conversations can reopen without duplicating provider threads.

Exit: real provider handshake and one complete chat turn work; view switching does not interrupt a run; unsupported provider requests fail explicitly rather than hang or silently approve.

### 3. Independent browser tabs and companion chat

Implement native browser views, address/navigation controls, persistent browser profile, page errors, and chat alongside browsers. Browsers have stable resource IDs independent of conversation history. Users can create or attach a project conversation and explicitly attach captured page text.

Exit: navigate a page, type into a form, switch chats/projects, return to the same live browser and preserve its state. Closing a chat never closes the browser. Test restart metadata/profile recovery separately from live-page state.

### 4. Browser–agent control

Add scoped tools for the exact visible browser resource: page inspection, screenshots, navigation, and interaction. Capture resource bindings per turn, use generations/leases, arbitrate user/agent control, and display tool activity. Page-text attachment alone is not live browser automation.

Exit: Codex acts on the attached visible page; detached/stale grants fail; switching tabs does not redirect control. Add browser permissions/download/popup UX as supported capabilities.

### 5. Standalone terminals

Add supervised native shells, bounded output, persistent view-independent PTYs, and companion chat. Connect explicit terminal read/control tools without merging terminal lifetime with conversations.

Exit: shell commands survive switching chats; stop/close semantics are explicit; process trees and output backpressure behave on Windows/macOS.

### 6. Full IDE integration

Package code-server behind the IDE adapter. Validate concurrent project workbenches on a shared local server, using per-workspace servers if correctness requires it. Add default IDE tabs for folder projects, editor context bridge, Git review, compatible extensions/tasks/debugging, MQL editing, and safe dirty-buffer reconciliation.

Exit: full IDE works on native Windows/macOS without replacing independent browser/chat/terminal ownership. Capture process-tree memory and extension compatibility results before claiming lightweight IDE hosting.

### 7. Lifecycle, performance, and distribution

Complete memory policies, safe discard/suspension, transcript virtualization, recovery, orphan cleanup, signed installers, updates, and clean-install tests. Improve measurements throughout implementation rather than delaying all performance work until this checkpoint.

Exit: resource limits hold under realistic workloads, active work is protected, recovery limitations are clear, and supported platform installers pass end-to-end tests.

First milestone: start a Codex conversation, open an independent browser, attach its page to chat, and switch conversations without losing the browser. Live browser operation follows as checkpoint 4. The full IDE remains a committed later capability.

## 12. Scope boundaries and unresolved decisions

Committed product direction: independent app with a full hosted Code OSS-based IDE, multiple projects, folder-backed IDE default, conversation history navigation, new-chat outer tabs, tool launcher, and chat on every surface.

Engineering decisions still requiring prototypes: native code-server packaging, concurrent project clients on a shared backend, safe backend session cleanup, bridge extension completeness, extension compatibility, and actual memory budgets. code-server is the selected initial dependency; OpenVSCode Server remains an adapter alternative if specific evidence warrants it. These are implementation uncertainties, not requests to weaken the product requirements.

Defer cloud sync, collaboration, mobile, remote environments, arbitrary plugin hosting, simultaneous duplicate workbench views, and broad provider support. Keep adapter boundaries ready, but complete the local Windows/macOS workflow first.

The alpha's defining test: open a folder-backed MQL project, edit a file in the full IDE, open standalone documentation and terminal tabs, start chats from the sidebar and each tool, switch between projects and conversations, and retain the work independently of the conversations.

# Provider connectors

## Standalone Codex runtime

Codex now resolves the platform binary from the pinned `@openai/codex` dependency (0.169.0), supporting Windows/macOS/Linux x64 and arm64. It does not discover Codex Desktop or fall back to PATH. `DAO_CODEX_PATH` can explicitly select an absolute standalone executable. Missing optional platform packages produce a connection error instead of selecting another runtime.

The launch follows T3's shared, lazy app-server mechanism: one JSONL subprocess, initialize/initialized handshake, multiple native threads, request routing and disposal. Reviewed sources: [CodexAdapterV2](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts) and [CodexProvider](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/CodexProvider.ts). This is an implementation of that protocol pattern, not a copy of T3's Effect-based adapter.

Read only and Workspace write retain their native sandbox modes with on-request approvals; Full access remains an explicit user choice. Existing command/file approval UI and browser group scoping remain in place. No runtime failure automatically escalates permissions.

On Windows, launch CODET-ADE from Explorer (or an ordinary terminal), not as a child of Codex Desktop's registered Core process. The connector rejects an inherited registered-Core context with an actionable error; it does not strip identity flags or disable sandbox checks. Default Codex home/account configuration remains available; this change does not copy credentials or change global Codex configuration. Release packaging must include the platform dependency outside ASAR along with its vendor directory.

Verified on 2026-11-17: build/typecheck passed; app restarted from Windows Explorer; running app-server executable resolved inside CODET-ADE's `@openai/codex-win32-x64` dependency. A manual Read only chat executed PowerShell `Get-Location` successfully in the selected project folder without escalation. Write approval paths were preserved by source inspection, not exercised with file mutations. macOS runtime launch has not been verified on a Mac.

CODET-ADE keeps the existing Codex app-server adapter and adds an ACP v1 client for Claude, Cursor, OpenCode, Gemini, and custom local ACP commands. Settings > Providers configures executable paths, literal arguments, encrypted environment overrides, optional model IDs, connection status and sign-in. Provider/model selection is per conversation. Processes start lazily and are shared per provider instance; saved projects do not start processes.

The bundled Claude adapter uses the official Claude Agent SDK. Claude sign-in runs its bundled CLI login flow, displaying output and accepting a returned code when requested. Cursor/OpenCode/Gemini require their installed CLI and account; terminal-only authentication should be completed in the agent CLI. This implementation does not install those CLIs automatically.

Supported ACP features: model and effort discovery, extra select options, streaming assistant text, collapsible tool activity, plans, native session load when advertised, continuation context when switching agents, cancellation, approval prompts, images when advertised, text attachments, provider slash commands, Cursor questions and plan approval. Agent filesystem/terminal tools remain agent-owned. Plan mode requires an advertised plan/read-only mode; it is not an OS sandbox. Ask permission forwards approval requests; full access allows requests once. Agent-native policies also apply.

The browser bridge runs on loopback with a random per-conversation bearer token. Its stdio MCP proxy exposes the same scoped browser tool as Codex, including screenshots and group tab switching. No attached group means no MCP server; changing attachment creates a new native session. Calls require an active turn and current group binding. An ACP agent must support client-supplied MCP servers to use this bridge.

Scope differences from T3: no ACP v2 preview, registry installation, native-session browsing/import, provider usage accounting or checkpoint/rollback integration. Native Cursor MCP configuration may be required if its installed CLI ignores client-supplied MCP servers. Credentials and CLI availability must be configured per machine; Windows and macOS builds share the connector code.

References (reviewed 2026-11-17):
- T3 provider architecture and local command behavior: https://github.com/pingdotgg/t3code/blob/main/docs/user/providers-acp.md
- T3 license: https://github.com/pingdotgg/t3code/blob/main/LICENSE (MIT, T3 Tools Inc.). This implementation follows the documented integration pattern; no T3 source was copied.
- Claude adapter: https://github.com/zed-industries/claude-agent-acp
- Cursor ACP: https://cursor.com/docs/cli/acp
- OpenCode ACP: https://opencode.ai/docs/cli/acp
- Gemini ACP: https://geminicli.com/docs/cli/acp-mode/

Verification: TypeScript/build checks and manual app/provider connection inspection. No tests or test scripts added. Authenticated model turns require the user's provider login and have not been verified for every provider.

## Editor context and turn changes

The composer can follow the active editor, pin another editor tab in the same group, or detach editor context. A turn receives that selection at send time. Recorded turn diffs include a bounded snapshot in context; file/Git selections provide the path and comparison type for agent tools.

New turns capture a bounded text baseline, then accept only completed Codex fileChange patches or completed ACP diff events as attribution evidence. Only successfully reconstructed provider patches appear in Agent changes. Whole-workspace end-of-turn differences are never attributed to the agent. Shell writes, providers without diff evidence, renames, unsupported patch forms, binary/oversized files and patches that cannot apply to the baseline are not labeled as agent edits. Legacy time-window records are excluded from the UI and preserved in turn-changes.json.legacy.

The expandable file list shows net added/removed line counts per file and turn. Review opens an immutable Agent edits comparison. Outside this turn compares that reconstructed result with current disk content (or the pre-turn result after a revert), in amber/purple; it identifies differences outside the recorded turn, not the identity of their author.

Each file can be reverted separately. Revert applies only the inverse agent patch, preserves unrelated later edits when context matches, and refuses overlaps, unsaved editor changes, or unsafe create/delete replacements. Reverted files are marked individually, announced in chat and included in subsequent provider prompts. UTF-8 text capture limits remain 2 MiB per file and 64 MiB per baseline. Baselines are in memory until completion; abrupt app shutdown cannot recover a running turn.

Codex now exposes dao_edit_file for exact before/after write-time attribution, with per-edit approval when the chat is read-only. Existing native threads are renewed once to install the tool. Instructions direct Codex away from shell writes; shell edits without patch evidence remain unattributed. Turn diff notifications provide additional patch evidence. The change card is available during a turn, with approve/revert enabled after completion. Approve acknowledges and keeps an already-applied file edit; it does not stage or commit it. Review separates agent edits, pre-agent Git/index differences and later disk differences. Singleton tab groups dissolve while preserving their remaining tab and conversation binding.

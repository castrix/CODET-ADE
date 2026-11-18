# Editor integration

The full code-server workbench is replaced by a lazy-loaded Monaco pane. Existing IDE tabs reopen as editor tabs; no migration of conversations or project ownership is needed. No code-server process is launched. The old downloaded `.runtime` files and old code-server user settings are unused and preserved on disk.

## Available

- File tree inside the editor, expandable folders, open file tabs, create files/folders, rename and OS trash. The main sidebar remains project/conversation navigation.
- Ctrl+P searches paths across folder projects and opens results in the owning project editor. Search is breadth-first, bounded to 15,000 entries and 60 results per project; dependency/build directories and links are skipped.
- Monaco editing, Ctrl+S, dirty indicators, retained buffers when switching outer tabs, unsaved-change confirmation on close/quit, disk revision check before overwrite. UTF-8 and BOM-marked UTF-16 encodings are preserved; binary/invalid UTF-8 files are rejected; 2 MB file limit.
- Bundled TypeScript/JavaScript language server over private stdio IPC: completion, hover, definition and diagnostics. It starts for supported open files and stops when the editor or its last file closes. No language-server HTTP listener. Other languages receive syntax highlighting, not semantic support. MQL5 currently uses C++ highlighting; no MQL5 server is bundled.
- Git branch/status, staged and working-tree Monaco diffs, stage/unstage and commit staged changes. Requires Git on PATH. No automatic staging, commit, push or destructive reset.
- Codex chat beside the editor, using existing project-folder permissions. It does not yet receive unsaved editor buffers or selections automatically.

## Boundaries

File operations resolve paths inside the chosen project and reject escaping symlinks. Open buffers are in memory, not crash recovery backups. External changes are caught at save time; refresh/reopen is explicit. File tree and Git refresh are manual. Git diff decoding currently targets UTF-8 text. No VS Code extension host, debugger or workbench is loaded.

Sources: [Monaco](https://github.com/microsoft/monaco-editor), [TypeScript language server](https://github.com/typescript-language-server/typescript-language-server).

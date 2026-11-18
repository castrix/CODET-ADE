# Standalone terminals

Use the terminal button in the top bar or Open terminal on the new-tab page. Choose a shell and open it. Windows discovers Windows PowerShell, PowerShell 7 on PATH, Command Prompt, WSL default and installed distributions. macOS/Linux discover the login shell plus available zsh/bash/sh profiles. WSL starts in the project folder via --cd, or its home directory when no folder is selected.

The host uses node-pty (ConPTY on Windows); the lazily loaded renderer uses xterm.js and its fit addon. Interactive input, ANSI colors, resize, scrolling, copy/paste, interrupt keys, Stop and Restart are supported. Shell shortcuts take precedence while terminal input is focused. Ctrl+Shift+C/V copies/pastes terminal text.

A terminal is an independent work tab with optional chat beside it. Choosing another profile and pressing New terminal creates another tab in the same group without replacing the current process. Switching tabs keeps the PTY and screen state. Closing a terminal ends its process; closing the app ends its live shells. Tab/profile metadata survives app restarts, but shell processes and scrollback do not. Saved terminal tabs start lazily when visited. Host output is batched and buffered up to 1 MB; renderer scrollback is limited to 5,000 lines.

Chat beside the terminal retains project context. It does not automatically receive or control the interactive terminal's input/output. Provider-native command tools remain separate.

Verification: production build passed; manually opened PowerShell in the project folder, entered an echo command, and observed its output. The shell picker showed PowerShell 7, Windows PowerShell, Command Prompt, WSL default, Ubuntu and the installed Podman distribution. Other shells and provider connections were not exercised. No tests were added.

References: https://github.com/microsoft/node-pty and https://xtermjs.org/

## Bottom panel

The bottom status-bar Terminal button and Ctrl+backtick toggle a resizable terminal panel below the current work area. It has per-project sessions, multiple terminal selectors, a new-session button, and a hide control. Hiding the panel preserves the running processes and screen state. The terminal toolbar retains the shell picker; New terminal creates another session in the panel. Standalone terminal tabs remain available from the top toolbar and new-tab page.
`nFolder-backed chat tabs now route the terminal toolbar button, status-bar button and Ctrl+backtick to the right-hand project-tools panel. Files and Git toggles are available there. Chat terminal sessions are scoped to that chat tab and remain independent of turns. The bottom panel remains available in other workspace views.

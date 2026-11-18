# DAO ADE project instructions

## Implementation and verification

- Do not write tests for this project unless the user explicitly requests them. This includes unit tests, integration tests, end-to-end tests, and automated smoke-test scripts.
- Do not add test frameworks, test dependencies, or test scripts as part of ordinary implementation.
- Prioritize implementing the requested product behavior. Do not become preoccupied with testing or spend repeated cycles broadening verification after the change works.
- Use brief, relevant build/type checks or manual inspection when needed to catch obvious issues. Do not repeat them without a concrete change, failure, or unresolved issue that warrants it.
- Report what actually works and any material limitations honestly. Do not claim validation that was not performed.
- After making app changes, build as needed, restart DAO ADE, and confirm its window is open with the updated build. Do not leave restarting to the user. Close gracefully to preserve workspace state; if an active run or unsaved input prevents a safe restart, explain the blocker.

## Product priorities

- Build the independent app foundation, Codex chat, and browser first.
- Add browser–agent control and standalone terminals next; the editor uses Monaco, local language servers, a filesystem explorer and Git instead of code-server.
- Projects, tabs, browsers, and terminals have lifetimes independent of conversations.
- Keep inactive resources lightweight and avoid starting an IDE or provider process per saved project or historical chat.
- Follow `docs/architecture-plan.md` for the product model, subject to the user's latest instructions and these project rules.

## Input focus styling

- Do not add outlines, focus borders, or focus rings/shadows directly to inputs, textareas, or selects.
- Show keyboard/input focus with a soft box-shadow on the containing wrapper using `:focus-within`. Preserve a visible focus indication; do not simply remove it.
- Apply this rule to every new or edited form, composer, and inline message editor.

## Design system and controls

- Use [Vercel Design / Geist](https://vercel.com/design) and [BoardUI](https://www.boardui.com/) patterns whenever possible for application UI. Follow `docs/design-system.md` and the shared theme tokens; dark mode is the default.
- Prefer styled, accessible dropdown panels, menus, dialogs, pickers, and other app controls over native browser selects or native OS menus. Include keyboard navigation, visible focus, Escape dismissal, and appropriate accessible names and roles.
- Keep native UI for OS integration where appropriate, such as file/folder dialogs, system screen sharing, and operating-system authentication. Do not replace working OS integration just for visual consistency.

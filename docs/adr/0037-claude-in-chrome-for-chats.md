# 0037 — Project chats may use Claude in Chrome, behind a switch

- **Status:** Accepted; approval rules amended by 0038
- **Date:** 2026-10-23
- **Decided by:** Meddy

## Context

Cherry runs Claude through the Agent SDK with `settingSources: []` (ADR-0004) and only its own
`cherry` MCP server, so the CLI's built-in Claude in Chrome tools (`mcp__claude-in-chrome__*`)
never loaded. Claude could not open the app it built, click through it or read the console.
A spike on 2026-10-23 showed that `extraArgs: { chrome: null }` (the CLI's `--chrome`) gives the
session every Chrome tool with `settingSources` still empty, and that without the flag the tools
stay off. Chrome is the user's real browser, signed in to their accounts, so it needs tighter
rules than file edits.

## Options

1. **Always on** — Trade-off: every chat and agent can drive the user's browser.
2. **A switch for project chats; agents, scans, Magnet and calibration never** — Trade-off: an
   agent cannot check its work in a browser.
3. **Leave it off; use the agent-browser CLI only** — Trade-off: a separate browser without the
   user's sign-ins, and one more install.

## Decision

We chose **2**. `config.json` gets `claude.chrome` (default `false`), set in Settings → General
→ Claude in Chrome. When it is on, project chats pass `--chrome` and a short prompt rule (work in
a new tab, leave other tabs alone, never submit payments, passwords or messages). Every other
Claude session passes `--no-chrome`.

Approvals (`packages/shared/src/chrome.ts`):

- Reads (`tabs_context_mcp`, `read_page`, `get_page_text`, `find`, console, network, browser
  list) behave like any other tool: an approval card in Ask, no card in Auto.
- Actions (navigate, click, type, form input, tabs, GIF, shortcuts) ask in every mode, also in
  Auto. **Allow for this session** covers the same tool for the rest of the session.
- `javascript_tool`, `file_upload` and `upload_image` ask every time; the card has no
  **Allow for this session**.

## Consequences

- Good: Claude can open the app on localhost and check its own work, with the user watching.
- Good: background agents in Auto (ADR-0028) can never touch the browser.
- Bad / cost: many approval cards while Claude clicks around; Allow for this session helps.
- Bad / cost: page content Claude reads goes to Anthropic like any file Claude reads.
- Follow-up: needs the Claude in Chrome extension connected; Cherry does not check for it.
